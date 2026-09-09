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

/** Makes a management request and turns every expected failure into a ManagementResult. */
async function call<T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
  read: (body: unknown) => T,
): Promise<ManagementResult<T>> {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(MANAGEMENT_TIMEOUT_MS),
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
      return { ok: false, reason: 'unreachable', message: `No response within ${MANAGEMENT_TIMEOUT_MS} ms.` };
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

export function cleanPartial(baseUrl: string, packageId: string): Promise<ManagementResult<void>> {
  return call(baseUrl, '/v1/ui/models/clean-partial', json({ id: packageId }), () => undefined);
}
