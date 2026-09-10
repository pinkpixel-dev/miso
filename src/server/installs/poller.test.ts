import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../audiocpp/client.ts';
import * as packageStatus from '../audiocpp/packageStatus.ts';
import { listInstalls, recordInstallStarted } from '../db/installs.ts';
import { migrate } from '../db/migrate.ts';
import { pollActiveInstalls } from './poller.ts';

vi.mock('../audiocpp/client.ts', { spy: true });
vi.mock('../audiocpp/packageStatus.ts', { spy: true });

let handle: Database.Database;

beforeEach(() => {
  handle = new Database(':memory:');
  migrate(handle);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function running(patch: Partial<client.InstallReport> = {}): client.InstallReport {
  return {
    known: true,
    finished: false,
    failed: false,
    phase: 'download',
    downloadedBytes: 10,
    totalBytes: 100,
    message: undefined,
    ...patch,
  };
}

describe('pollActiveInstalls', () => {
  it('writes progress for a running install', async () => {
    recordInstallStarted(handle, 'pkg', 'http://backend');
    vi.spyOn(client, 'fetchInstallStatus').mockResolvedValue({ ok: true, value: running() });

    await pollActiveInstalls(handle);

    const row = listInstalls(handle, 'http://backend')[0];
    expect(row?.state).toBe('running');
    expect(row?.downloadedBytes).toBe(10);
  });

  it('completes an install and stops treating it as active', async () => {
    recordInstallStarted(handle, 'pkg', 'http://backend');
    vi.spyOn(client, 'fetchInstallStatus').mockResolvedValue({ ok: true, value: running({ finished: true }) });

    await pollActiveInstalls(handle);
    const updated = await pollActiveInstalls(handle);

    expect(listInstalls(handle, 'http://backend')[0]?.state).toBe('complete');
    expect(updated).toBe(0);
  });

  it('marks a forgotten job interrupted', async () => {
    recordInstallStarted(handle, 'pkg', 'http://backend');
    vi.spyOn(client, 'fetchInstallStatus').mockResolvedValue({ ok: true, value: running({ known: false }) });

    await pollActiveInstalls(handle);

    expect(listInstalls(handle, 'http://backend')[0]?.state).toBe('interrupted');
  });

  it('leaves a running install alone while the backend is unreachable', async () => {
    recordInstallStarted(handle, 'pkg', 'http://backend');
    vi.spyOn(client, 'fetchInstallStatus').mockResolvedValue({
      ok: false,
      reason: 'unreachable',
      message: 'down',
    });

    await pollActiveInstalls(handle);

    expect(listInstalls(handle, 'http://backend')[0]?.state).toBe('running');
  });

  it('polls each active install against its own backend', async () => {
    recordInstallStarted(handle, 'a', 'http://one');
    recordInstallStarted(handle, 'b', 'http://two');
    const spy = vi.spyOn(client, 'fetchInstallStatus').mockResolvedValue({ ok: true, value: running() });

    await pollActiveInstalls(handle);

    expect(spy.mock.calls.map((c) => c[0]).sort()).toEqual(['http://one', 'http://two']);
  });

  it('does nothing when no install is active', async () => {
    const spy = vi.spyOn(client, 'fetchInstallStatus');
    expect(await pollActiveInstalls(handle)).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('drops the cached directory scan once an install settles', async () => {
    recordInstallStarted(handle, 'pkg', 'http://backend');
    const cleared = vi.spyOn(packageStatus, 'clearLiveStatusCache');
    vi.spyOn(client, 'fetchInstallStatus').mockResolvedValue({ ok: true, value: running({ finished: true }) });

    await pollActiveInstalls(handle);

    expect(cleared).toHaveBeenCalled();
  });

  it('keeps the cached directory scan while an install is still running', async () => {
    recordInstallStarted(handle, 'pkg', 'http://backend');
    const cleared = vi.spyOn(packageStatus, 'clearLiveStatusCache');
    vi.spyOn(client, 'fetchInstallStatus').mockResolvedValue({ ok: true, value: running() });

    await pollActiveInstalls(handle);

    expect(cleared).not.toHaveBeenCalled();
  });

  it('keeps polling the other installs when one status call throws', async () => {
    recordInstallStarted(handle, 'a', 'http://one');
    recordInstallStarted(handle, 'b', 'http://one');
    vi.spyOn(client, 'fetchInstallStatus').mockImplementation(async (_url, id) => {
      if (id === 'a') throw new Error('boom');
      return { ok: true, value: running({ finished: true }) };
    });

    await pollActiveInstalls(handle);

    const rows = listInstalls(handle, 'http://one');
    expect(rows.find((r) => r.packageId === 'b')?.state).toBe('complete');
    expect(rows.find((r) => r.packageId === 'a')?.state).toBe('running');
  });
});
