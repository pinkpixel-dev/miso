import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin, { type Region as WaveRegion } from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { PEAK_BUCKETS } from '../../../shared/limits.ts';
import { bucketPeaks } from '../../../shared/peaks.ts';
import { clampRegion, formatSeconds, type Region } from '../../lib/region.ts';
import { renderToWav } from '../../lib/saveAudio.ts';
import { Button } from '../ui.tsx';

/**
 * The waveform of audio that is not on the service yet.
 *
 * Every other waveform in Miso is a take with an address, streamed by range
 * request from `audioUrl`. This one has no address. It may be a file dropped
 * from the disk that has never been uploaded, and even when it came from a take
 * it is not that take any more once an edit is on it.
 *
 * So the rendered samples are encoded to a WAV blob and the blob is what plays.
 * The picture is drawn from `bucketPeaks`, the same bucketing the library
 * stores, which means the waveform here looks like the waveform everywhere
 * else and nothing has to decode the blob again to draw it.
 *
 * The instance is built once for the life of the container and reloaded when
 * the audio changes, rather than being destroyed and rebuilt. `DOCS/ERRORS.md`
 * records the dock cutting off playback mid track because its instance sat in
 * an effect whose dependencies changed, and the way to not repeat that is to
 * keep what rebuilds the instance and what changes its contents apart.
 */

const WAVE_HEIGHT = 160;

export function WaveformEditor({
  channels,
  sampleRate,
  duration,
  region,
  onRegion,
  onCutPoint,
  onBeforePlay,
}: {
  /** The rendered audio, with every edit already applied. */
  channels: Float32Array[];
  sampleRate: number;
  duration: number;
  region: Region;
  onRegion: (region: Region) => void;
  /**
   * Where somebody put the cursor, which is what a split cuts at.
   *
   * Only a deliberate click or drag reports here, never playback. A cut point
   * that crept along with the play head could not be typed into, and would
   * wander off the moment you auditioned the track before cutting it.
   */
  onCutPoint: (seconds: number) => void;
  /** Called before this player starts, so the dock can get out of the way. */
  onBeforePlay: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const surfer = useRef<WaveSurfer | undefined>(undefined);
  const regions = useRef<RegionsPlugin | undefined>(undefined);
  const handle = useRef<WaveRegion | undefined>(undefined);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Read through refs rather than depended on, so a region the page changed
  // does not rebuild the player underneath the person using it.
  const wanted = useRef(region);
  wanted.current = region;
  const report = useRef(onRegion);
  report.current = onRegion;
  const reportCutPoint = useRef(onCutPoint);
  reportCutPoint.current = onCutPoint;

  // Built once. Nothing in here changes for the life of the container.
  useEffect(() => {
    if (!container.current) return;

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
      // A blob URL through a media element, the same backend the rest of the
      // studio uses. There is no network here, so nothing is being streamed,
      // but keeping one backend means one set of behaviours to know about.
      backend: 'MediaElement',
      plugins: [plugin],
    });

    plugin.on('region-updated', (updated) => {
      report.current(
        clampRegion({ start: updated.start, end: updated.end }, instance.getDuration()),
      );
    });

    instance.on('play', () => setPlaying(true));
    instance.on('pause', () => setPlaying(false));
    instance.on('finish', () => setPlaying(false));
    // Interaction only. `timeupdate` fires several times a second during
    // playback, and a cut point moving on its own is not a cut point.
    instance.on('interaction', (time: number) => reportCutPoint.current(time));
    instance.on('error', (cause) => {
      setError(cause instanceof Error ? cause.message : String(cause));
      setReady(false);
    });

    surfer.current = instance;
    regions.current = plugin;

    return () => {
      handle.current = undefined;
      regions.current = undefined;
      instance.destroy();
      surfer.current = undefined;
    };
  }, []);

  // The audio itself, reloaded whenever the edit chain renders something new.
  // The blob URL is created and revoked together, so the only one alive is the
  // one currently loaded.
  useEffect(() => {
    const instance = surfer.current;
    if (!instance || channels.length === 0) return;

    setReady(false);
    setPlaying(false);
    setError(undefined);

    const url = URL.createObjectURL(renderToWav(channels, sampleRate));

    const onReady = () => {
      const measured = instance.getDuration() || duration;

      // The rectangle belongs to the audio that is loaded, so it is rebuilt
      // against the new length rather than left pointing at the old one.
      const opening = clampRegion(wanted.current, measured);
      regions.current?.clearRegions();
      handle.current = regions.current?.addRegion({
        id: 'keep',
        start: opening.start,
        end: opening.end,
        drag: true,
        resize: true,
        color: 'oklch(0.78 0.15 75 / 0.22)',
      });

      setReady(true);
      report.current(opening);
    };

    instance.once('ready', onReady);
    // Peaks are passed in, so the blob is played rather than decoded a second
    // time to draw a picture of samples this page already holds.
    void instance.load(url, bucketPeaks(channels, PEAK_BUCKETS), duration);

    return () => {
      instance.un('ready', onReady);
      URL.revokeObjectURL(url);
    };
  }, [channels, sampleRate, duration]);

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

  function playAll() {
    const instance = surfer.current;
    if (!instance) return;

    if (playing) {
      instance.pause();
      return;
    }

    onBeforePlay();
    void instance.play();
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={container}
        className="w-full rounded-lg border border-line bg-surface px-2 py-2"
        // The rectangle is a picture of the region. The number boxes below it
        // are the accessible control, so this is not exposed as one.
        aria-hidden="true"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={!ready} onClick={playAll} className="min-h-11">
          {playing ? (
            <Pause aria-hidden="true" className="h-4 w-4 shrink-0" />
          ) : (
            <Play aria-hidden="true" className="h-4 w-4 shrink-0" />
          )}
          {playing ? 'Stop' : 'Play all of it'}
        </Button>

        <Button variant="ghost" disabled={!ready} onClick={playRegion} className="min-h-11">
          <Play aria-hidden="true" className="h-4 w-4 shrink-0" />
          Play the region
        </Button>

        <p className="text-sm text-ink-muted">
          {formatSeconds(region.start)} to {formatSeconds(region.end)}, lasting{' '}
          <span className="text-ink">{(region.end - region.start).toFixed(1)} seconds</span>
        </p>

        {!ready && error === undefined ? (
          <p className="text-sm text-ink-faint">Drawing the waveform.</p>
        ) : null}
      </div>

      {error !== undefined ? (
        <p
          role="alert"
          className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink"
        >
          This audio could not be loaded for editing: {error}
        </p>
      ) : null}
    </div>
  );
}
