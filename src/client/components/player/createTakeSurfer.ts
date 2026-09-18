import WaveSurfer from 'wavesurfer.js';
import { audioUrl } from '../../lib/api.ts';

/**
 * One wavesurfer instance, built for one take into one container.
 *
 * This lives here rather than inside the dock's effect because there is now
 * more than one caller. The dock builds the take you are listening to, and the
 * comparison pair builds the take you are listening against. Both want exactly
 * the same instance, and two copies of these options would drift.
 *
 * Extracting it is also a guard. `DOCS/ERRORS.md` records the dock's effect
 * killing playback mid track when its dependency array was wrong, and the
 * effect that rebuilds an instance is a much easier thing to keep correct when
 * it does not also hold every detail of how one is made. What belongs in the
 * effect is when to rebuild. What belongs here is what to build.
 *
 * The dock still owns the instance it gets back, because the dock is the thing
 * with a container element and a lifetime to tie it to.
 */

/** What a caller wants to hear about. Every one is optional. */
export interface TakeSurferHandlers {
  onReady?: (instance: WaveSurfer) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onFinish?: (instance: WaveSurfer) => void;
  onTime?: (seconds: number) => void;
  onError?: (message: string) => void;
}

export function createTakeSurfer({
  container,
  projectId,
  assetId,
  peaks,
  duration,
  handlers,
}: {
  container: HTMLElement;
  projectId: string;
  assetId: string;
  /** Stored peaks, when the take has them. Drawn instead of decoding the file. */
  peaks: number[][] | undefined;
  /** Required alongside peaks, because peaks alone cannot say how long a take is. */
  duration: number | undefined;
  handlers: TakeSurferHandlers;
}): WaveSurfer {
  const instance = WaveSurfer.create({
    container,
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
    // Passed together or not at all. Peaks without a duration draw a waveform
    // of unknown length, and wavesurfer then has nothing to scale it against.
    ...(peaks ? { peaks, duration } : {}),
  });

  if (handlers.onReady) instance.on('ready', () => handlers.onReady?.(instance));
  if (handlers.onPlay) instance.on('play', () => handlers.onPlay?.());
  if (handlers.onPause) instance.on('pause', () => handlers.onPause?.());
  if (handlers.onFinish) instance.on('finish', () => handlers.onFinish?.(instance));
  if (handlers.onTime) instance.on('timeupdate', (time: number) => handlers.onTime?.(time));
  if (handlers.onError) {
    instance.on('error', (cause) =>
      handlers.onError?.(cause instanceof Error ? cause.message : String(cause)),
    );
  }

  return instance;
}
