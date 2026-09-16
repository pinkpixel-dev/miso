import type { Asset, Project } from '../../shared/types.ts';

type ProjectUpdateListener = (project: Project) => void;

const listeners = new Set<ProjectUpdateListener>();

/**
 * What happened to one take, for the hooks holding a copy of it.
 *
 * A removal carries ids rather than the asset, because by the time it is
 * published the asset is gone.
 */
export type AssetChange =
  | { kind: 'renamed'; asset: Asset }
  | { kind: 'removed'; projectId: string; assetId: string };

type AssetChangeListener = (change: AssetChange) => void;

const assetListeners = new Set<AssetChangeListener>();

/**
 * Keeps independent project hooks in sync after a mutation in this browser.
 *
 * The navigation rail and studio intentionally own separate data loads. This
 * narrow signal lets a returned project update both without introducing a
 * shell-wide projects provider solely for renaming.
 */
export function publishProjectUpdate(project: Project): void {
  for (const listener of listeners) listener(project);
}

export function subscribeToProjectUpdates(listener: ProjectUpdateListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Says a take changed, for whoever else is holding it.
 *
 * The library can rename and delete a take in any project, including the one
 * currently open, whose takes column, project page and dock all read a
 * separate copy loaded by `useProject`. Without this they would keep showing
 * the old name, or a row whose file is gone, until something reloaded.
 */
export function publishAssetChange(change: AssetChange): void {
  for (const listener of assetListeners) listener(change);
}

export function subscribeToAssetChanges(listener: AssetChangeListener): () => void {
  assetListeners.add(listener);
  return () => assetListeners.delete(listener);
}
