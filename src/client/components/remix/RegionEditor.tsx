import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin, { type Region as WaveRegion } from 'wavesurfer.js/dist/plugins/regions.esm.js';
import type { Asset } from '../../../shared/types.ts';
import { audioUrl } from '../../lib/api.ts';
import { clampRegion, formatSeconds, type Region } from '../../lib/region.ts';
import { Button } from '../ui.tsx';

/**
 * The waveform you place a region on.
 *
 * This owns its own wavesurfer instance rather than borrowing the dock's, for
 * two reasons. The dock is a strip along the bottom of the window, which is a
 * bad place to put a boundary to the tenth of a second. And the dock builds its
 * instance inside an effect whose dependencies rebuild the player, a trap
 * DOCS/ERRORS.md records twice, so adding region state to those dependencies is
 * how a track gets cut off mid playback.
 *
 * Nothing new is decoded and no new endpoint is needed. The peaks are already
 * on the asset row and playback goes through the same range-request URL the
 * dock uses.
 */

const WAVE_HEIGHT = 160;

export function RegionEditor({
  asset,
  region,
  duration,
  onRegion,
  onDuration,
  onBeforePlay,
}: {
  asset: Asset;
  region: Region;
  /** What the page believes the track is, so both agree before wavesurfer loads. */
  duration: number;
  onRegion: (region: Region) => void;
  /** Wavesurfer's own reading, once it has one. */
  onDuration: (seconds: number) => void;
  /** Called before this player starts, so the dock can get out of the way. */
  onBeforePlay: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const surfer = useRef<WaveSurfer | undefined>(undefined);
  const handle = useRef<WaveRegion | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Peaks are read through a ref rather than depended on. Every refetch parses
  // the JSON again and hands back an array equal to the last one and not the
  // same object, so depending on it rebuilds the instance on any reload. What
  // matters is whether peaks exist at all, which changes once.
  const peaks = useRef(asset.peaks);
  peaks.current = asset.peaks;
  const hasPeaks = asset.peaks !== undefined;

  // The same trick for the things the wavesurfer callbacks need to reach. A
  // region that changed must not rebuild the player underneath it.
  const wanted = useRef(region);
  wanted.current = region;
  const report = useRef(onRegion);
  report.current = onRegion;
  const reportDuration = useRef(onDuration);
  reportDuration.current = onDuration;

  const assetId = asset.id;
  const projectId = asset.projectId;

  useEffect(() => {
    if (!container.current) return;

    setReady(false);
    setPlaying(false);
    setError(undefined);

    const plugin = RegionsPlugin.create();
    const instance = WaveSurfer.create({
      container: container.current,
      height: WAVE_HEIGHT,
      waveColor: 'oklch(0.42 0.009 285)',
      progressColor: 'oklch(0.78 0.15 75)',
      cursorColor: 'oklch(0.97 0.002 285)',
      barWidth: 2,
      barGap: 1,
      normalize: true,
      // Stream through a media element rather than fetching and decoding the
      // whole file, the same as the dock. Seeking stays a range request.
      backend: 'MediaElement',
      url: audioUrl(projectId, assetId),
      plugins: [plugin],
      ...(peaks.current ? { peaks: peaks.current, duration } : {}),
    });

    instance.on('ready', () => {
      const measured = instance.getDuration();
      if (Number.isFinite(measured) && measured > 0) reportDuration.current(measured);

      const opening = clampRegion(wanted.current, measured || duration);
      handle.current = plugin.addRegion({
        id: 'repaint',
        start: opening.start,
        end: opening.end,
        drag: true,
        resize: true,
        color: 'oklch(0.78 0.15 75 / 0.22)',
      });

      setReady(true);
      report.current(opening);
    });

    // Dragging either handle, or the whole block. The page is told once the
    // gesture finishes rather than on every frame, so a drag does not queue a
    // hundred renders.
    plugin.on('region-updated', (updated) => {
      report.current(clampRegion({ start: updated.start, end: updated.end }, instance.getDuration()));
    });

    instance.on('play', () => setPlaying(true));
    instance.on('pause', () => setPlaying(false));
    instance.on('finish', () => setPlaying(false));

    instance.on('error', (cause) => {
      setError(cause instanceof Error ? cause.message : String(cause));
      setReady(false);
    });

    surfer.current = instance;

    return () => {
      handle.current = undefined;
      instance.destroy();
      surfer.current = undefined;
    };
  }, [assetId, projectId, hasPeaks, duration]);

  // A region changed by the number boxes or the arrow keys has to reach the
  // rectangle. Guarded on a real difference so the region's own updates do not
  // bounce back into it.
  useEffect(() => {
    const current = handle.current;
    if (!ready || !current) return;
    if (current.start === region.start && current.end === region.end) return;
    current.setOptions({ start: region.start, end: region.end });
  }, [ready, region.start, region.end]);

  function playRegion() {
    const instance = surfer.current;
    const current = handle.current;
    if (!instance || !current) return;

    if (playing) {
      instance.pause();
      return;
    }

    // Two players on one page would otherwise talk over each other.
    onBeforePlay();
    current.play(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={container}
        className="w-full rounded-lg border border-line bg-surface px-2 py-2"
        // The rectangle is a picture of the region. The numbers below it are
        // the accessible control, so this is not exposed as one.
        aria-hidden="true"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={!ready}
          onClick={playRegion}
          className="min-h-11"
        >
          {playing ? (
            <Pause aria-hidden="true" className="h-4 w-4 shrink-0" />
          ) : (
            <Play aria-hidden="true" className="h-4 w-4 shrink-0" />
          )}
          {playing ? 'Stop' : 'Play the region'}
        </Button>

        <p className="text-sm text-ink-muted">
          {formatSeconds(region.start)} to {formatSeconds(region.end)}, lasting{' '}
          <span className="text-ink">{(region.end - region.start).toFixed(1)} seconds</span>
        </p>

        {!ready && error === undefined ? (
          <p className="text-sm text-ink-faint">Loading the waveform.</p>
        ) : null}
      </div>

      {error !== undefined ? (
        <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink">
          This track could not be loaded for editing: {error} The file itself is probably fine, so
          try Export to check. If it plays there, reload this page.
        </p>
      ) : null}
    </div>
  );
}
