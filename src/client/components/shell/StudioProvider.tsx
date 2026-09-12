import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMatch } from 'react-router-dom';
import { useCatalog } from '../../lib/useCatalog.ts';
import { useJobs } from '../../lib/useJobs.ts';
import { useProject } from '../../lib/useProject.ts';
import { StudioContext, type StudioValue } from '../../lib/useStudio.ts';

/**
 * Loads whichever project the studio is pointed at.
 *
 * The active project comes from the route, but the workspace keeps showing it
 * on the models and settings screens, so the last one is remembered. Opening
 * settings to install a model should not empty the column holding the takes you
 * were listening to.
 *
 * There is deliberately no key on this component. Keying it on the project id
 * would give clean state per project and would remount everything underneath,
 * including the dock, which is exactly the bug DOCS/ERRORS.md warns about. A
 * project change is a new value here and nothing more.
 */
export function StudioProvider({ children }: { children: ReactNode }) {
  const match = useMatch('/projects/:id');
  const routeId = match?.params.id;
  const [lastId, setLastId] = useState(routeId);

  useEffect(() => {
    if (routeId !== undefined) setLastId(routeId);
  }, [routeId]);

  const projectId = routeId ?? lastId;

  const {
    project,
    assets,
    error,
    loading,
    importing,
    importFile,
    renameAsset,
    removeAsset,
    computePeaksFor,
    reload,
  } = useProject(projectId);

  // A finished job has written a new take, so the track list is stale the
  // moment the queue reports one.
  const { jobs, tasks, error: jobError, submit, cancel } = useJobs(projectId, reload);
  const { catalog, loading: catalogLoading } = useCatalog();

  const value = useMemo<StudioValue>(
    () => ({
      projectId,
      project,
      assets,
      jobs,
      tasks,
      catalog,
      catalogLoading,
      loading,
      error: error ?? jobError,
      importing,
      submit,
      cancelJob: cancel,
      importFile,
      renameAsset,
      removeAsset,
      computePeaksFor,
    }),
    [
      projectId,
      project,
      assets,
      jobs,
      tasks,
      catalog,
      catalogLoading,
      loading,
      error,
      jobError,
      importing,
      submit,
      cancel,
      importFile,
      renameAsset,
      removeAsset,
      computePeaksFor,
    ],
  );

  return <StudioContext value={value}>{children}</StudioContext>;
}
