import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLiveStatusCache, getLiveStatus } from './packageStatus.ts';
import * as client from './client.ts';

// vi.spyOn cannot redefine a live ESM binding on its own. Mocking with spy: true
// keeps the real implementation while making each export replaceable.
vi.mock('./client.ts', { spy: true });

afterEach(() => {
  clearLiveStatusCache();
  vi.restoreAllMocks();
});

describe('getLiveStatus', () => {
  it('reports scanning while the backend scan is running', async () => {
    vi.spyOn(client, 'fetchPackageSizes').mockResolvedValue({
      ok: true,
      value: { scanning: true, packages: [] },
    });
    expect(await getLiveStatus('http://backend', 1000)).toEqual({ kind: 'scanning' });
  });

  it('returns packages once the scan completes', async () => {
    vi.spyOn(client, 'fetchPackageSizes').mockResolvedValue({
      ok: true,
      value: { scanning: false, packages: [{ id: 'a', bytes: 10, installed: true }] },
    });
    expect(await getLiveStatus('http://backend', 1000)).toEqual({
      kind: 'ready',
      packages: [{ id: 'a', bytes: 10, installed: true }],
    });
  });

  it('does not call the backend again inside the cache window', async () => {
    const spy = vi.spyOn(client, 'fetchPackageSizes').mockResolvedValue({
      ok: true,
      value: { scanning: false, packages: [{ id: 'a', bytes: 10, installed: true }] },
    });

    await getLiveStatus('http://backend', 1000);
    await getLiveStatus('http://backend', 4000);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('calls again once the cache window passes', async () => {
    const spy = vi.spyOn(client, 'fetchPackageSizes').mockResolvedValue({
      ok: true,
      value: { scanning: false, packages: [] },
    });

    await getLiveStatus('http://backend', 1000);
    await getLiveStatus('http://backend', 1000 + 60_000);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('never caches a scanning answer', async () => {
    const spy = vi.spyOn(client, 'fetchPackageSizes').mockResolvedValue({
      ok: true,
      value: { scanning: true, packages: [] },
    });

    await getLiveStatus('http://backend', 1000);
    await getLiveStatus('http://backend', 1100);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('caches nothing when the backend is unavailable', async () => {
    const spy = vi.spyOn(client, 'fetchPackageSizes').mockResolvedValue({
      ok: false,
      reason: 'unreachable',
      message: 'nope',
    });

    const first = await getLiveStatus('http://backend', 1000);
    await getLiveStatus('http://backend', 1100);

    expect(first).toEqual({ kind: 'unavailable', reason: 'unreachable', message: 'nope' });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('drops the cache when the backend url changes', async () => {
    const spy = vi.spyOn(client, 'fetchPackageSizes').mockResolvedValue({
      ok: true,
      value: { scanning: false, packages: [] },
    });

    await getLiveStatus('http://one', 1000);
    await getLiveStatus('http://two', 1100);

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
