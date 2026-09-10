import { useCallback, useEffect, useRef, useState } from 'react';
import type { Catalog } from '../../shared/types.ts';
import { api } from './api.ts';

const REFRESH_MS = 3000;

/**
 * Holds the catalog and refreshes it while something is installing.
 *
 * The service is what actually watches a download, so this is only about
 * keeping the screen current. It stops polling as soon as nothing is running,
 * and every action answers with a whole catalog, so an action result replaces
 * the state outright rather than being merged into it.
 */
export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      setCatalog(await api.getCatalog());
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const installing =
    catalog?.families.some((f) => f.packages.some((p) => p.install?.state === 'running')) ?? false;
  const scanning = catalog?.live === 'scanning';

  useEffect(() => {
    if (!installing && !scanning) return;
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [installing, scanning, load]);

  const act = useCallback(async (run: () => Promise<Catalog>) => {
    try {
      setCatalog(await run());
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  /**
   * Sweeps abandoned downloads. Returns how many directories went, or undefined
   * when the server did not say. Throws nothing: a failure lands in `error`
   * like every other action, and the caller sees `false`.
   */
  const cleanPartials = useCallback(async (): Promise<{ ok: boolean; removed: number | undefined }> => {
    try {
      const result = await api.cleanPartials();
      setCatalog(result.catalog);
      setError(undefined);
      return { ok: true, removed: result.removed };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return { ok: false, removed: undefined };
    }
  }, []);

  return { catalog, error, loading, reload: load, act, cleanPartials };
}
