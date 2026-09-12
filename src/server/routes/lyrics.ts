import { Hono, type Context } from 'hono';
import type { ApiError, LyricsDraft, PromptSuggestion } from '../../shared/types.ts';
import { readLyricsKey, readSettings } from '../db/settings.ts';
import { parseStudioState } from '../jobs/studioState.ts';
import { chat, type ChatEngine } from '../lyrics/client.ts';
import {
  ENHANCE_SYSTEM,
  LYRICS_SYSTEM,
  describeStudio,
  readLyrics,
  readPrompt,
} from '../lyrics/prompts.ts';

/**
 * The lyrics assistant.
 *
 * Both routes answer with a suggestion and change nothing. Applying it is the
 * person's decision, made in the browser, and the enhance route in particular
 * never replaces the prompt on a job: the job carries both, and which one was
 * sent is recorded rather than inferred.
 *
 * The call runs here rather than in the browser because the API key lives here.
 * A key in the client is a key in every phone the studio is opened from.
 */
export const lyricsRoutes = new Hono();

/** How long a description may be, which is generous for a sentence about a song. */
const MAX_DESCRIPTION = 2_000;

type Configured = { ok: true; engine: ChatEngine } | { ok: false; error: ApiError };

/**
 * The active engine, or what is missing from it.
 *
 * The message names the exact field to fill in, because "not configured" sends
 * somebody to a settings screen to work out which of five boxes is empty.
 */
function activeEngine(): Configured {
  const settings = readSettings();

  if (settings.lyricsEngine === 'local') {
    if (settings.lyricsLocalUrl === '') {
      return {
        ok: false,
        error: {
          error: 'The local lyrics server is not configured',
          detail: 'Add the address of your llama.cpp server in Settings.',
        },
      };
    }
    return {
      ok: true,
      engine: {
        url: settings.lyricsLocalUrl,
        model: settings.lyricsLocalModel === '' ? 'local-model' : settings.lyricsLocalModel,
        key: '',
      },
    };
  }

  const key = readLyricsKey();
  if (key === '' || settings.lyricsExternalModel === '') {
    return {
      ok: false,
      error: {
        error: 'The lyrics assistant is not configured',
        detail:
          key === ''
            ? 'Add an API key for your provider in Settings.'
            : 'Name the model to use in Settings, for example gpt-5-nano.',
      },
    };
  }

  return {
    ok: true,
    engine: { url: settings.lyricsExternalUrl, model: settings.lyricsExternalModel, key },
  };
}

async function readBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function readDescription(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'A description is required' };
  const text = raw.trim();
  if (text === '') return { ok: false, error: 'A description is required' };
  if (text.length > MAX_DESCRIPTION) {
    return { ok: false, error: `The description cannot be longer than ${MAX_DESCRIPTION} characters` };
  }
  return { ok: true, value: text };
}

/** Writes a lyric sheet, and a title for it, from a description of the song. */
lyricsRoutes.post('/lyrics/write', async (c) => {
  const engine = activeEngine();
  if (!engine.ok) return c.json<ApiError>(engine.error, 409);

  const body = await readBody(c);
  if (body === undefined) return c.json<ApiError>({ error: 'Request body must be JSON' }, 400);

  const { description, studio } = (body ?? {}) as { description?: unknown; studio?: unknown };

  const wanted = readDescription(description);
  if (!wanted.ok) return c.json<ApiError>({ error: wanted.error }, 400);

  const state = parseStudioState(studio);
  if (!state.ok) return c.json<ApiError>({ error: state.error }, 400);

  const answer = await chat(
    engine.engine,
    LYRICS_SYSTEM,
    describeStudio(state.value, wanted.value),
  );
  if (!answer.ok) {
    return c.json<ApiError>({ error: 'The lyrics could not be written', detail: answer.message }, 502);
  }

  return c.json<LyricsDraft>(readLyrics(answer.value));
});

/**
 * Offers a richer prompt for the song as the form stands.
 *
 * Run twice on the same form this gives two different prompts, which is the
 * cheapest way there is to get a second take on the same idea. That variation
 * comes from the provider's own default sampling, which every one of them sets
 * high enough. See the note in lyrics/client.ts on why nothing is sent.
 */
lyricsRoutes.post('/lyrics/enhance', async (c) => {
  const engine = activeEngine();
  if (!engine.ok) return c.json<ApiError>(engine.error, 409);

  const body = await readBody(c);
  if (body === undefined) return c.json<ApiError>({ error: 'Request body must be JSON' }, 400);

  const { prompt, studio } = (body ?? {}) as { prompt?: unknown; studio?: unknown };

  const wanted = readDescription(prompt);
  if (!wanted.ok) return c.json<ApiError>({ error: 'A prompt is required' }, 400);

  const state = parseStudioState(studio);
  if (!state.ok) return c.json<ApiError>({ error: state.error }, 400);

  const answer = await chat(
    engine.engine,
    ENHANCE_SYSTEM,
    describeStudio(state.value, wanted.value),
  );
  if (!answer.ok) {
    return c.json<ApiError>({ error: 'The prompt could not be expanded', detail: answer.message }, 502);
  }

  const suggestion = readPrompt(answer.value);
  if (suggestion === '') {
    return c.json<ApiError>({ error: 'The prompt could not be expanded', detail: 'The model answered with no text.' }, 502);
  }

  return c.json<PromptSuggestion>({ original: wanted.value, suggestion });
});
