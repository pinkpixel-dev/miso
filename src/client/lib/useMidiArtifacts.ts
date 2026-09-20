import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Job, MidiArtifact } from '../../shared/types.ts';
import { api } from './api.ts';

/**
 * A project's transcriptions, refetched when one finishes.
 *
 * Transcriptions are not takes, so the studio's own asset list never carries
 * them and finishing a job does not reload them. What does is counting the
 * finished `analyze.midi` jobs: when that number goes up, one has landed.
 * Polling the list on a timer would ask constantly for something that changes
 * a few times an hour.
 */
export interface MidiArtifacts {
  artifacts: MidiArtifact[];
  loading: boolean;
  error: string | undefined;
  remove: (id: string) => Promise<void>;
  reload: () => void;
}

export function useMidiArtifacts(projectId: string | undefined, jobs: Job[]): MidiArtifacts {
  const [artifacts, setArtifacts] = useState<MidiArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [nonce, setNonce] = useState(0);

  const finished = useMemo(
    () => jobs.filter((job) => job.taskId === 'analyze.midi' && job.state === 'complete').length,
    [jobs],
  );

  useEffect(() => {
    if (projectId === undefined) {
      setArtifacts([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    api
      .getMidi(projectId)
      .then((rows) => {
        if (cancelled) return;
        setArtifacts(rows);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, finished, nonce]);

  const remove = useCallback(
    async (id: string) => {
      if (projectId === undefined) return;
      try {
        setArtifacts(await api.deleteMidi(projectId, id));
        setError(undefined);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [projectId],
  );

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { artifacts, loading, error, remove, reload };
}
