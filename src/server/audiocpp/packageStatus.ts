import { fetchPackageSizes } from './client.ts';

/**
 * Live package sizes and installed state, cached.
 *
 * The first call to the backend starts a background scan and answers "running".
 * That answer is never cached, because the next call is how the scan finishes.
 * A completed scan is cached briefly so that opening the catalog on a phone and
 * a laptop at once does not scan twice.
 */

export type LiveStatus =
  | { kind: 'ready'; packages: { id: string; bytes: number | undefined; installed: boolean }[] }
  | { kind: 'scanning' }
  | { kind: 'unavailable'; reason: 'management_disabled' | 'unreachable' | 'error'; message: string };

const CACHE_MS = 30_000;

let cached: { baseUrl: string; at: number; status: LiveStatus } | undefined;

export function clearLiveStatusCache(): void {
  cached = undefined;
}

export async function getLiveStatus(baseUrl: string, now: number = Date.now()): Promise<LiveStatus> {
  if (cached && cached.baseUrl === baseUrl && now - cached.at < CACHE_MS) {
    return cached.status;
  }

  const result = await fetchPackageSizes(baseUrl);

  if (!result.ok) {
    // Nothing to cache. A backend that comes back should show up immediately.
    cached = undefined;
    return { kind: 'unavailable', reason: result.reason, message: result.message };
  }

  if (result.value.scanning) {
    cached = undefined;
    return { kind: 'scanning' };
  }

  const status: LiveStatus = { kind: 'ready', packages: result.value.packages };
  cached = { baseUrl, at: now, status };
  return status;
}
