import { useCallback, useEffect, useState } from 'react';
import type { Project } from '../../shared/types.ts';
import { api } from './api.ts';

/**
 * The projects list.
 *
 * Every mutation answers with fresh state, so the result replaces what is held
 * rather than being merged into it. This is the same shape useCatalog uses.
 */
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setProjects(await api.getProjects());
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

  /** Answers with the new project so the caller can navigate into it. */
  const create = useCallback(async (name: string): Promise<Project | undefined> => {
    try {
      const project = await api.createProject(name);
      setProjects((current) => [project, ...current]);
      setError(undefined);
      return project;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return undefined;
    }
  }, []);

  const rename = useCallback(async (id: string, name: string) => {
    try {
      const updated = await api.renameProject(id, name);
      setProjects((current) => current.map((p) => (p.id === id ? updated : p)));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      setProjects(await api.deleteProject(id));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  return { projects, error, loading, create, rename, remove, reload: load };
}
