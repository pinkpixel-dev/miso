import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import type { Asset } from '../../shared/types.ts';
import { audioUrl } from '../lib/api.ts';
import { Button } from './ui.tsx';

/**
 * One player for the whole project view.
 *
 * There is deliberately not one of these per row. Several live wavesurfer
 * instances hold several decoded buffers, which is a memory problem on a phone,
 * and only one can usefully play at a time anyway.
 *
 * When the asset has peaks, they are handed to wavesurfer with the duration, so
 * it renders from stored numbers and never downloads or decodes the file to
 * draw. Playback still streams through the media element by range request.
 */
export function WaveformPlayer({
  asset,
  onComputePeaks,
}: {
  asset: Asset;
  onComputePeaks: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const surfer = useRef<WaveSurfer | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Peaks are read through a ref rather than depended on.
  //
  // Every refetch of the project parses the JSON again and hands back an array
  // that is equal to the last one and is not the same object. Depending on it
  // rebuilt the player on any reload, which stops playback mid track: finish a
  // generation while listening to something and the track you were playing
  // would cut out. What actually matters is whether peaks exist at all, which
  // changes once, when Draw waveform finishes.
  const peaks = useRef(asset.peaks);
  peaks.current = asset.peaks;
  const hasPeaks = asset.peaks !== undefined;

  useEffect(() => {
    if (!container.current) return;

    setReady(false);
    setPlaying(false);
    setError(undefined);

    const instance = WaveSurfer.create({
      container: container.current,
      height: 96,
      waveColor: 'oklch(0.42 0.009 285)',
      progressColor: 'oklch(0.78 0.15 75)',
      cursorColor: 'oklch(0.97 0.002 285)',
      barWidth: 2,
      barGap: 1,
      normalize: true,
      // Stream through a media element rather than fetching and decoding the
      // whole file. This is what makes seeking a range request.
      backend: 'MediaElement',
      url: audioUrl(asset.projectId, asset.id),
      ...(peaks.current ? { peaks: peaks.current, duration: asset.durationSeconds } : {}),
    });

    instance.on('ready', () => setReady(true));
    instance.on('play', () => setPlaying(true));
    instance.on('pause', () => setPlaying(false));
    instance.on('finish', () => setPlaying(false));

    // Without this a load that fails leaves a disabled Play button next to an
    // empty box, and nothing on the screen says why. The track is usually fine:
    // Export it and it plays. Saying so is the difference between a bug and a
    // stale tab nobody can tell apart.
    instance.on('error', (cause) => {
      setError(cause instanceof Error ? cause.message : String(cause));
      setReady(false);
    });

    surfer.current = instance;

    return () => {
      instance.destroy();
      surfer.current = undefined;
    };
  }, [asset.id, asset.projectId, hasPeaks, asset.durationSeconds]);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink">{asset.label}</p>
        <div className="flex gap-2">
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() => void surfer.current?.playPause()}
            aria-label={playing ? `Pause ${asset.label}` : `Play ${asset.label}`}
          >
            {playing ? 'Pause' : 'Play'}
          </Button>
          {asset.peaks ? null : (
            <Button variant="secondary" onClick={onComputePeaks}>
              Draw waveform
            </Button>
          )}
        </div>
      </div>

      <div ref={container} className="w-full" />

      {error ? (
        <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink">
          This track could not be loaded for playback: {error} The file itself is probably fine, so
          try Export to check. If it plays there, reload this page.
        </p>
      ) : asset.peaks ? null : (
        <p className="text-sm text-ink-muted">
          No waveform stored for this track yet. It plays normally. Choose Draw waveform to work it
          out in this browser and save it for every device.
        </p>
      )}
    </div>
  );
}
