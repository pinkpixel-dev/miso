import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GeneratePanel } from '../components/GeneratePanel.tsx';
import { Panel } from '../components/ui.tsx';
import { installedPackages } from '../lib/models.ts';
import { prefillFromJob } from '../lib/reusePrompt.ts';
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

  /*
    The form can be seeded from a take that already exists, which the address
    says as `?from=<jobId>`. The job is found in the list this project already
    holds rather than fetched, because `useStudio` carries every job in the
    project including the ones cleared from the queue, which is what keeps an
    old take reusable.

    A `from` that names nothing here is ignored. Links outlive the jobs they
    point at, and an unusable one should open an ordinary empty form.
  */
  const [params] = useSearchParams();
  const fromJobId = params.get('from') ?? undefined;
  const seedJob = jobs.find((job) => job.id === fromJobId);

  const installedModelIds = useMemo(
    () => tasks.flatMap((task) => installedPackages(catalog, task).map((pkg) => pkg.id)),
    [catalog, tasks],
  );

  const prefill = useMemo(
    () => (seedJob ? prefillFromJob(seedJob, installedModelIds) : undefined),
    [seedJob, installedModelIds],
  );

  /*
    Nothing is seeded until the catalog has settled and this build has said what
    it can do. Both arrive after the first render, and until they do every model
    reads as uninstalled, so seeding early would fill the form in correctly and
    then tell the person their model is missing when it is sitting right there.

    The form seeds once per job id, so this is a gate rather than a retry: the
    id stays undefined until the answer is worth acting on.
  */
  const ready = !catalogLoading && tasks.length > 0;

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
        prefill={prefill}
        seedId={ready ? seedJob?.id : undefined}
        onSubmit={submit}
      />
    </div>
  );
}
