import { Link } from 'react-router-dom';
import type { Asset } from '../../../shared/types.ts';
import { remixPath } from '../../lib/routes.ts';
import { formatSeconds } from '../../lib/region.ts';

/**
 * Which take to work from.
 *
 * The remix page takes the full width, so the takes column is not on screen
 * beside it and this page has to offer the list itself. Each row is a link
 * rather than a button, because choosing a source changes the address: the URL
 * then says what you are editing, and the back button works.
 *
 * The remix page puts an import zone directly above this, for the same reason:
 * the takes column normally carries one and this route does not have it. The
 * empty state below says "above" and depends on that, so the two move together.
 */
export function SourcePicker({
  projectId,
  assets,
  loading,
}: {
  projectId: string;
  assets: Asset[];
  loading: boolean;
}) {
  if (loading && assets.length === 0) {
    return <p className="text-sm text-ink-muted">Loading this project.</p>;
  }

  if (assets.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-ink-muted">
          There is nothing to remix in this project yet. Import a track above, or generate one
          on the project page.
        </p>
        <Link
          to={`/projects/${encodeURIComponent(projectId)}`}
          className="self-start text-sm text-accent underline underline-offset-4 hover:no-underline"
        >
          Back to the project
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">Choose the take you want to work from.</p>

      <ul className="flex flex-col gap-2">
        {assets.map((asset) => (
          <li key={asset.id}>
            <Link
              to={remixPath(projectId, asset.id)}
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3.5 py-2.5 transition-colors duration-150 hover:border-line-strong hover:bg-raised/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{asset.label}</span>
              <span className="shrink-0 text-xs text-ink-faint">
                {asset.durationSeconds === undefined
                  ? 'length unknown'
                  : formatSeconds(asset.durationSeconds)}
                {' · '}
                {asset.format}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
