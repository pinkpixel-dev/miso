import type { AssetFormat } from '../../shared/types.ts';
import { writeWav } from '../../shared/wav.ts';
import { audioUrl, downloadUrl } from './api.ts';
import { decodeFile } from './decodeFile.ts';
import { encodeMp3, type Mp3Bitrate } from './encodeMp3.ts';
import { fetchInRanges } from './fetchRanged.ts';

/**
 * Getting a file back out of Miso, in the format you want it in.
 *
 * The important case is the one that does nothing. Exporting a take in the
 * format it is already stored in stays the plain link it has always been, so
 * the common path is instant and hands back exactly the stored bytes. Only a
 * change of format costs anything.
 *
 * A change of format happens in the browser, like everything else the workbench
 * does. The service has no decoder and no encoder, and putting either there
 * would block the event loop for seconds on a file one person asked for by
 * hand.
 */

/** What a file can be exported as. Not the same as what can be imported. */
export const EXPORT_FORMATS = ['wav', 'mp3'] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface ExportProgress {
  stage: 'reading' | 'decoding' | 'encoding';
  /** How far through the current stage, 0 to 1. */
  fraction: number;
}

/** Swaps the extension, keeping a name that has dots in it intact. */
export function withExtension(filename: string, extension: string): string {
  const stem = filename.replace(/\.[^.]+$/, '') || 'audio';
  return `${stem}.${extension}`;
}

/**
 * Whether asking for this format means doing any work.
 *
 * A stored `wav` asked for as `wav` is a link. Anything else has to be read,
 * decoded and written again.
 */
export function needsConversion(stored: AssetFormat, want: ExportFormat): boolean {
  return stored !== want;
}

/** Hands the browser a file to save, under a name. */
function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    // Safari needs the URL to outlive the click, and every browser is happy to
    // have it released on the next turn of the loop.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * The plain link, for when the stored bytes are already what was asked for.
 *
 * With no name, the browser takes the one the service sends in
 * `content-disposition`, which is the name the file was imported under. That is
 * a promise the README makes about export, so a name is only forced when the
 * caller actually knows a better one.
 */
export function exportStored(projectId: string, assetId: string, filename?: string): void {
  const anchor = document.createElement('a');
  anchor.href = downloadUrl(projectId, assetId);
  if (filename !== undefined) anchor.download = filename;
  anchor.click();
}

export async function exportAsset({
  projectId,
  assetId,
  filename,
  label,
  storedFormat,
  want,
  bitrate,
  onProgress,
}: {
  projectId: string;
  assetId: string;
  /**
   * The stored name, when the caller knows it.
   *
   * Left out where the row does not carry one, such as a library take. An
   * export in the stored format then lets the service name the file, and a
   * converted one falls back to the label.
   */
  filename?: string;
  /** What the file is called on screen, used to name a converted file. */
  label: string;
  storedFormat: AssetFormat;
  want: ExportFormat;
  bitrate?: Mp3Bitrate;
  onProgress?: (progress: ExportProgress) => void;
}): Promise<void> {
  if (!needsConversion(storedFormat, want)) {
    exportStored(projectId, assetId, filename);
    return;
  }

  // A converted file is a new file and needs a new name, so the label is a fine
  // fallback where the stored name is not known.
  const naming = filename ?? `${label}.${storedFormat}`;

  // Ranged pieces, never one request. A whole file fetch is refused outright in
  // a browser profile with extensions in it, which DOCS/ERRORS.md records twice.
  onProgress?.({ stage: 'reading', fraction: 0 });
  const bytes = await fetchInRanges(audioUrl(projectId, assetId), (progress) =>
    onProgress?.({ stage: 'reading', fraction: progress.fraction }),
  );

  onProgress?.({ stage: 'decoding', fraction: 0 });
  const decoded = await decodeFile(new File([bytes], naming));

  onProgress?.({ stage: 'encoding', fraction: 0 });
  const blob =
    want === 'mp3'
      ? await encodeMp3(decoded.channels, decoded.sampleRate, {
          bitrate,
          onProgress: (progress) => onProgress?.({ stage: 'encoding', fraction: progress.fraction }),
        })
      : new Blob([writeWav(decoded.channels, decoded.sampleRate)], { type: 'audio/wav' });

  onProgress?.({ stage: 'encoding', fraction: 1 });
  save(blob, withExtension(naming, want));
}
