import { AudioLines, Columns2, CopyPlus, Scissors, X } from 'lucide-react';
import { useEffect } from 'react';
import type { RefObject } from 'react';
import { Link } from 'react-router-dom';
import type { Asset, Job, StudioTask } from '../../../shared/types.ts';
import type { LineageStep } from '../../lib/lineage.ts';
import { ancestorsOf, descendantsOf, sourceWasDeleted } from '../../lib/lineage.ts';
import { comparePath, createPath, remixPath, stemsPath } from '../../lib/routes.ts';
import { stringJobParam } from '../../lib/takeDetails.ts';
import { Tooltip, cx } from '../ui.tsx';

function formatBytes(bytes: number): string {
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}

function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined) return 'length unknown';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/*
  Both ways on from a take look the same, because they are the same kind of
  thing: a link out of this panel into a page that carries on from here.
*/
const actionLink = cx(
  'inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-raised px-3.5 py-2',
  'text-sm font-medium text-ink transition-colors duration-150',
  'hover:border-line-strong hover:bg-raised/70 active:bg-raised',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
);

function RecordedText({ value, missing }: { value: string | undefined; missing: string }) {
  return value === undefined ? (
    <p className="text-sm text-ink-faint">{missing}</p>
  ) : (
    <p className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-ink-muted">
      {value}
    </p>
  );
}

/**
 * One chain of takes, as rows that move the panel rather than navigate.
 *
 * Selecting a row swaps which take the panel is about, so walking a chain is
 * clicking. A navigation would close the panel and take the person somewhere
 * else, which is the wrong shape for reading how something was made.
 *
 * A step whose take is not in this project renders as unavailable rather than
 * as a button. The chain keeps its length either way, because a link nobody can
 * follow is still a fact about where this take came from.
 */
function LineageList({
  title,
  steps,
  tasks,
  onSelect,
}: {
  title: string;
  steps: LineageStep[];
  tasks: StudioTask[];
  onSelect: (assetId: string) => void;
}) {
  return (
    <section className="border-t border-line pt-5">
      <h3 className="mb-2 text-sm font-medium text-ink">{title}</h3>
      <ul className="flex flex-col gap-1">
        {steps.map((step) => {
          const tool = tasks.find((task) => task.id === step.job?.taskId)?.shortLabel;

          return (
            <li key={step.assetId}>
              {step.asset ? (
                <button
                  type="button"
                  onClick={() => onSelect(step.assetId)}
                  className={cx(
                    'flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
                    'transition-colors duration-150 hover:bg-raised active:bg-raised/70',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {step.asset.label}
                  </span>
                  <span className="shrink-0 text-xs text-ink-faint">{tool ?? step.role}</span>
                </button>
              ) : (
                <p className="px-2 py-1.5 text-sm text-ink-faint">
                  A take from another project, as {step.role}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function TakeDetailPanel({
  asset,
  job,
  assets,
  jobs,
  tasks,
  closeButtonRef,
  onSelect,
  onClose,
}: {
  asset: Asset | undefined;
  job: Job | undefined;
  /** Every take in the open project, for resolving a lineage step to a take. */
  assets: Asset[];
  /** The full job history, which is what carries the edges between takes. */
  jobs: Job[];
  tasks: StudioTask[];
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  /** Moves the panel to another take, which is how a chain is walked. */
  onSelect: (assetId: string) => void;
  onClose: () => void;
}) {
  const open = asset !== undefined;

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [asset?.id, closeButtonRef, onClose, open]);

  const prompt = job ? stringJobParam(job, 'prompt') : undefined;
  const lyrics = job ? stringJobParam(job, 'lyrics') : undefined;

  const madeFrom = asset ? ancestorsOf(asset.id, assets, jobs) : [];
  const usedIn = asset ? descendantsOf(asset.id, assets, jobs) : [];
  const lostSource = sourceWasDeleted(job, tasks);

  return (
    <div
      aria-hidden={!open}
      className={cx('absolute inset-0 z-30', open ? 'pointer-events-auto' : 'pointer-events-none')}
    >
      <button
        type="button"
        aria-label="Close take details"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-transparent"
      />

      <section
        id="take-detail-panel"
        role="dialog"
        aria-labelledby={open ? 'take-detail-title' : undefined}
        inert={!open}
        className={cx(
          'absolute inset-y-0 right-0 flex w-[min(420px,100%)] flex-col border-l border-line bg-surface shadow-xl',
          'transition-[transform,opacity] duration-200',
          open ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0',
        )}
      >
        {asset ? (
          <>
            <header className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 id="take-detail-title" className="truncate text-base font-medium text-ink">
                  {asset.label}
                </h2>
                <p className="mt-1 break-all text-xs text-ink-faint">{asset.filename}</p>
                <p className="mt-1 text-xs text-ink-faint">
                  {formatDuration(asset.durationSeconds)} · {asset.format} · {formatBytes(asset.bytes)}
                </p>
              </div>
              <Tooltip label="Close take details">
                <button
                  ref={closeButtonRef}
                  type="button"
                  aria-label="Close take details"
                  onClick={onClose}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-raised hover:text-ink active:bg-raised/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </Tooltip>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {/*
                The two ways on from a take. Links rather than buttons because
                they go somewhere, so the address ends up saying what is being
                worked on and the back button comes back here. They wrap onto a
                second row in a narrow window rather than either label breaking
                across two lines.
              */}
              <div className="mb-5 flex flex-wrap items-center gap-2">
                {/*
                  Into the remix tools, with this take already the source. It
                  does not name a tool. The remix page carries several and the
                  picker chooses between them, so a link promising one of them
                  would be answering a question this panel has not asked.
                */}
                <Link
                  to={remixPath(asset.projectId, asset.id)}
                  onClick={onClose}
                  className={actionLink}
                >
                  <Scissors aria-hidden="true" className="h-4 w-4 shrink-0" />
                  Remix this take
                </Link>

                {/*
                  The other way to carry on from a take, which is to make
                  another one like it rather than to edit this one. It needs the
                  job, because the job is the only record of what was typed, so
                  an imported take does not offer it at all.
                */}
                {job ? (
                  <Link
                    to={createPath(asset.projectId, job.id)}
                    onClick={onClose}
                    aria-label="Fill the create form with the settings that made this take"
                    className={actionLink}
                  >
                    <CopyPlus aria-hidden="true" className="h-4 w-4 shrink-0" />
                    Reuse these settings
                  </Link>
                ) : null}

                {/*
                  Into the compare page with this take on one side and the
                  other side still to pick. Unlike the dock's compare it does
                  not need this take to have been made from anything, and the
                  take it ends up next to can be from any project.
                */}
                <Link
                  to={comparePath(asset.id)}
                  onClick={onClose}
                  aria-label="Compare this take against another one"
                  className={actionLink}
                >
                  <Columns2 aria-hidden="true" className="h-4 w-4 shrink-0" />
                  Compare with
                </Link>

                {/*
                  Back to the rest of the set this stem came out of. Offered
                  only for a stem, and only when the job that made it is still
                  here, because the job is what holds the set together.
                */}
                {asset.kind === 'stem' && job ? (
                  <Link
                    to={stemsPath(asset.projectId, job.id)}
                    onClick={onClose}
                    aria-label="Open every stem from this separation together"
                    className={actionLink}
                  >
                    <AudioLines aria-hidden="true" className="h-4 w-4 shrink-0" />
                    Open the stems
                  </Link>
                ) : null}
              </div>

              {!job ? (
                <section>
                  <h3 className="text-sm font-medium text-ink">
                    {asset.kind === 'source' ? 'Imported audio' : 'Generation details unavailable'}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {asset.kind === 'source'
                      ? 'This file was imported, so it does not have a generation prompt or lyrics.'
                      : 'No producing job was found in this project history, so there is no prompt or lyric record to show.'}
                  </p>
                </section>
              ) : (
                <div className="flex flex-col gap-6">
                  <section>
                    <h3 className="mb-2 text-sm font-medium text-ink">Prompt used</h3>
                    <RecordedText value={prompt} missing="No prompt was recorded for this job." />
                  </section>

                  {job.originalPrompt !== undefined ? (
                    <section className="border-t border-line pt-5">
                      <h3 className="mb-2 text-sm font-medium text-ink">Original idea</h3>
                      <RecordedText value={job.originalPrompt} missing="" />
                    </section>
                  ) : null}

                  <section className="border-t border-line pt-5">
                    <h3 className="mb-2 text-sm font-medium text-ink">Lyrics</h3>
                    <RecordedText value={lyrics} missing="No lyrics were recorded for this job." />
                  </section>
                </div>
              )}

              {/*
                Where this take sits among the others. Both lists are left out
                when they are empty, because a generated song nothing was made
                from should not carry two headings saying nothing.

                The deleted source line takes the place of Made from rather than
                sitting beside it. A repaint whose source is gone reports no
                inputs at all, which is what a job that reads nothing reports,
                so without this the panel would show it as generated from
                nothing.
              */}
              {lostSource ? (
                <section className="mt-6 border-t border-line pt-5">
                  <h3 className="mb-2 text-sm font-medium text-ink">Made from</h3>
                  <p className="text-sm leading-relaxed text-ink-muted">
                    The take this was made from has been deleted, so there is no longer a record
                    of which one it was.
                  </p>
                </section>
              ) : null}

              {madeFrom.length > 0 ? (
                <div className="mt-6">
                  <LineageList
                    title="Made from"
                    steps={madeFrom}
                    tasks={tasks}
                    onSelect={onSelect}
                  />
                </div>
              ) : null}

              {usedIn.length > 0 ? (
                <div className="mt-6">
                  <LineageList title="Used in" steps={usedIn} tasks={tasks} onSelect={onSelect} />
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
