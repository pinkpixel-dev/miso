import type { Project } from '../../shared/types.ts';

type ProjectUpdateListener = (project: Project) => void;

const listeners = new Set<ProjectUpdateListener>();

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
