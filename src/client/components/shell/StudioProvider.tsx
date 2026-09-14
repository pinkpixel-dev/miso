import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { projectIdFrom } from '../../lib/routes.ts';
import { useCatalog } from '../../lib/useCatalog.ts';
import { useJobs } from '../../lib/useJobs.ts';
import { usePlayer } from '../../lib/usePlayer.ts';
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
  // Read through the shared matcher rather than a pattern written here, so the
  // shell and this provider cannot disagree about which project is open. A
  // nested tool path resolves to the project it sits under.
  const { pathname } = useLocation();
  const routeId = projectIdFrom(pathname);
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
    renameProject,
    renameAsset,
    removeAsset,
    computePeaksFor,
    reload,
  } = useProject(projectId);

  // A finished job has written a new take, so the track list is stale the
  // moment the queue reports one.
  const {
    jobs,
    allJobs,
    dismissedCount,
    tasks,
    error: jobError,
    submit,
    cancel,
    dismiss,
  } = useJobs(projectId, reload);
  const { catalog, loading: catalogLoading } = useCatalog();

  // The dock's skip buttons move through the open project's takes. This lives
  // here rather than in the workspace column because that column is not on
  // screen on a full width tool route, and a take finishing while you are
  // remixing would otherwise never reach the queue. Order matches the list, so
  // Next still means the row below. The provider drops an identical list, so
  // handing it over on every refetch costs nothing.
  const { setQueue } = usePlayer();

  useEffect(() => {
    setQueue(assets);
  }, [assets, setQueue]);

  const value = useMemo<StudioValue>(
    () => ({
      projectId,
      project,
      assets,
      allJobs,
      jobs,
      tasks,
      catalog,
      catalogLoading,
      loading,
      error: error ?? jobError,
      importing,
      submit,
      cancelJob: cancel,
      dismissJobs: dismiss,
      dismissedCount,
      importFile,
      renameProject,
      renameAsset,
      removeAsset,
      computePeaksFor,
    }),
    [
      projectId,
      project,
      assets,
      allJobs,
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
      dismiss,
      dismissedCount,
      importFile,
      renameProject,
      renameAsset,
      removeAsset,
      computePeaksFor,
    ],
  );

  return <StudioContext value={value}>{children}</StudioContext>;
}
