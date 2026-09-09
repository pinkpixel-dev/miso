import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from './migrate.ts';
import { activeInstalls, listInstalls, recordInstallStarted, updateInstall } from './installs.ts';

let handle: Database.Database;

beforeEach(() => {
  handle = new Database(':memory:');
  handle.pragma('foreign_keys = ON');
  migrate(handle);
});

describe('installs', () => {
  it('records a started install as running', () => {
    const row = recordInstallStarted(handle, 'ace_step_turbo_q8_0', 'http://backend');
    expect(row.state).toBe('running');
    expect(row.packageId).toBe('ace_step_turbo_q8_0');
    expect(row.startedAt).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('updates progress without losing the start time', () => {
    const started = recordInstallStarted(handle, 'pkg', 'http://backend');
    updateInstall(handle, 'pkg', 'http://backend', { downloadedBytes: 500, totalBytes: 1000, phase: 'download' });

    const row = listInstalls(handle, 'http://backend')[0];
    expect(row?.downloadedBytes).toBe(500);
    expect(row?.startedAt).toBe(started.startedAt);
  });

  it('restarts an install that had failed, clearing the old error', () => {
    recordInstallStarted(handle, 'pkg', 'http://backend');
    updateInstall(handle, 'pkg', 'http://backend', { state: 'failed', error: 'disk full' });

    const resumed = recordInstallStarted(handle, 'pkg', 'http://backend');

    expect(resumed.state).toBe('running');
    expect(resumed.error).toBeUndefined();
    expect(resumed.downloadedBytes).toBeUndefined();
  });

  it('keeps installs from different backends apart', () => {
    recordInstallStarted(handle, 'pkg', 'http://one');
    recordInstallStarted(handle, 'pkg', 'http://two');

    expect(listInstalls(handle, 'http://one')).toHaveLength(1);
    expect(listInstalls(handle, 'http://two')).toHaveLength(1);
  });

  it('lists only running installs as active, across every backend', () => {
    recordInstallStarted(handle, 'a', 'http://one');
    recordInstallStarted(handle, 'b', 'http://two');
    recordInstallStarted(handle, 'c', 'http://one');
    updateInstall(handle, 'c', 'http://one', { state: 'complete' });

    const active = activeInstalls(handle).map((r) => r.packageId).sort();
    expect(active).toEqual(['a', 'b']);
  });

  it('refuses a state the schema does not allow', () => {
    recordInstallStarted(handle, 'pkg', 'http://backend');
    expect(() =>
      updateInstall(handle, 'pkg', 'http://backend', { state: 'nonsense' as never }),
    ).toThrow();
  });
});
