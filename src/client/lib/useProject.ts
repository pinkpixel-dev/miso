import { useCallback, useEffect, useState } from 'react';
import type { Asset, Project } from '../../shared/types.ts';
import { api } from './api.ts';
import { computePeaks } from './computePeaks.ts';
import { uploadAsset } from './upload.ts';

export interface ImportProgress {
  filename: string;
  fraction: number;
  stage: 'uploading' | 'analysing';
}

/**
 * One project, its assets, and the import flow.
 *
 * Import is two steps by design. The upload finishes and the asset exists
 * before the browser decodes anything, so a decode that fails, which a phone
 * can do on a long uncompressed file, costs the waveform and never the upload.
 * A peaks failure is therefore not surfaced as an import error.
 */
export function useProject(id: string | undefined) {
  const [project, setProject] = useState<Project | undefined>();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<ImportProgress | undefined>();

  const load = useCallback(async () => {
    // No project selected is a real state now that the shell outlives the
    // route. It is emptiness, not an error, so nothing is reported.
    if (id === undefined) {
      setProject(undefined);
      setAssets([]);
      setError(undefined);
      setLoading(false);
      return;
    }

    try {
      const detail = await api.getProject(id);
      setProject(detail.project);
      setAssets(detail.assets);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const importFile = useCallback(
    async (file: File) => {
      if (id === undefined) return;
      setImporting({ filename: file.name, fraction: 0, stage: 'uploading' });
      setError(undefined);

      let asset: Asset;
      try {
        const upload = uploadAsset(id, file, (fraction) =>
          setImporting((current) => (current ? { ...current, fraction } : current)),
        );
        asset = await upload.promise;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setImporting(undefined);
        return;
      }

      // The asset is on disk and playable from here on. Everything below is
      // enrichment, and a failure in it leaves the import successful.
      setAssets((current) => [asset, ...current]);
      setImporting({ filename: file.name, fraction: 1, stage: 'analysing' });

      try {
        const peaks = await computePeaks(file);
        const withPeaks = await api.setAssetPeaks(id, asset.id, peaks);
        setAssets((current) => current.map((a) => (a.id === withPeaks.id ? withPeaks : a)));
      } catch {
        // No waveform for now. The asset is fine, and any device that opens the
        // project later can compute the peaks and fill them in.
      } finally {
        setImporting(undefined);
        void load();
      }
    },
    [id, load],
  );

  const renameProject = useCallback(
    async (name: string) => {
      if (id === undefined) return;
      try {
        setProject(await api.renameProject(id, name));
        setError(undefined);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [id],
  );

  const renameAsset = useCallback(
    async (assetId: string, label: string) => {
      if (id === undefined) return;
      try {
        const updated = await api.renameAsset(id, assetId, label);
        setAssets((current) => current.map((a) => (a.id === assetId ? updated : a)));
        setError(undefined);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [id],
  );

  const removeAsset = useCallback(
    async (assetId: string) => {
      if (id === undefined) return;
      try {
        setAssets(await api.deleteAsset(id, assetId));
        setError(undefined);
        void load();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [id, load],
  );

  /** Fills in a waveform for an asset that has none, from this browser. */
  /**
   * Draws a track's waveform and stores it.
   *
   * The service is asked first. It can read a WAV without the browser fetching
   * anything, which matters because the browser route has to pull the whole
   * file: 34 MB for a three minute track, large enough that an extension can
   * intercept it, and when one does there is no way to draw the waveform at
   * all. Anything the service will not read, which is every compressed format,
   * falls through to decoding here, where the decoder is.
   */
  const computePeaksFor = useCallback(
    async (assetId: string) => {
      if (id === undefined) return;
      const asset = assets.find((a) => a.id === assetId);
      if (!asset) return;

      const store = (updated: Asset) =>
        setAssets((current) => current.map((a) => (a.id === assetId ? updated : a)));

      try {
        store(await api.readAssetPeaks(id, assetId));
        setError(undefined);
        return;
      } catch {
        // Not an error worth showing. It means this format is the browser's
        // job, which is the next thing that happens.
      }

      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(id)}/assets/${encodeURIComponent(assetId)}/audio`,
        );
        const blob = await response.blob();
        const peaks = await computePeaks(new File([blob], asset.filename));
        store(await api.setAssetPeaks(id, assetId, peaks));
        setError(undefined);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [assets, id],
  );

  return {
    project,
    assets,
    error,
    loading,
    importing,
    importFile,
    renameProject,
    renameAsset,
    removeAsset,
    computePeaksFor,
    reload: load,
  };
}
