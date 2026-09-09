import { describe, expect, it } from 'vitest';
import type { InstallReport } from '../audiocpp/client.ts';
import { nextInstallProgress } from './state.ts';

function report(patch: Partial<InstallReport> = {}): { ok: true; value: InstallReport } {
  return {
    ok: true,
    value: {
      known: true,
      finished: false,
      failed: false,
      phase: 'download',
      downloadedBytes: 100,
      totalBytes: 1000,
      message: undefined,
      ...patch,
    },
  };
}

describe('nextInstallProgress', () => {
  it('keeps a running install running and carries progress across', () => {
    expect(nextInstallProgress(report())).toEqual({
      state: 'running',
      phase: 'download',
      downloadedBytes: 100,
      totalBytes: 1000,
    });
  });

  it('completes a finished install', () => {
    expect(nextInstallProgress(report({ finished: true })).state).toBe('complete');
  });

  it('fails with the message the server gave', () => {
    const next = nextInstallProgress(report({ failed: true, message: 'checksum mismatch' }));
    expect(next.state).toBe('failed');
    expect(next.error).toBe('checksum mismatch');
  });

  it('fails with a usable sentence when the server gave no message', () => {
    const next = nextInstallProgress(report({ failed: true, message: undefined }));
    expect(next.state).toBe('failed');
    expect(next.error).toMatch(/\S/);
  });

  it('marks a job the server has forgotten as interrupted', () => {
    const next = nextInstallProgress(report({ known: false }));
    expect(next.state).toBe('interrupted');
    expect(next.error).toMatch(/restart/i);
  });

  it('marks an install interrupted when management is switched off underneath it', () => {
    expect(nextInstallProgress({ ok: false, reason: 'management_disabled' }).state).toBe('interrupted');
  });

  it('leaves the row alone when the backend is only unreachable', () => {
    expect(nextInstallProgress({ ok: false, reason: 'unreachable' })).toEqual({});
  });

  it('prefers finished over failed when a report claims both', () => {
    expect(nextInstallProgress(report({ finished: true, failed: true })).state).toBe('complete');
  });
});
