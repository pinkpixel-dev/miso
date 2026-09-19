import { ArrowLeft, Download, Pause, Play, Save, SkipBack, SkipForward } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StemTrack } from '../components/stems/StemTrack.tsx';
import { useStemDeck } from '../components/player/useStemDeck.ts';
import { Button, IconButton, Panel, cx } from '../components/ui.tsx';
import { api, outputsZipUrl } from '../lib/api.ts';
import { projectPath } from '../lib/routes.ts';
import { stemSet } from '../lib/stemSet.ts';
import { useStudio } from '../lib/useStudio.ts';

/**
 * A separation's stems, at /projects/:id/stems/:jobId.
 *
 * The job is the address because a job is what a stem set is. Separation writes
 * one asset per named output and puts the same job id on every row, so the set
 * has an identity already and does not need one inventing for it.
 *
 * Scoped to the project rather than app level, unlike Compare. Compare crosses
 * the project boundary on purpose, because its two takes are picked by hand and
 * can come from anywhere. Stems cannot: they came out of one take, which lives
 * in one project.
 *
 * This page takes the full width. It carries several waveforms and a transport,
 * and the takes column beside it would be the same project's list next to the
 * stems of one of its takes.
 */

/** How far the skip controls move, in seconds. */
const SKIP_SECONDS = 10;

function timecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function StemsRoute() {
  const { jobId } = useParams();
  const { project, projectId, assets, allJobs, loading, reload } = useStudio();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ label: string; clipped: number } | undefined>();
  const [saveError, setSaveError] = useState<string | undefined>();

  const job = useMemo(
    () => allJobs.find((entry) => entry.id === jobId),
    [allJobs, jobId],
  );

  // Read from the job's own outputs rather than by filtering assets on kind, so
  // a project with several separations shows the set that was asked for. Voice
  // conversions are written under their own jobs and are pulled in by lineage,
  // each one sitting under the stem it was made from.
  const entries = useMemo(() => stemSet(job, assets, allJobs), [job, assets, allJobs]);
  const stems = useMemo(() => entries.map((entry) => entry.asset), [entries]);

  const deck = useStemDeck(stems);

  // What the zip actually holds, which is the separation's own outputs. The
  // route builds it from the job, so counting the conversions in this label
  // would promise files that are not in the file.
  const ownStemCount = useMemo(
    () => entries.filter((entry) => entry.convertedFrom === undefined).length,
    [entries],
  );

  /**
   * Saves what you can hear, not what the stems are.
   *
   * The gains carry solo and mute already, so a mix saved while one stem is
   * soloed is that stem on its own, which is a real thing to want and not a
   * mistake to guard against.
   */
  const saveMix = useCallback(async () => {
    if (!job || projectId === undefined) return;

    setSaving(true);
    setSaveError(undefined);
    try {
      const result = await api.mixStems(projectId, job.id, deck.gains());
      setSaved({ label: result.asset.label, clipped: result.clipped });
      // The project's takes are what the mix just joined, so the list behind
      // this page is out of date until it is asked again.
      reload();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The mix could not be saved');
    } finally {
      setSaving(false);
    }
  }, [job, projectId, deck, reload]);

  const back = projectId === undefined ? '/' : projectPath(projectId);

  if (loading && stems.length === 0) {
    return (
      <Panel title="Stems">
        <p className="text-sm text-ink-muted">Loading.</p>
      </Panel>
    );
  }

  if (!job || stems.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Link to={back} className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft size={16} aria-hidden="true" />
          {project?.name ?? 'Back'}
        </Link>
        <Panel title="Stems">
          <p className="text-sm text-ink">
            These stems are not here. The separation may have been deleted, or this link may be
            pointing at another project.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={back}
            className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {project?.name ?? 'Back'}
          </Link>
          <h1 className="truncate text-lg font-medium text-ink">
            {job.title ?? 'Stems'}
          </h1>
          <p className="text-xs text-ink-faint">
            {stems.length} tracks, {deck.readyCount} loaded
            {deck.soloing ? ', soloing' : ''}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <p aria-live="off" className="tabular-nums text-sm text-ink-muted">
            {timecode(deck.elapsed)}
          </p>

          {/*
            The whole set in one file. Four stems exported one at a time is
            four trips through a save dialog, and they belong together.
          */}
          <Button variant="secondary" onClick={() => void saveMix()} busy={saving}>
            <Save size={16} aria-hidden="true" />
            Save mix
          </Button>

          <a
            href={outputsZipUrl(job.projectId, job.id)}
            download
            aria-label={`Export all ${ownStemCount} stems as a zip`}
            className={cx(
              'inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-md border border-line px-3.5 py-2',
              'text-sm font-medium text-ink-muted transition-colors duration-150',
              'hover:bg-raised hover:text-ink active:bg-raised/70',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            )}
          >
            <Download size={16} aria-hidden="true" />
            Export all
          </a>
          {/*
            Clicking a waveform is the quick way to move around and it needs a
            pointer. These do the same job from the keyboard, which rule 15 in
            AGENTS.md asks for and a waveform cannot answer on its own.
          */}
          <IconButton
            label={`Back ${SKIP_SECONDS} seconds`}
            icon={SkipBack}
            onClick={() => deck.seek(Math.max(0, deck.elapsed - SKIP_SECONDS))}
            disabled={!deck.playable}
          />

          <Button
            variant="primary"
            onClick={deck.playPause}
            disabled={!deck.playable}
            aria-label={deck.playing ? 'Pause every stem' : 'Play every stem'}
          >
            {deck.playing ? (
              <Pause size={16} aria-hidden="true" />
            ) : (
              <Play size={16} aria-hidden="true" />
            )}
            {deck.playing ? 'Pause' : 'Play'}
          </Button>

          <IconButton
            label={`Forward ${SKIP_SECONDS} seconds`}
            icon={SkipForward}
            onClick={() => deck.seek(deck.elapsed + SKIP_SECONDS)}
            disabled={!deck.playable}
          />
        </div>
      </div>

      {saveError ? (
        <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink">
          {saveError}
        </p>
      ) : null}

      {saved ? (
        <p aria-live="polite" className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
          Saved {saved.label} to this project.
          {saved.clipped > 0
            ? ` ${saved.clipped.toLocaleString()} samples were held at full scale, so turn a fader down if it sounds harsh.`
            : ''}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {entries.map((entry) => (
          <StemTrack
            key={entry.asset.id}
            stem={entry.asset}
            deck={deck}
            convertedFrom={entry.convertedFrom}
          />
        ))}
      </div>
    </div>
  );
}
