import { Plus, Scissors } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Panel, cx } from '../components/ui.tsx';
import { createPath, remixPath } from '../lib/routes.ts';
import { useStudio } from '../lib/useStudio.ts';

/**
 * The project, at /projects/:id.
 *
 * Opening a project shows the project rather than a form. This page takes the
 * full width, because it carries its own list of takes and the takes column
 * beside the create form is that same list at a narrower scope.
 *
 * Stage 1 builds the frame and the way into the tools. The grouped sections,
 * the import zone, the queue and the take detail panel arrive in stage 3 of
 * DOCS/plans/2026-09-14-project-page.md.
 */

const toolLink = cx(
  'inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-raised px-3.5 py-2',
  'text-sm font-medium text-ink transition-colors duration-150',
  'hover:border-line-strong hover:bg-raised/70 active:bg-raised',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
);

export function ProjectRoute() {
  const { project, projectId, assets, loading, error } = useStudio();

  if (loading && !project) {
    return <p className="text-sm text-ink-muted">Loading this project.</p>;
  }

  if (!project || projectId === undefined) {
    return (
      <Panel title="Project not found">
        <p className="text-sm text-ink-muted">
          Nothing here with that address.{' '}
          <Link to="/" className="text-accent underline underline-offset-4 hover:no-underline">
            Start somewhere else
          </Link>
          .
        </p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="min-w-0">
        <h1 className="truncate font-display text-lg font-semibold text-ink">{project.name}</h1>
        <p className="mt-0.5 text-sm text-ink-faint">
          {assets.length === 1 ? '1 take' : `${assets.length} takes`}
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink"
        >
          {error}
        </p>
      ) : null}

      <nav aria-label="Tools for this project" className="flex flex-wrap gap-2">
        <Link to={createPath(projectId)} className={toolLink}>
          <Plus aria-hidden="true" className="h-4 w-4 shrink-0" />
          Generate a take
        </Link>
        {assets.length === 0 ? null : (
          <Link to={remixPath(projectId)} className={toolLink}>
            <Scissors aria-hidden="true" className="h-4 w-4 shrink-0" />
            Remix a take
          </Link>
        )}
      </nav>

      {assets.length === 0 ? (
        <Panel title="Nothing here yet">
          <p className="text-sm text-ink-muted">
            Generate a take to get started, or drop a song in from the create page.
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
