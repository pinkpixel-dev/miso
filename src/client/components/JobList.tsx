import { useEffect, useState } from 'react';
import type { Job, JobState } from '../../shared/types.ts';
import { isPending, parseStamp } from '../lib/useJobs.ts';
import { Button, Panel, Pill } from './ui.tsx';

/**
 * The queue, newest first.
 *
 * Every state says what it means in words as well as colour, because a state
 * pill is the only thing on this screen that explains a five minute wait.
 *
 * Finished work stays in the same list rather than being collapsed. A job row
 * holds the prompt, lyrics, seed and every other setting that produced a take,
 * so Clear finished hides rows without deleting that history. Live work stays
 * first, followed by every visible finished job.
 */

const STATES: Record<JobState, { label: string; tone: 'good' | 'bad' | 'warn' | 'neutral' }> = {
  queued: { label: 'Waiting', tone: 'neutral' },
  staging: { label: 'Preparing', tone: 'warn' },
  running: { label: 'Generating', tone: 'warn' },
  complete: { label: 'Done', tone: 'good' },
  failed: { label: 'Failed', tone: 'bad' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

/** Counts up while a job runs, and holds the final figure once it stops. */
function Elapsed({ job }: { job: Job }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isPending(job)) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [job]);

  if (!job.startedAt) return null;

  const from = parseStamp(job.startedAt);
  const to = job.finishedAt ? parseStamp(job.finishedAt) : now;
  const seconds = Math.max(0, Math.round((to - from) / 1000));

  return <span className="font-mono text-xs text-ink-muted">{formatElapsed(seconds)}</span>;
}

/**
 * What to call a job in the queue.
 *
 * The song title if there is one, because that is the name somebody chose. The
 * prompt otherwise, which is still how a person recognizes their own job.
 */
function titleOf(job: Job): string {
  if (job.title !== undefined && job.title.trim() !== '') return job.title.trim();
  const prompt = job.params.prompt;
  return typeof prompt === 'string' && prompt.trim() !== '' ? prompt.trim() : job.taskId;
}

function Row({ job, onCancel }: { job: Job; onCancel: (jobId: string) => void }) {
  const state = STATES[job.state];

  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{titleOf(job)}</p>
        {job.error ? (
          <p role="alert" className="mt-1 text-sm text-bad">
            {job.error}
          </p>
        ) : null}
        {job.state === 'running' ? (
          <p className="mt-1 text-sm text-ink-faint">A running generation cannot be interrupted.</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <Elapsed job={job} />
        <Pill tone={state.tone}>{state.label}</Pill>
        {job.state === 'queued' ? (
          <Button variant="ghost" onClick={() => onCancel(job.id)}>
            Cancel
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function JobList({
  jobs,
  hiddenCount = 0,
  onCancel,
  onClear,
}: {
  jobs: Job[];
  /** Finished jobs the queue is holding back. Their rows still exist. */
  hiddenCount?: number;
  onCancel: (jobId: string) => void;
  /** Absent where there is nothing that could be cleared. */
  onClear?: () => void;
}) {
  if (jobs.length === 0) {
    return (
      <Panel title="Queue">
        <p className="text-sm text-ink-muted">
          {hiddenCount > 0
            ? 'Nothing running.'
            : 'Nothing generated yet. Write a prompt on the left.'}
        </p>
      </Panel>
    );
  }

  // Anything in flight, then every visible result. Each group keeps the
  // newest-first ordering supplied by the service.
  const live = jobs.filter(isPending);
  const finished = jobs.filter((job) => !isPending(job));

  return (
    <Panel
      title="Queue"
      actions={
        finished.length > 0 && onClear ? (
          <Button variant="ghost" onClick={onClear}>
            Clear finished
          </Button>
        ) : undefined
      }
    >
      <ul className="flex flex-col divide-y divide-line">
        {[...live, ...finished].map((job) => (
          <Row key={job.id} job={job} onCancel={onCancel} />
        ))}
      </ul>
    </Panel>
  );
}
