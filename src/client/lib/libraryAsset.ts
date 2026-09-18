import type { Asset, LibraryTake } from '../../shared/types.ts';
import { api } from './api.ts';

/**
 * A library row, turned into a take something can actually play.
 *
 * The library list is metadata for the whole database, so it carries no peaks.
 * Anything that loads a take draws from stored peaks or else downloads the
 * whole file to work them out, which for a three minute WAV is 34 MB. So the
 * asset is fetched whole before it is handed over.
 *
 * A fetch that fails is not a refusal. The row already holds everything needed
 * to play the file, so what is lost is the waveform and not the take, and the
 * caller is told what went wrong rather than being handed nothing.
 *
 * This lives here rather than in the library page because the compare page
 * needs the same take from the same kind of row for the same reason.
 */
export interface LoadedLibraryAsset {
  asset: Asset;
  /** Why the full asset could not be fetched, when it could not. */
  error: string | undefined;
}

export async function loadLibraryAsset(take: LibraryTake): Promise<LoadedLibraryAsset> {
  try {
    return { asset: await api.getAsset(take.projectId, take.assetId), error: undefined };
  } catch (cause) {
    return {
      asset: fallbackAsset(take),
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

/**
 * What a row alone can say about a take.
 *
 * Everything here is carried by the row except the checksum, which the library
 * does not send and nothing playing a take reads. Peaks are absent, which is
 * the whole difference between this and the real thing.
 */
function fallbackAsset(take: LibraryTake): Asset {
  return {
    id: take.assetId,
    projectId: take.projectId,
    kind: take.kind,
    label: take.label,
    filename: `${take.label}.${take.format}`,
    format: take.format,
    bytes: take.bytes,
    checksum: '',
    durationSeconds: take.durationSeconds,
    createdAt: take.createdAt,
  } satisfies Asset;
}
