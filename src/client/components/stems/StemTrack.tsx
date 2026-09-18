import { useEffect, useRef, useState } from 'react';
import type { Asset } from '../../../shared/types.ts';
import { createTakeSurfer } from '../player/createTakeSurfer.ts';
import type { StemDeck } from '../player/useStemDeck.ts';
import { cx } from '../ui.tsx';

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
export function StemTrack({ stem, deck }: { stem: Asset; deck: StemDeck }) {
  const container = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<{ loading: boolean; error: string | undefined }>({
    loading: true,
    error: undefined,
  });

  const peaks = useRef(stem.peaks);
  peaks.current = stem.peaks;
  const hasPeaks = stem.peaks !== undefined;

  const { register, unregister, report, reportPlaying, reportFinished } = deck;
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
  ]);

  const controls = deck.controls.get(id);
  const muted = controls?.muted ?? false;
  const soloed = controls?.soloed ?? false;
  const volume = controls?.volume ?? 1;

  // What this stem is actually doing, which is not always what its own buttons
  // say: anything not soloed is silent while something else is.
  const silenced = deck.soloing ? !soloed : muted;

  return (
    <section
      aria-label={stem.label}
      className={cx(
        'flex flex-col gap-3 rounded-lg border bg-surface p-4',
        'md:flex-row md:items-center md:gap-4',
        soloed ? 'border-accent' : 'border-line',
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-3 md:w-48 md:shrink-0">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{stem.label}</p>
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
