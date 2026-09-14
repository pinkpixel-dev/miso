import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GeneratePanel } from '../components/GeneratePanel.tsx';
import { Panel } from '../components/ui.tsx';
import { projectPath } from '../lib/routes.ts';
import { useStudio } from '../lib/useStudio.ts';

/**
 * The create column, at /projects/:id/create.
 *
 * This used to be the whole screen: the form, the queue, the import zone, the
 * player and the track list stacked down one page. All of that except the form
 * now lives in the shell, where it survives a route change. What is left here
 * is the thing that is actually about the route, which is writing a job.
 *
 * It used to be the project route itself. Opening a project now shows the
 * project, and this is a page under it, so the takes column beside this form
 * is the list this form writes into rather than everything in the project.
 */
export function CreateRoute() {
  const { project, loading, error, tasks, jobs, catalog, catalogLoading, submit } = useStudio();

  if (loading && !project) {
    return <p className="text-sm text-ink-muted">Loading this project.</p>;
  }

  if (!project) {
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
      {/*
        The workspace column already carries the project name, and having it
        twice on one screen made the create column look like a page rather than
        part of a studio. The heading stays for anything reading the structure.
      */}
      <h1 className="sr-only">{project.name}</h1>

      {/*
        The way back, since this page sits under the project now. The rail can
        also get there, but a page you navigated into should say how to leave.
      */}
      <Link
        to={projectPath(project.id)}
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-md px-3 py-2 text-sm text-ink-muted transition-colors duration-150 hover:bg-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
        Back to {project.name}
      </Link>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink"
        >
          {error}
        </p>
      ) : null}

      <GeneratePanel
        tasks={tasks}
        jobs={jobs}
        catalog={catalog}
        catalogLoading={catalogLoading}
        onSubmit={submit}
      />
    </div>
  );
}
