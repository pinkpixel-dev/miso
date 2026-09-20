import { MAX_ASSET_BYTES, PEAK_BUCKETS } from '../../shared/limits.ts';
import { bucketPeaks } from '../../shared/peaks.ts';
import type { Asset } from '../../shared/types.ts';
import { wavByteLength, writeWav } from '../../shared/wav.ts';
import { api } from './api.ts';
import { SAVED_FORMAT } from './decodeFile.ts';
import { uploadAsset } from './upload.ts';

/**
 * Putting edited samples into a project as a take.
 *
 * Nothing new on the service. This encodes a WAV in the browser and posts it to
 * the same route an import uses, so a take saved from the workbench is
 * indistinguishable from a file you dragged in, which is the point: it has to
 * be usable as a source by every tool that already exists.
 *
 * Peaks are sent from the samples already in memory rather than by decoding the
 * result again. The import path decodes twice because it never held the samples
 * in the first place. This one did the work, so it keeps it.
 */

/** Room to breathe under the hard limit, so a near miss is not a failed upload. */
const MEGABYTE = 1024 * 1024;

export interface SizeCheck {
  bytes: number;
  overLimit: boolean;
  /** The limit itself, so a message can quote it without importing limits too. */
  limitBytes: number;
}

/**
 * Whether this would fit, asked before anything is encoded.
 *
 * The sample rate does not come into it. The frame count already carries the
 * rate it was counted at, so the bytes are frames times channels times two,
 * whatever rate those frames are played back at.
 */
export function checkSize(channels: Float32Array[]): SizeCheck {
  const bytes = wavByteLength(channels[0]?.length ?? 0, channels.length);
  return { bytes, overLimit: bytes > MAX_ASSET_BYTES, limitBytes: MAX_ASSET_BYTES };
}

/** Bytes as a figure a person reads, matching how the rest of the studio says it. */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / MEGABYTE).toFixed(1)} MB`;
}

/** The encoded file, ready to upload or to hand to a waveform. */
export function renderToWav(channels: Float32Array[], sampleRate: number): Blob {
  const bytes = writeWav(channels, sampleRate);
  return new Blob([bytes], { type: 'audio/wav' });
}

export interface SaveProgress {
  /** How much of the upload has been sent, 0 to 1. */
  fraction: number;
  stage: 'encoding' | 'uploading' | 'saving-waveform';
}

/**
 * Encodes, uploads, and fills in the waveform.
 *
 * The asset is real and playable the moment the upload returns. The peaks are
 * enrichment after that, so a failure to store them is swallowed exactly as the
 * import path swallows it: a take with no saved waveform is a take that draws
 * itself the slow way, not a take that failed to save.
 */
export async function saveToProject({
  projectId,
  channels,
  sampleRate,
  filename,
  onProgress,
}: {
  projectId: string;
  channels: Float32Array[];
  sampleRate: number;
  filename: string;
  onProgress?: (progress: SaveProgress) => void;
}): Promise<Asset> {
  if (channels.length === 0 || (channels[0]?.length ?? 0) === 0) {
    throw new Error('There is nothing to save. The edit left no audio.');
  }

  const size = checkSize(channels);
  if (size.overLimit) {
    throw new Error(
      `That would be ${formatMegabytes(size.bytes)}, over the ${formatMegabytes(size.limitBytes)} limit. Trim it down, or save it at 44.1 kHz.`,
    );
  }

  onProgress?.({ fraction: 0, stage: 'encoding' });
  const blob = renderToWav(channels, sampleRate);
  const file = new File([blob], filename, { type: 'audio/wav' });

  onProgress?.({ fraction: 0, stage: 'uploading' });
  const upload = uploadAsset(projectId, file, (fraction) =>
    onProgress?.({ fraction, stage: 'uploading' }),
  );
  const asset = await upload.promise;

  onProgress?.({ fraction: 1, stage: 'saving-waveform' });
  try {
    return await api.setAssetPeaks(projectId, asset.id, bucketPeaks(channels, PEAK_BUCKETS));
  } catch {
    // The take is saved and playable. A missing waveform fills itself in the
    // next time anything opens the project.
    return asset;
  }
}

/** The format every save writes, which the upload route checks by extension. */
export { SAVED_FORMAT };
