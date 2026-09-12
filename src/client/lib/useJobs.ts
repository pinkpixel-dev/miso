import { useCallback, useEffect, useRef, useState } from 'react';
import type { Job, StudioState, StudioTask } from '../../shared/types.ts';
import { api } from './api.ts';

/**
 * The queue for one project.
 *
 * Jobs are polled rather than pushed. A generation runs for minutes and changes
 * state perhaps four times in all, so a socket would be a lot of machinery for
 * a handful of events, and polling survives a phone locking its screen and
 * coming back. The interval is slow while nothing is happening and quick while
 * something is.
 */

const IDLE_POLL_MS = 15_000;
const ACTIVE_POLL_MS = 2_000;

export function isPending(job: Job): boolean {
  return job.state === 'queued' || job.state === 'staging' || job.state === 'running';
}

export function useJobs(projectId: string | undefined, onComplete?: () => void) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tasks, setTasks] = useState<StudioTask[]>([]);
  const [error, setError] = useState<string | undefined>();

  // Completion is noticed by comparing, because the poll is the only signal
  // there is. The parent uses it to reload the track list, since a finished job
  // has written a new asset.
  const completedRef = useRef(new Set<string>());
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const load = useCallback(async () => {
    if (projectId === undefined) {
      setJobs([]);
      return;
    }

    try {
      const next = await api.getJobs(projectId);
      setJobs(next);
      setError(undefined);

      const finished = next.filter((job) => job.state === 'complete').map((job) => job.id);
      const fresh = finished.filter((id) => !completedRef.current.has(id));
      for (const id of finished) completedRef.current.add(id);
      if (fresh.length > 0) onCompleteRef.current?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [projectId]);

  useEffect(() => {
    void api
      .getTasks()
      .then(setTasks)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      );
  }, []);

  // The first load seeds the set of already finished jobs, so opening a project
  // with old takes in it does not look like five jobs finishing at once.
  useEffect(() => {
    if (projectId === undefined) {
      setJobs([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      const next = await api.getJobs(projectId).catch(() => [] as Job[]);
      if (cancelled) return;
      for (const job of next) if (job.state === 'complete') completedRef.current.add(job.id);
      setJobs(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const active = jobs.some(isPending);

  useEffect(() => {
    const timer = setInterval(() => void load(), active ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    return () => clearInterval(timer);
  }, [active, load]);

  const submit = useCallback(
    async (body: {
      taskId: string;
      modelId: string;
      params: Record<string, string | number>;
      title?: string;
      studio?: StudioState;
      originalPrompt?: string;
      inputs?: { assetId: string; role: string }[];
    }) => {
      if (projectId === undefined) return false;
      try {
        const job = await api.createJob(projectId, body);
        setJobs((current) => [job, ...current]);
        setError(undefined);
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return false;
      }
    },
    [projectId],
  );

  const cancel = useCallback(
    async (jobId: string) => {
      if (projectId === undefined) return;
      try {
        const job = await api.cancelJob(projectId, jobId);
        setJobs((current) => current.map((entry) => (entry.id === jobId ? job : entry)));
        setError(undefined);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [projectId],
  );

  /**
   * Clears the queue.
   *
   * The service hides finished rows and answers with the whole list, so what
   * comes back still holds everything. Filtering happens below rather than in
   * the request, which keeps one shape of job in the client and leaves the
   * hidden ones readable by anything that wants a take's provenance.
   */
  const dismiss = useCallback(async () => {
    if (projectId === undefined) return;
    try {
      setJobs(await api.dismissJobs(projectId));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [projectId]);

  const visible = jobs.filter((job) => job.dismissedAt === undefined);

  return {
    jobs: visible,
    /** Complete history, including finished jobs hidden from the queue. */
    allJobs: jobs,
    /** Finished jobs being held back, so the queue can say so rather than lie. */
    dismissedCount: jobs.length - visible.length,
    tasks,
    error,
    submit,
    cancel,
    dismiss,
    reload: load,
  };
}

/**
 * How long this task and model usually take, in seconds.
 *
 * Only finished runs of the same task on the same model count, because a
 * different model is a different amount of work. The median is used rather than
 * the mean: a first run includes a weight load and would otherwise drag every
 * estimate up for the rest of the session.
 */
/**
 * SQLite writes "2026-09-11 22:04:09" in UTC, which is not a format every
 * browser parses the same way. Making it ISO first is one replace and removes
 * the doubt.
 */
export function parseStamp(value: string): number {
  return Date.parse(`${value.replace(' ', 'T')}Z`);
}

export function estimateSeconds(jobs: Job[], taskId: string, modelId: string): number | undefined {
  const durations = jobs
    .filter((job) => job.taskId === taskId && job.modelId === modelId && job.state === 'complete')
    .flatMap((job) => {
      if (!job.startedAt || !job.finishedAt) return [];
      const seconds = (parseStamp(job.finishedAt) - parseStamp(job.startedAt)) / 1000;
      return Number.isFinite(seconds) && seconds > 0 ? [seconds] : [];
    })
    .sort((a, b) => a - b);

  if (durations.length === 0) return undefined;
  return Math.round(durations[Math.floor(durations.length / 2)] ?? 0);
}
