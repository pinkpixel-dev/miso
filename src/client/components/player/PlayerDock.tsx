import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import { audioUrl } from '../../lib/api.ts';
import { usePlayer, usePlayerInternals } from '../../lib/usePlayer.ts';
import { useStudio } from '../../lib/useStudio.ts';
import { Button, IconButton } from '../ui.tsx';

/**
 * The transport, docked along the bottom for the life of the session.
 *
 * This is rendered once by the shell and is never unmounted, never keyed, and
 * never wrapped in a conditional. Everything about how it reads its asset is
 * shaped by that: see the dependency array below, which is the fix recorded in
 * DOCS/ERRORS.md and is easy to undo by accident.
 *
 * The waveform is the scrubber. Wavesurfer already seeks on a click, so a
 * separate slider next to it would be a second control for one job and a second
 * thing to keep in sync.
 */

function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '--:--';
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function PlayerDock() {
  const { nowPlaying, playing, toggle } = usePlayer();
  const { surfer, autoplay, setPlaying } = usePlayerInternals();
  const { assets, computePeaksFor } = useStudio();

  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [elapsed, setElapsed] = useState(0);

  // The held take is a snapshot from the moment it was chosen. Reading the
  // current copy back out of the project keeps a rename or a freshly saved
  // waveform visible here, without the dock owning any of that.
  const asset = nowPlaying
    ? (assets.find((entry) => entry.id === nowPlaying.id) ?? nowPlaying)
    : undefined;

  // Peaks are read through a ref rather than depended on. Every refetch parses
  // the JSON again and hands back an array that is equal to the last one and is
  // not the same object, so depending on it rebuilt the player on any reload
  // and cut playback off mid track. What matters is whether peaks exist at all,
  // which changes once.
  const peaks = useRef(asset?.peaks);
  peaks.current = asset?.peaks;
  const hasPeaks = asset?.peaks !== undefined;

  const assetId = asset?.id;
  const projectId = asset?.projectId;
  const duration = asset?.durationSeconds;

  useEffect(() => {
    if (!container.current || assetId === undefined || projectId === undefined) return;

    setReady(false);
    setPlaying(false);
    setError(undefined);
    setElapsed(0);

    const instance = WaveSurfer.create({
      container: container.current,
      height: 48,
      waveColor: 'oklch(0.42 0.009 285)',
      progressColor: 'oklch(0.78 0.15 75)',
      cursorColor: 'oklch(0.97 0.002 285)',
      barWidth: 2,
      barGap: 1,
      normalize: true,
      // Stream through a media element rather than fetching and decoding the
      // whole file. This is what makes seeking a range request.
      backend: 'MediaElement',
      url: audioUrl(projectId, assetId),
      ...(peaks.current ? { peaks: peaks.current, duration } : {}),
    });

    instance.on('ready', () => {
      setReady(true);
      // A take chosen by a person starts on its own. One that is merely being
      // shown does not, which is what keeps a reload from making noise.
      if (autoplay.current) {
        autoplay.current = false;
        void instance.play();
      }
    });
    instance.on('play', () => setPlaying(true));
    instance.on('pause', () => setPlaying(false));
    instance.on('finish', () => setPlaying(false));
    instance.on('timeupdate', (time: number) => setElapsed(time));

    // Without this a load that fails leaves a disabled play button next to an
    // empty box, and nothing on the screen says why.
    instance.on('error', (cause) => {
      setError(cause instanceof Error ? cause.message : String(cause));
      setReady(false);
    });

    surfer.current = instance;

    return () => {
      instance.destroy();
      surfer.current = undefined;
    };
  }, [assetId, projectId, hasPeaks, duration, autoplay, setPlaying, surfer]);

  return (
    <div className="shrink-0 border-t border-line bg-surface">
      <div className="flex items-center gap-4 px-4 py-2.5">
        <IconButton
          label={
            asset === undefined
              ? 'Nothing to play'
              : playing
                ? `Pause ${asset.label}`
                : `Play ${asset.label}`
          }
          icon={playing ? Pause : Play}
          variant="primary"
          disabled={!ready}
          onClick={toggle}
        />

        <div className="min-w-0 w-44 shrink-0 sm:w-56">
          {asset ? (
            <>
              <p className="truncate text-sm text-ink">{asset.label}</p>
              <p className="truncate text-xs text-ink-faint">{asset.format}</p>
            </>
          ) : (
            <p className="truncate text-sm text-ink-faint">Nothing playing</p>
          )}
        </div>

        {/*
          The container stays mounted whether or not anything is loaded, so
          wavesurfer always has somewhere to attach and the dock never changes
          height when playback starts.
        */}
        <div className="min-w-0 flex-1">
          <div ref={container} className="w-full" />
          {asset === undefined ? (
            <div className="h-12 rounded-sm border border-dashed border-line" aria-hidden="true" />
          ) : null}
        </div>

        <p className="shrink-0 font-mono text-xs text-ink-muted tabular-nums">
          {formatTime(asset ? elapsed : undefined)} / {formatTime(asset?.durationSeconds)}
        </p>

        {asset && !hasPeaks ? (
          <Button variant="ghost" onClick={() => void computePeaksFor(asset.id)}>
            Save waveform
          </Button>
        ) : null}
      </div>

      {error && asset ? (
        <p
          role="alert"
          className="border-t border-bad/30 bg-bad/10 px-4 py-2 text-sm text-ink"
        >
          This track could not be loaded for playback: {error} The file itself is probably fine, so
          try Export to check. If it plays there, reload this page.
        </p>
      ) : null}
    </div>
  );
}
