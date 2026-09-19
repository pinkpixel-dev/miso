import { Agent, fetch as undiciFetch } from 'undici';
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

/**
 * The model management surface, which needs the server started with
 * --ui-management. Without it these routes refuse, and that refusal is a state
 * Miso renders rather than an error it throws.
 *
 * These are quick metadata calls (start a job, poll its status, stop it, delete
 * a package), not the download itself, which runs on the server in the
 * background. They still share the server process with that download, so they
 * get more headroom than the health check but nowhere near a generation
 * budget: 10 seconds is enough for a JSON round trip even while the server is
 * busy streaming gigabytes to disk.
 */
const MANAGEMENT_TIMEOUT_MS = 10_000;

export type ManagementResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'management_disabled' | 'unreachable' | 'error'; message: string };

export interface PackageSizeReport {
  scanning: boolean;
  packages: { id: string; bytes: number | undefined; installed: boolean }[];
}

export interface InstallReport {
  /** False when the server has no record of this job, which is the restart case. */
  known: boolean;
  finished: boolean;
  failed: boolean;
  phase: string | undefined;
  downloadedBytes: number | undefined;
  totalBytes: number | undefined;
  message: string | undefined;
}

/**
 * Makes a request and turns every expected failure into a ManagementResult.
 *
 * The timeout is a parameter because the two kinds of call on this boundary are
 * nothing alike. A metadata call that takes ten seconds is broken; a model load
 * that takes ten seconds is normal.
 */
async function call<T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
  read: (body: unknown) => T,
  timeoutMs: number = MANAGEMENT_TIMEOUT_MS,
): Promise<ManagementResult<T>> {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json', ...init.headers },
    });

    // 403 is the confirmed live response for a server started without --ui-management.
    // 404 is treated the same defensively (a route that does not exist reads the same
    // to a caller as one that refuses), but that case is unconfirmed against a real
    // server.
    if (response.status === 403 || response.status === 404) {
      return {
        ok: false,
        reason: 'management_disabled',
        message: 'This server was started without --ui-management, so it cannot manage models.',
      };
    }

    if (!response.ok) {
      return { ok: false, reason: 'error', message: `The server answered with HTTP ${response.status}.` };
    }

    return { ok: true, value: read(await response.json()) };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, reason: 'unreachable', message: `No response within ${timeoutMs} ms.` };
    }
    if (error instanceof TypeError) {
      return { ok: false, reason: 'unreachable', message: `Could not reach ${baseUrl}.` };
    }
    return { ok: false, reason: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

function json(body: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } };
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Normalizes the package-sizes payload. Field names come from the Task 1 fixtures:
 * top-level `state` ("running" while the scan is in flight, "complete" once done)
 * and `data`, an array of entries carrying `id`, `size_bytes` (null while scanning),
 * and `installed`.
 */
function readPackageSizes(body: unknown): PackageSizeReport {
  const root = (body ?? {}) as Record<string, unknown>;
  const entries = Array.isArray(root.data) ? root.data : [];

  return {
    scanning: root.state === 'running',
    packages: entries.flatMap((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      const id = str(row.id);
      if (!id) return [];
      return [{ id, bytes: num(row.size_bytes), installed: row.installed === true }];
    }),
  };
}

/**
 * Normalizes the install / install-status payload. Field names come from the
 * Task 1 fixtures, corrected after a real recorded failure (Task 5 review):
 * `state` is "idle" | "queued" | "running" | "complete" | "failed", `exit_code`
 * is -1 until the job finishes and 0 on success, and `progress_percent` is -1
 * both for a job the server never started AND for a real failure (a gated
 * package refused by Hugging Face never got a percent at all), so it cannot
 * tell those two apart on its own. `state:"idle"` is the reliable signal for
 * "no record of this job"; a real failure reports `state:"failed"` directly,
 * not `state:"complete"` with a non-zero exit_code as first assumed. Both are
 * treated as failed here, since a "complete" job with a non-zero exit_code may
 * still exist for other failure modes even though only "failed" is confirmed.
 */
function readInstallStatus(body: unknown): InstallReport {
  const row = (body ?? {}) as Record<string, unknown>;
  const state = str(row.state);
  const known = state !== 'idle';

  return {
    known,
    finished: state === 'complete' || state === 'failed',
    failed: state === 'failed' || (state === 'complete' && row.exit_code !== 0),
    phase: state,
    downloadedBytes: known ? num(row.downloaded_bytes) : undefined,
    totalBytes: known ? num(row.total_bytes) : undefined,
    message: str(row.message),
  };
}

export function fetchPackageSizes(baseUrl: string): Promise<ManagementResult<PackageSizeReport>> {
  return call(baseUrl, '/v1/ui/models/package-sizes', { method: 'GET' }, readPackageSizes);
}

export function startInstall(baseUrl: string, packageId: string): Promise<ManagementResult<void>> {
  return call(baseUrl, '/v1/ui/models/install', json({ id: packageId }), () => undefined);
}

export function fetchInstallStatus(baseUrl: string, packageId: string): Promise<ManagementResult<InstallReport>> {
  const query = `?id=${encodeURIComponent(packageId)}`;
  return call(baseUrl, `/v1/ui/models/install-status${query}`, { method: 'GET' }, readInstallStatus);
}

export function stopInstall(baseUrl: string, packageId: string): Promise<ManagementResult<void>> {
  return call(baseUrl, '/v1/ui/models/install/stop', json({ id: packageId }), () => undefined);
}

export function deletePackage(baseUrl: string, packageId: string): Promise<ManagementResult<void>> {
  return call(baseUrl, '/v1/ui/models/delete', json({ id: packageId }), () => undefined);
}

/**
 * Removes the staging directories a stopped download left behind.
 *
 * The count only exists inside the server's human message ("Cleaned 2 partial
 * download directories for <id>"), confirmed against a live server: the JSON
 * carries `cleaned:true` whether it removed two directories or none. Reading a
 * number out of prose is fragile, so a message that does not match reports an
 * unknown count rather than a wrong one.
 */
export function cleanPartial(baseUrl: string, packageId: string): Promise<ManagementResult<number | undefined>> {
  return call(baseUrl, '/v1/ui/models/clean-partial', json({ id: packageId }), (body) => {
    const message = str((body as Record<string, unknown> | null)?.message);
    const found = message?.match(/cleaned\s+(\d+)\s+partial/i);
    return found ? Number(found[1]) : undefined;
  });
}

/**
 * Generation, staging, and model residency.
 *
 * These share the boundary rule above: nothing outside this file knows the
 * route names or the field spellings. The shapes below were confirmed against
 * ghcr.io/0xshug0/audio.cpp:full-cuda13 on September 11, 2026, and the
 * responses are recorded in ./fixtures.
 *
 * Timeouts here are nothing like the management ones. A 20 second track took
 * 40 seconds to generate on a 4090 laptop including the weight load, so a four
 * minute song at higher settings can run for many minutes and the budget has to
 * assume the slow case rather than the measured one.
 */

/** Loading 6 GB of weights off a cold page cache is the slow case here. */
const LOAD_TIMEOUT_MS = 10 * 60 * 1000;

/** A ceiling, not an expectation. Miso's queue is what makes waiting bearable. */
const RUN_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * The dispatcher a run uses, because `AbortSignal` is not the only clock.
 *
 * Node's fetch is undici underneath, and undici applies its own header and body
 * timeouts that default to 300 seconds. They are enforced whatever
 * `AbortSignal.timeout` says: a request to a server that simply sleeps dies at
 * 301.8 s with `TypeError: fetch failed`, cause `UND_ERR_HEADERS_TIMEOUT`, on a
 * signal set to an hour. Measured 2026-09-19, Node 22.22.2.
 *
 * audio.cpp sends no response headers until a task is completely finished, so
 * the whole run counts against that limit. Separating a 171 second take with
 * BS-RoFormer already takes 285 seconds, which clears the cliff by fifteen
 * seconds, and a three minute song does not clear it at all. The 300 seconds
 * was never a Miso decision and it cannot be seen from the call site, which is
 * what made it expensive to find.
 *
 * Zero disables both. `RUN_TIMEOUT_MS` above is then the only clock, which is
 * the one a person can reason about.
 *
 * This is also why the run below calls undici's own `fetch` rather than the
 * global one. Node's global fetch is a separate internal copy of undici, and
 * handing it an `Agent` built from the installed package is refused with
 * `UND_ERR_INVALID_ARG`. The dispatcher and the fetch have to come from the
 * same copy. Every other call in this file stays on the global fetch, where the
 * 300 second default has never been close to a problem.
 */
const runDispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

/** A 200 MB source file over a LAN to a NAS. */
const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

export interface RegisteredModel {
  id: string;
  family: string;
  task: string;
  /** False for a model the server knows about but has unloaded from memory. */
  loaded: boolean;
  path: string;
}

export interface TaskResult {
  /** Base64 PCM16 WAV, exactly as the server sent it. */
  audio: string;
  sampleRate: number | undefined;
  channels: number | undefined;
  /** Named outputs, for the stem routes in phase 6. Empty for a single result. */
  namedOutputs: { id: string; audio: string }[];
}

/**
 * Why a task request did not return audio.
 *
 * `busy` is the one the queue treats as temporary: the server refuses new work
 * with a 503 while it is mid-inference, and the right answer is to wait and ask
 * again rather than to fail the job.
 */
export type RunFailure = 'busy' | 'unknown_model' | 'unreachable' | 'error';

export type RunResult =
  | { ok: true; value: TaskResult }
  | { ok: false; reason: RunFailure; message: string };

/** Reads the server's own error wording out of its error envelope. */
function errorMessage(body: unknown, fallback: string): string {
  const error = (body as { error?: { message?: unknown } } | null)?.error;
  return typeof error?.message === 'string' && error.message !== '' ? error.message : fallback;
}

/**
 * Where the server keeps installed packages.
 *
 * The route is /v1/ui/models-root, not under /v1/ui/models/ like the rest of
 * the management surface. It answers with the active root and the default,
 * which are the same path unless the server was started with an override.
 */
export function fetchModelsRoot(baseUrl: string): Promise<ManagementResult<string>> {
  return call(baseUrl, '/v1/ui/models-root', { method: 'GET' }, (body) => {
    const root = str((body as Record<string, unknown> | null)?.models_root);
    if (!root) throw new Error('The server did not report a models root');
    return root;
  });
}

/**
 * Every model the server has registered, loaded or not.
 *
 * A registration outlives an unload: unloading frees the weights and leaves the
 * entry behind with `loaded:false`. That is how Miso can unload everything
 * without losing the paths it would need to load them again.
 */
export function fetchRegisteredModels(baseUrl: string): Promise<ManagementResult<RegisteredModel[]>> {
  return call(baseUrl, '/v1/models', { method: 'GET' }, (body) => {
    const entries = Array.isArray((body as { data?: unknown } | null)?.data)
      ? ((body as { data: unknown[] }).data)
      : [];

    return entries.flatMap((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      const id = str(row.id);
      if (!id) return [];
      return [
        {
          id,
          family: str(row.family) ?? '',
          task: str(row.task) ?? '',
          loaded: row.loaded === true,
          path: str(row.path) ?? '',
        },
      ];
    });
  });
}

export interface LoadRequest {
  /** Miso's name for this registration. Reused on every later request. */
  id: string;
  family: string;
  /** Absolute path on the server, including the GGUF variant directory. */
  path: string;
  /** The runtime task kind, never a spec task word. */
  task: string;
  sessionOptions?: Record<string, string>;
}

/**
 * Registers a model and loads its weights.
 *
 * Calling this for an id that already exists reconfigures it instead of
 * failing, which is how a job switches mem_saver on for a family that was
 * loaded without it.
 */
export function loadModel(baseUrl: string, request: LoadRequest): Promise<ManagementResult<void>> {
  const body = {
    id: request.id,
    family: request.family,
    path: request.path,
    task: request.task,
    mode: 'offline',
    ...(request.sessionOptions ? { session_options: request.sessionOptions } : {}),
  };

  return call(baseUrl, '/v1/models/load', json(body), () => undefined, LOAD_TIMEOUT_MS);
}

/** Frees a model's weights. The registration stays, so it can be loaded again. */
export function unloadModel(baseUrl: string, id: string): Promise<ManagementResult<void>> {
  return call(baseUrl, '/v1/models/unload', json({ id }), () => undefined, LOAD_TIMEOUT_MS);
}

/**
 * Uploads a file so a task can name it as source audio.
 *
 * This is what makes a remote backend work: audio.cpp never sees Miso's disk,
 * so the bytes travel over HTTP and the server answers with a path of its own.
 * There is no matching delete route, so Miso records what it staged and cleans
 * up itself.
 */
/**
 * Bytes already in memory are sent as bytes, never wrapped in a stream.
 *
 * `Readable.from(buffer)` yields the whole buffer as one chunk, and the upload
 * route caps how big a single chunk of a chunked request body may be. Eight
 * megabytes goes through, twelve is refused with `chunked request body: chunk
 * size exceeds the maximum`, and sixteen closes the connection. A 44.1 kHz
 * stereo take passes eight megabytes at about 47 seconds, so this is reachable
 * with ordinary material rather than a pathological case. Measured 2026-09-19.
 *
 * Passing the bytes themselves sets a content length and sends no chunked body
 * at all. A file on disk still streams, through `createReadStream`, which emits
 * 64 KB chunks and was never affected.
 */
export async function stageAudio(
  baseUrl: string,
  body: ReadableStream<Uint8Array> | Uint8Array,
  filename: string,
): Promise<ManagementResult<string>> {
  return call(
    baseUrl,
    '/v1/ui/upload',
    {
      method: 'POST',
      body,
      // Node needs this to stream a request body rather than buffer it. Ignored
      // for bytes, which are not streamed.
      duplex: 'half',
      headers: {
        'content-type': 'application/octet-stream',
        'x-audiocpp-filename': encodeURIComponent(filename),
      },
    } as RequestInit,
    (payload) => {
      const path = str((payload as Record<string, unknown> | null)?.path);
      if (!path) throw new Error('The server accepted the upload but did not return a path');
      return path;
    },
    UPLOAD_TIMEOUT_MS,
  );
}

/**
 * Runs one task and waits for the audio.
 *
 * Two things about this route are worth knowing before changing it. It loads a
 * registered model that is not resident, so a job never has to check first. And
 * it fills in a default for every field the request leaves out, including the
 * prompt, so a request object that is missing generates a track rather than
 * refusing. Send the whole request or none of it.
 */
export async function runTask(
  baseUrl: string,
  model: string,
  request: Record<string, unknown>,
): Promise<RunResult> {
  try {
    // undici's fetch, not the global one. See runDispatcher: without this a run
    // dies at 300 seconds whatever the signal says, and separation already
    // comes within fifteen seconds of that.
    const response = await undiciFetch(`${baseUrl}/v1/tasks/run`, {
      method: 'POST',
      body: JSON.stringify({ model, request }),
      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      dispatcher: runDispatcher,
    });

    if (response.status === 503) {
      return { ok: false, reason: 'busy', message: 'The server is already running a task.' };
    }

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const message = errorMessage(body, `The server answered with HTTP ${response.status}.`);
      const reason: RunFailure = message.includes('unknown model id') ? 'unknown_model' : 'error';
      return { ok: false, reason, message };
    }

    return { ok: true, value: readTaskResult(await response.json()) };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        ok: false,
        reason: 'unreachable',
        message: `The task did not finish within ${Math.round(RUN_TIMEOUT_MS / 60000)} minutes.`,
      };
    }
    // A transport timeout is not a backend that went away, and saying so sends
    // somebody to check a container that is running perfectly. Undici reports
    // both as TypeError, so the cause is the only thing that tells them apart.
    if (error instanceof TypeError) {
      const code = (error.cause as { code?: string } | undefined)?.code;
      if (code === 'UND_ERR_HEADERS_TIMEOUT' || code === 'UND_ERR_BODY_TIMEOUT') {
        return {
          ok: false,
          reason: 'error',
          message: 'The connection to the backend timed out while the task was still running.',
        };
      }
      return { ok: false, reason: 'unreachable', message: `Could not reach ${baseUrl}.` };
    }
    return { ok: false, reason: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

export function readTaskResult(body: unknown): TaskResult {
  const root = (body ?? {}) as Record<string, unknown>;
  const named = Array.isArray(root.named_audio_outputs) ? root.named_audio_outputs : [];

  const namedOutputs = named.flatMap((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    const id = str(row.id);
    const audio = str(row.audio);
    return id && audio ? [{ id, audio }] : [];
  });

  const audio = str(root.audio) ?? namedOutputs[0]?.audio;
  if (!audio) throw new Error('The server finished the task but returned no audio');

  return {
    audio,
    sampleRate: num(root.sample_rate),
    channels: num(root.channels),
    namedOutputs,
  };
}
