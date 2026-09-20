import { useCallback, useMemo, useState } from 'react';
import { MAX_ASSET_BYTES } from '../../shared/limits.ts';
import { resampleChannels, resampledLength } from '../../shared/resample.ts';
import type { Asset } from '../../shared/types.ts';
import { wavByteLength } from '../../shared/wav.ts';
import { audioUrl } from './api.ts';
import { decodeFile, savedFilename } from './decodeFile.ts';
import { fetchInRanges } from './fetchRanged.ts';
import { applyEdits, cutAt, durationOf, peakOf, type Edit } from './edits.ts';
import { saveToProject, type SaveProgress } from './saveAudio.ts';

/**
 * The workbench's state: one source, a list of edits, and where it saves to.
 *
 * All of the arithmetic lives in `edits.ts` and `shared/resample.ts`, which are
 * pure and tested. What is left here is the part that has to be a hook: holding
 * the decoded source, keeping the rendered result in step with the edit list,
 * and talking to the upload route.
 *
 * The source is never modified. Rendering means applying the whole edit list to
 * it again, which is what makes undo a matter of dropping the last entry rather
 * than keeping a buffer per step. Rendering is memoised on the list, so typing
 * in a form does not re-run it.
 */

/** The audio being worked on, and what it came from. */
export interface WorkbenchSource {
  /** What to call the result, before the suffix goes on. */
  name: string;
  channels: Float32Array[];
  /** The rate these samples are at, which is the rate the file was written at. */
  sampleRate: number;
  durationSeconds: number;
  container?: string;
  codec?: string;
  /** True when the browser resampled on the way in and could not be stopped. */
  resampledOnDecode: boolean;
  /** Set when this came from a take rather than from a file on disk. */
  fromAssetId?: string;
}

/** The two rates worth offering, and what each one is for. */
export const OUTPUT_RATES = [
  { rate: 44_100, label: '44.1 kHz', purpose: 'What stem separation and voice conversion need' },
  { rate: 48_000, label: '48 kHz', purpose: 'What generation writes, and what most video wants' },
] as const;

export type OutputRate = (typeof OUTPUT_RATES)[number]['rate'];

export const DEFAULT_OUTPUT_RATE: OutputRate = 44_100;

/** What the page is doing while a source is on its way in. */
export interface LoadProgress {
  stage: 'reading' | 'decoding';
  /** How much of the file has arrived. Always 1 while decoding. */
  fraction: number;
}

export interface WorkbenchState {
  source: WorkbenchSource | undefined;
  loading: LoadProgress | undefined;
  error: string | undefined;
  clearError: () => void;

  loadFile: (file: File) => Promise<void>;
  loadTake: (asset: Asset) => Promise<void>;
  /** Drops the source and everything done to it, back to an empty page. */
  reset: () => void;

  edits: Edit[];
  pushEdit: (edit: Edit) => void;
  undo: () => void;
  clearEdits: () => void;

  /** The source with every edit applied, still at the source's own rate. */
  rendered: Float32Array[];
  renderedDuration: number;
  renderedPeak: number;

  outputRate: OutputRate;
  setOutputRate: (rate: OutputRate) => void;
  /** How big the saved file will be, at the output rate. */
  outputBytes: number;
  overLimit: boolean;

  saving: SaveProgress | undefined;
  /** Saves the rendered audio as a take. Returns the asset, or undefined on failure. */
  save: (suffix: string) => Promise<Asset | undefined>;
  /**
   * Cuts at a point and saves both halves as takes.
   *
   * The one operation that produces two results, so it is not an entry on the
   * edit chain. Everything on the chain takes audio and gives back audio, and
   * this gives back two.
   */
  splitAt: (seconds: number) => Promise<boolean>;
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useWorkbench(
  projectId: string | undefined,
  onSaved: () => void,
): WorkbenchState {
  const [source, setSource] = useState<WorkbenchSource | undefined>();
  const [edits, setEdits] = useState<Edit[]>([]);
  const [outputRate, setOutputRate] = useState<OutputRate>(DEFAULT_OUTPUT_RATE);
  const [loading, setLoading] = useState<LoadProgress | undefined>();
  const [saving, setSaving] = useState<SaveProgress | undefined>();
  const [error, setError] = useState<string | undefined>();

  /** A new source starts a new edit list. The old one meant something else. */
  const take = useCallback((next: WorkbenchSource) => {
    setSource(next);
    setEdits([]);
    setError(undefined);
  }, []);

  const loadFile = useCallback(
    async (file: File) => {
      // A file from disk is already here. Nothing is read over the network.
      setLoading({ stage: 'decoding', fraction: 1 });
      setError(undefined);
      try {
        const decoded = await decodeFile(file);
        take({ name: file.name, ...decoded });
      } catch (cause) {
        setError(`${file.name} could not be decoded: ${messageFrom(cause)}`);
      } finally {
        setLoading(undefined);
      }
    },
    [take],
  );

  const loadTake = useCallback(
    async (asset: Asset) => {
      setLoading({ stage: 'reading', fraction: 0 });
      setError(undefined);
      try {
        // Read in ranged pieces, never as one request. A whole file fetch is
        // refused outright in a browser profile with extensions in it, which
        // DOCS/ERRORS.md records happening twice.
        const bytes = await fetchInRanges(audioUrl(asset.projectId, asset.id), (progress) =>
          setLoading({ stage: 'reading', fraction: progress.fraction }),
        );

        setLoading({ stage: 'decoding', fraction: 1 });
        const decoded = await decodeFile(new File([bytes], asset.filename));
        take({ name: asset.filename, ...decoded, fromAssetId: asset.id });
      } catch (cause) {
        setError(`${asset.label} could not be loaded: ${messageFrom(cause)}`);
      } finally {
        setLoading(undefined);
      }
    },
    [take],
  );

  const reset = useCallback(() => {
    setSource(undefined);
    setEdits([]);
    setError(undefined);
  }, []);

  const pushEdit = useCallback((edit: Edit) => {
    setEdits((current) => [...current, edit]);
  }, []);

  const undo = useCallback(() => setEdits((current) => current.slice(0, -1)), []);
  const clearEdits = useCallback(() => setEdits([]), []);

  // The expensive one, so it is held against the list rather than recomputed on
  // every keystroke in a form somewhere else on the page.
  const rendered = useMemo(
    () => (source ? applyEdits(source.channels, source.sampleRate, edits) : []),
    [source, edits],
  );

  const renderedDuration = source ? durationOf(rendered, source.sampleRate) : 0;
  const renderedPeak = useMemo(() => peakOf(rendered), [rendered]);

  // The size is worth knowing before the work, because the import limit is
  // 200 MB and finding that out after encoding is the worst order to find it in.
  // Resampling changes the frame count, so this counts frames at the rate being
  // written rather than at the rate being edited.
  const outputFrames = source
    ? resampledLength(rendered[0]?.length ?? 0, source.sampleRate, outputRate)
    : 0;
  const outputBytes = wavByteLength(outputFrames, rendered.length);

  /**
   * The audio as it will be written: every edit applied, at the output rate.
   *
   * Resampling happens here rather than on the chain, and after the edits
   * rather than before them, so the sinc filter runs once over the finished
   * result instead of once per undo.
   */
  const renderForOutput = useCallback(
    (from: WorkbenchSource): Float32Array[] => {
      const edited = applyEdits(from.channels, from.sampleRate, edits);
      return resampleChannels(edited, from.sampleRate, outputRate);
    },
    [edits, outputRate],
  );

  const save = useCallback(
    async (suffix: string): Promise<Asset | undefined> => {
      if (!projectId || !source) return undefined;

      setSaving({ fraction: 0, stage: 'encoding' });
      setError(undefined);
      try {
        const asset = await saveToProject({
          projectId,
          channels: renderForOutput(source),
          sampleRate: outputRate,
          filename: savedFilename(source.name, suffix),
          onProgress: setSaving,
        });

        onSaved();
        return asset;
      } catch (cause) {
        setError(messageFrom(cause));
        return undefined;
      } finally {
        setSaving(undefined);
      }
    },
    [projectId, source, outputRate, onSaved, renderForOutput],
  );

  const splitAt = useCallback(
    async (seconds: number): Promise<boolean> => {
      if (!projectId || !source) return false;

      setSaving({ fraction: 0, stage: 'encoding' });
      setError(undefined);
      try {
        // Resample once over the whole thing and cut afterwards. Cutting first
        // would put each half through its own filter, and a filter has edges,
        // so the two pieces would not join back together cleanly.
        const [before, after] = cutAt(renderForOutput(source), outputRate, seconds);

        const halves = [
          { channels: before, suffix: 'part 1' },
          { channels: after, suffix: 'part 2' },
        ];

        for (const half of halves) {
          await saveToProject({
            projectId,
            channels: half.channels,
            sampleRate: outputRate,
            filename: savedFilename(source.name, half.suffix),
            onProgress: setSaving,
          });
        }

        onSaved();
        return true;
      } catch (cause) {
        setError(messageFrom(cause));
        return false;
      } finally {
        setSaving(undefined);
      }
    },
    [projectId, source, outputRate, onSaved, renderForOutput],
  );

  return {
    source,
    loading,
    error,
    clearError: () => setError(undefined),
    loadFile,
    loadTake,
    reset,
    edits,
    pushEdit,
    undo,
    clearEdits,
    rendered,
    renderedDuration,
    renderedPeak,
    outputRate,
    setOutputRate,
    outputBytes,
    overLimit: outputBytes > MAX_ASSET_BYTES,
    saving,
    save,
    splitAt,
  };
}
