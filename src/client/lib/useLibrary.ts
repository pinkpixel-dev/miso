import { useCallback, useEffect, useState } from 'react';
import type { LibraryTake, StudioTask } from '../../shared/types.ts';
import { api } from './api.ts';
import { publishAssetChange, subscribeToAssetChanges } from './projectUpdates.ts';

/**
 * Every take in Miso, and the tasks needed to name what made them.
 *
 * Both loads happen here rather than in the page, and both are one request:
 * the library is metadata for the whole database, and the task list is the
 * same whether the backend is up or not. This follows the `useProjects` shape,
 * where a mutation answers with fresh state and the result replaces what is
 * held rather than being merged into it.
 *
 * Renaming and deleting reach across projects, which the plain asset routes
 * already allow: both take a project id, and a take carries the id of the
 * project it lives in. What they also do is publish, so a project open
 * elsewhere in the app updates rather than going stale.
 */
export function useLibrary() {
  const [takes, setTakes] = useState<LibraryTake[]>([]);
  const [tasks, setTasks] = useState<StudioTask[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [library, taskList] = await Promise.all([api.getLibrary(), api.getTasks()]);
      setTakes(library);
      setTasks(taskList);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The project page can rename or delete a take too, and this list is open
  // beside it often enough to be worth keeping honest.
  useEffect(
    () =>
      subscribeToAssetChanges((change) => {
        if (change.kind === 'renamed') {
          setTakes((current) =>
            current.map((take) =>
              take.assetId === change.asset.id ? { ...take, label: change.asset.label } : take,
            ),
          );
          return;
        }
        setTakes((current) => current.filter((take) => take.assetId !== change.assetId));
      }),
    [],
  );

  const rename = useCallback(async (take: LibraryTake, label: string) => {
    try {
      const updated = await api.renameAsset(take.projectId, take.assetId, label);
      setTakes((current) =>
        current.map((entry) =>
          entry.assetId === take.assetId ? { ...entry, label: updated.label } : entry,
        ),
      );
      publishAssetChange({ kind: 'renamed', asset: updated });
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const remove = useCallback(async (take: LibraryTake) => {
    try {
      await api.deleteAsset(take.projectId, take.assetId);
      setTakes((current) => current.filter((entry) => entry.assetId !== take.assetId));
      publishAssetChange({
        kind: 'removed',
        projectId: take.projectId,
        assetId: take.assetId,
      });
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  return { takes, tasks, error, loading, rename, remove, reload: load };
}
