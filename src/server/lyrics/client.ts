/**
 * The one call Miso makes to a language model.
 *
 * Both engines speak the same protocol. llama.cpp's server implements
 * OpenAI-compatible chat completions, so an external provider and a local
 * server differ in a base URL, a model name, and whether there is a key. That
 * is a configuration difference, not a second client.
 *
 * This never runs on the GPU Miso is using for music. An external provider uses
 * somebody else's hardware, and a local llama.cpp server is a separate process
 * the person started themselves, which is the whole point of the split: an LLM
 * and a 13 GB music model do not both fit on a 16 GB card.
 */

/** Long enough for a slow local model on CPU, short enough to give up on a wrong address. */
const TIMEOUT_MS = 120_000;

export interface ChatEngine {
  /** OpenAI-compatible base URL, including the version path, no trailing slash. */
  url: string;
  model: string;
  /** Empty for a local server, which needs no key. */
  key: string;
}

export type ChatResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

interface Choice {
  message?: { content?: unknown };
}

/** Pulls the text out, whatever shape of nothing the server answered with. */
function readContent(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;

  const content = (choices[0] as Choice | undefined)?.message?.content;
  return typeof content === 'string' && content.trim() !== '' ? content : undefined;
}

/** The provider's own wording when it gives one, because it is more specific than ours. */
function readError(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null) return fallback;
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim() !== '') return message;
  }
  return fallback;
}

export async function chat(
  engine: ChatEngine,
  system: string,
  user: string,
  options: { temperature?: number } = {},
): Promise<ChatResult> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (engine.key !== '') headers.authorization = `Bearer ${engine.key}`;

  try {
    const response = await fetch(`${engine.url}/chat/completions`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: engine.model,
        temperature: options.temperature ?? 0.9,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // A provider that answered with HTML has already failed. The status is
      // the only thing left worth reporting.
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        message: readError(body, 'The lyrics provider refused the API key.'),
      };
    }

    if (response.status === 404) {
      return {
        ok: false,
        message: readError(
          body,
          `Nothing answered at ${engine.url}/chat/completions. Check the URL includes the version path.`,
        ),
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        message: readError(body, `The lyrics provider answered with HTTP ${response.status}.`),
      };
    }

    const content = readContent(body);
    if (content === undefined) {
      return { ok: false, message: 'The lyrics provider answered with no text.' };
    }

    return { ok: true, value: content };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        ok: false,
        message: `The lyrics provider did not answer within ${Math.round(TIMEOUT_MS / 1000)} seconds.`,
      };
    }
    if (error instanceof TypeError) {
      return { ok: false, message: `Could not reach ${engine.url}.` };
    }
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
