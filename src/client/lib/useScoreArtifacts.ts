import { useEffect, useMemo, useState } from 'react';
import type { Job, ScoreArtifact } from '../../shared/types.ts';
import { api } from './api.ts';

/**
 * A project's scores, refetched when a planning run finishes.
 *
 * The same shape as `useMidiArtifacts` and for the same reason: a score is not
 * a take, so the studio's asset list never carries one and a finished job does
 * not reload them. Counting the finished YuE2 jobs is what says a new score may
 * have landed, which is a few times an hour rather than something to poll for.
 *
 * "May have" is deliberate. A run with planning off writes no score, and a run
 * given a score of its own writes none either, so the count going up does not
 * promise a new row. Refetching either way is one small request and is simpler
 * than reading each job's params to guess.
 *
 * There is no `remove`. A score is deleted by deleting the take it planned,
 * which 010 does as a cascade.
 */
export function useScoreArtifacts(projectId: string | undefined, jobs: Job[]): ScoreArtifact[] {
  const [scores, setScores] = useState<ScoreArtifact[]>([]);

  const finished = useMemo(
    () => jobs.filter((job) => job.taskId === 'generate.yue2' && job.state === 'complete').length,
    [jobs],
  );

  useEffect(() => {
    if (projectId === undefined) {
      setScores([]);
      return;
    }

    let cancelled = false;

    api
      .getScores(projectId)
      .then((rows) => {
        if (!cancelled) setScores(rows);
      })
      // A picker that cannot list anything offers nothing, which is the same
      // as a project with no scores in it. Nothing on the form depends on this
      // succeeding, so a failure here does not get a banner of its own.
      .catch(() => {
        if (!cancelled) setScores([]);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, finished]);

  return scores;
}
