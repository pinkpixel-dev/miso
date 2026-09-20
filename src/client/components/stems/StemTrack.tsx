import { Mic, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Asset } from '../../../shared/types.ts';
import { remixPath } from '../../lib/routes.ts';
import { createTakeSurfer } from '../player/createTakeSurfer.ts';
import type { StemDeck } from '../player/useStemDeck.ts';
import { ExportMenu } from '../ExportMenu.tsx';
import { Tooltip, cx } from '../ui.tsx';

/**
 * One stem: its waveform, its fader, and its two buttons.
 *
 * The instance is built here rather than by the deck, because a separation
 * returns two stems or four and a hook cannot be called in a loop whose length
 * changes. Each track builds its own and hands it to the deck, which holds the
 * set and the transport.
 *
 * Peaks are read through a ref rather than depended on, the same discipline the
 * dock and the compare deck follow. Every refetch hands back an array equal to
 * the last one and not the same object, so depending on it would rebuild the
 * instance and cut playback off. See `DOCS/ERRORS.md`.
 */
export function StemTrack({
  stem,
  deck,
  convertedFrom,
}: {
  stem: Asset;
  deck: StemDeck;
  /**
   * The stem this one was converted from, when it is not one of the
   * separation's own outputs.
   *
   * Present means this track is a voice conversion sitting under its source.
   */
  convertedFrom?: Asset;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<{ loading: boolean; error: string | undefined }>({
    loading: true,
    error: undefined,
  });

  const peaks = useRef(stem.peaks);
  peaks.current = stem.peaks;
  const hasPeaks = stem.peaks !== undefined;

  const { register, unregister, report, reportPlaying, reportFinished, seek } = deck;
  const { id, projectId, durationSeconds } = stem;

  useEffect(() => {
    if (!container.current) return;

    setState({ loading: true, error: undefined });

    const instance = createTakeSurfer({
      container: container.current,
      projectId,
      assetId: id,
      peaks: peaks.current,
      duration: durationSeconds,
      handlers: {
        onReady: (built) => {
          setState({ loading: false, error: undefined });
          register(id, built);
        },
        onPlay: () => reportPlaying(id, true),
        onPause: () => reportPlaying(id, false),
        onFinish: () => reportFinished(id),
        onTime: (seconds) => report(id, seconds),
        // Clicking any stem's waveform moves the whole set. Wavesurfer has
        // already moved this one, so without this the others would carry on
        // where they were and the drift corrector would drag this one back.
        onInteraction: (seconds) => seek(seconds),
        // One stem that will not load must not take the rest of the mix with
        // it. Three stems and a message about the fourth is still a useful
        // page.
        onError: (message) => setState({ loading: false, error: message }),
      },
    });

    return () => {
      unregister(id);
      instance.destroy();
    };
  }, [
    id,
    projectId,
    durationSeconds,
    hasPeaks,
    register,
    unregister,
    report,
    reportPlaying,
    reportFinished,
    seek,
  ]);

  const controls = deck.controls.get(id);
  const muted = controls?.muted ?? false;
  const soloed = controls?.soloed ?? false;
  const volume = controls?.volume ?? 1;

  // What this stem is actually doing, which is not always what its own buttons
  // say: anything not soloed is silent while something else is.
  const silenced = deck.soloing ? !soloed : muted;

  // This stem's own play button is about hearing it alone, which is not the
  // same question as whether the set is running. It reads as playing only when
  // this stem is the one you can hear.
  const alone = deck.onlySolo(id);
  const playingAlone = alone && deck.playing;

  return (
    <section
      aria-label={stem.label}
      className={cx(
        'flex flex-col gap-3 rounded-lg border bg-surface p-4',
        'md:flex-row md:items-center md:gap-4',
        soloed ? 'border-accent' : 'border-line',
      )}
    >
      <div className="flex min-w-0 items-center gap-3 md:w-56 md:shrink-0">
        {/*
          Hears this stem on its own. The others keep running silently rather
          than pausing, which is the rule the whole deck follows: a paused stem
          stops advancing, and the next thing you press would need a seek
          before it made a sound.
        */}
        <Tooltip label={playingAlone ? `Stop ${stem.label}` : `Hear ${stem.label} on its own`}>
          <button
            type="button"
            onClick={() => deck.playOnly(id)}
            disabled={!deck.playable}
            aria-label={playingAlone ? `Stop ${stem.label}` : `Hear ${stem.label} on its own`}
            className={cx(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
              'transition-colors duration-150',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              'disabled:cursor-not-allowed disabled:opacity-45',
              playingAlone
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-line text-ink-muted hover:bg-raised hover:text-ink',
            )}
          >
            {playingAlone ? (
              <Pause aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Play aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        </Tooltip>

        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{stem.label}</p>
          {/*
            Said in words, not only by where the row sits. Two tracks with
            nearly the same name is exactly the case where position is not
            enough to tell which one is the original.
          */}
          {convertedFrom ? (
            <p className="truncate text-xs text-ink-muted">
              Converted from {convertedFrom.label}
            </p>
          ) : null}
          {/*
            Said in a word rather than shown only by a dimmed waveform, because
            a stem silenced by somebody else's solo looks the same as one that
            is simply quiet.
          */}
          <p className="truncate text-xs text-ink-faint">
            {silenced ? (deck.soloing && !soloed ? 'Silent, another stem is soloed' : 'Muted') : 'Playing'}
          </p>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div
          ref={container}
          className={cx('w-full transition-opacity duration-150', silenced && 'opacity-40')}
        />
        {state.error ? (
          <div className="flex h-12 items-center" aria-hidden="true">
            <div className="h-px w-full bg-line" />
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 md:shrink-0">
        <button
          type="button"
          aria-pressed={muted}
          onClick={() => deck.toggleMute(id)}
          className={cx(
            'rounded-md border px-3 py-1.5 text-xs font-medium',
            muted ? 'border-accent bg-accent text-accent-ink' : 'border-line text-ink-muted hover:text-ink',
          )}
        >
          Mute
        </button>
        <button
          type="button"
          aria-pressed={soloed}
          onClick={() => deck.toggleSolo(id)}
          className={cx(
            'rounded-md border px-3 py-1.5 text-xs font-medium',
            soloed ? 'border-accent bg-accent text-accent-ink' : 'border-line text-ink-muted hover:text-ink',
          )}
        >
          Solo
        </button>
        <label className="flex items-center gap-2">
          <span className="sr-only">{stem.label} volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => deck.setVolume(id, Number(event.target.value))}
            aria-valuetext={`${Math.round(volume * 100)} percent`}
            className="w-24 accent-[var(--color-accent)]"
          />
        </label>

        {/*
          The way into a conversion, on the track itself. Finding it meant
          leaving for the remix page and picking this stem out of a list of
          every take in the project, which is a long way round for something
          that only makes sense from here.

          Offered on every stem rather than on whichever one is named vocals.
          Which stem holds the singing is a question about a label, and the
          labels here already carry brackets of their own.
        */}
        <Tooltip label={`Convert the voice on ${stem.label}`}>
          <Link
            to={remixPath(stem.projectId, stem.id, 'voice.rvc')}
            aria-label={`Convert the voice on ${stem.label}`}
            className={cx(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
              'text-ink-muted transition-colors duration-150 hover:bg-raised hover:text-ink',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            )}
          >
            <Mic aria-hidden="true" className="h-4 w-4" />
          </Link>
        </Tooltip>

        {/*
          Exporting a stem is most of the reason to separate a take at all, so
          it gets the same format choice a take gets.
        */}
        <ExportMenu
          projectId={stem.projectId}
          assetId={stem.id}
          filename={stem.filename}
          label={stem.label}
          format={stem.format}
        />
      </div>

      {state.loading ? (
        <p aria-live="polite" className="text-xs text-ink-muted md:hidden">
          Loading {stem.label}.
        </p>
      ) : null}

      {state.error ? (
        <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink">
          This stem could not be loaded: {state.error} The rest of the mix is unaffected.
        </p>
      ) : null}
    </section>
  );
}
