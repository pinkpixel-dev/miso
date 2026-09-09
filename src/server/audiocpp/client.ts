import type { BackendStatus } from '../../shared/types.ts';

/**
 * The only module in Miso that knows audio.cpp exists.
 *
 * Everything else talks to the Miso service, and the service talks to audio.cpp
 * through here. That boundary is what lets the backend live on another machine,
 * and it is the single file to change if we later manage the container
 * ourselves or upstream adds an async job API.
 *
 * Two facts from phase 0 shape this file. Health checks must be quick and must
 * never hang the UI, so they get a short timeout. Generation requests take
 * minutes, so they will get their own much longer budget when phase 4 adds
 * them, never this one.
 */

/** What audio.cpp returns from GET /health. */
interface HealthResponse {
  status?: string;
  backend?: string;
  models?: number;
  ui?: boolean;
  ui_management?: boolean;
}

const HEALTH_TIMEOUT_MS = 4000;

/** Turns a fetch or abort failure into a sentence a person can act on. */
function describeFailure(error: unknown, url: string): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return `No response within ${HEALTH_TIMEOUT_MS} ms. The server may be starting, or busy loading a model.`;
  }
  if (error instanceof TypeError) {
    return `Could not reach ${url}. Check the address, and that the container is running.`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Checks whether the audio.cpp server at `baseUrl` is alive.
 *
 * Never throws. An unreachable backend is an expected state that the UI
 * displays, not an exception the caller has to handle.
 */
export async function checkHealth(baseUrl: string): Promise<BackendStatus> {
  const url = `${baseUrl}/health`;
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    const latencyMs = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      return {
        reachable: false,
        url: baseUrl,
        latencyMs,
        error: `Server answered with HTTP ${response.status}. Is this an audio.cpp server?`,
      };
    }

    // Something answered, but anything can answer with a 200. A web server or a
    // different app would otherwise surface as a raw JSON parse error.
    let body: HealthResponse;
    try {
      body = (await response.json()) as HealthResponse;
    } catch {
      return {
        reachable: false,
        url: baseUrl,
        latencyMs,
        error: 'Something answered, but it did not look like audio.cpp. Check the port.',
      };
    }

    if (body.status !== 'ok') {
      return {
        reachable: false,
        url: baseUrl,
        latencyMs,
        error: 'Reached a server, but it is not reporting a healthy audio.cpp instance.',
      };
    }

    return {
      reachable: true,
      url: baseUrl,
      latencyMs,
      backend: body.backend,
      models: body.models,
      managementEnabled: body.ui_management === true,
    };
  } catch (error) {
    return {
      reachable: false,
      url: baseUrl,
      error: describeFailure(error, baseUrl),
    };
  }
}
