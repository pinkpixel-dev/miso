import { Link } from 'react-router-dom';
import type { BackendStatus } from '../../shared/types.ts';
import { Button } from './ui.tsx';

/**
 * Shown only when something is wrong. A healthy backend gets no banner, because
 * a permanent green bar teaches people to ignore the strip entirely.
 *
 * The library stays usable while the backend is down, since it lives in the
 * Miso service. Only generation is blocked.
 */
export function BackendBanner({
  status,
  checking,
  onRetry,
}: {
  status: BackendStatus | undefined;
  checking: boolean;
  onRetry: () => void;
}) {
  if (!status || status.reachable) return null;

  return (
    <div role="status" className="border-b border-bad/30 bg-bad/10">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Not connected to audio.cpp</p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {status.error ?? 'The server did not respond.'} Your library still works, but you cannot
            generate anything.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button onClick={onRetry} busy={checking}>
            {checking ? 'Checking' : 'Retry'}
          </Button>
          <Link
            to="/settings"
            className="inline-flex items-center rounded-md px-3.5 py-2 text-sm font-medium text-ink-muted transition-colors duration-150 hover:bg-raised hover:text-ink active:bg-raised/70"
          >
            Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
