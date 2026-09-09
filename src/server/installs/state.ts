import type { InstallReport } from '../audiocpp/client.ts';
import type { InstallProgress } from '../../shared/types.ts';

/**
 * One status report to the fields that change on the install row.
 *
 * Pure on purpose. This is where the phase 0 finding lives: audio.cpp drops
 * queued installs on restart without an error, so a job it no longer knows
 * about is interrupted rather than gone. A backend Miso simply cannot reach is
 * a different thing, and changes nothing, because the download may well still
 * be running.
 */
export function nextInstallProgress(
  report: { ok: true; value: InstallReport } | { ok: false; reason: string },
): Partial<InstallProgress> {
  if (!report.ok) {
    if (report.reason === 'management_disabled') {
      return { state: 'interrupted', error: 'This server can no longer manage models.' };
    }
    return {};
  }

  const status = report.value;

  if (status.finished) return { state: 'complete', phase: status.phase, downloadedBytes: status.downloadedBytes };

  if (status.failed) {
    return { state: 'failed', error: status.message ?? 'The server reported a failed install without saying why.' };
  }

  if (!status.known) {
    return {
      state: 'interrupted',
      error: 'The download stopped. The server restarts lose queued installs, so it can be resumed.',
    };
  }

  return {
    state: 'running',
    phase: status.phase,
    downloadedBytes: status.downloadedBytes,
    totalBytes: status.totalBytes,
  };
}
