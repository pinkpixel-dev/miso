import { useCallback, useMemo, useState } from 'react';
import { MAX_ASSET_BYTES } from '../../shared/limits.ts';
import { resampleChannels, resampledLength } from '../../shared/resample.ts';
import type { Asset } from '../../shared/types.ts';
import { wavByteLength } from '../../shared/wav.ts';
import { audioUrl } from './api.ts';
import { decodeFile, savedFilename } from './decodeFile.ts';
import { applyEdits, durationOf, peakOf, type Edit } from './edits.ts';
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

export interface WorkbenchState {
  source: WorkbenchSource | undefined;
  loading: boolean;
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
  const [loading, setLoading] = useState(false);
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
      setLoading(true);
      setError(undefined);
      try {
        const decoded = await decodeFile(file);
        take({ name: file.name, ...decoded });
      } catch (cause) {
        setError(`${file.name} could not be decoded: ${messageFrom(cause)}`);
      } finally {
        setLoading(false);
      }
    },
    [take],
  );

  const loadTake = useCallback(
    async (asset: Asset) => {
      setLoading(true);
      setError(undefined);
      try {
        const response = await fetch(audioUrl(asset.projectId, asset.id));
        if (!response.ok) throw new Error(`The service answered HTTP ${response.status}`);

        const blob = await response.blob();
        const decoded = await decodeFile(new File([blob], asset.filename));
        take({ name: asset.filename, ...decoded, fromAssetId: asset.id });
      } catch (cause) {
        setError(`${asset.label} could not be loaded: ${messageFrom(cause)}`);
      } finally {
        setLoading(false);
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

  const save = useCallback(
    async (suffix: string): Promise<Asset | undefined> => {
      if (!projectId || !source) return undefined;

      setSaving({ fraction: 0, stage: 'encoding' });
      setError(undefined);
      try {
        const channels = applyEdits(source.channels, source.sampleRate, edits);
        const atRate = resampleChannels(channels, source.sampleRate, outputRate);

        const asset = await saveToProject({
          projectId,
          channels: atRate,
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
    [projectId, source, edits, outputRate, onSaved],
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
  };
}
