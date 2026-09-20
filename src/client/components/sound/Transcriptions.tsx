import { useMemo, useState } from 'react';
import type { Asset, Catalog, MidiArtifact, StudioTask } from '../../../shared/types.ts';
import { installedPackages } from '../../lib/models.ts';
import { formatSeconds } from '../../lib/region.ts';
import { Button, Panel } from '../ui.tsx';
import { MidiRow } from './MidiRow.tsx';

/**
 * Reading the notes out of a take.
 *
 * The take is picked here rather than being in the address, unlike remix. This
 * page is a list of everything transcribed in the project and the picker is one
 * control on it, so putting a take in the URL would say the page is about that
 * take when it is not.
 *
 * Only WAV takes are offered. The source has a second of silence put in front
 * of it before the model sees it, which means decoding it, and Miso has no
 * decoder on the service side for anything else. The worker refuses the rest
 * with the same explanation, so this keeps the refusal off screen instead of
 * letting somebody queue a job that cannot run.
 */
export function Transcriptions({
  task,
  catalog,
  assets,
  artifacts,
  loading,
  error,
  busy,
  onSubmit,
  onDelete,
}: {
  task: StudioTask | undefined;
  catalog: Catalog | undefined;
  assets: Asset[];
  artifacts: MidiArtifact[];
  loading: boolean;
  error: string | undefined;
  busy: boolean;
  onSubmit: (modelId: string, assetId: string) => void;
  onDelete: (id: string) => void;
}) {
  const [assetId, setAssetId] = useState<string | undefined>();

  const sources = useMemo(() => assets.filter((asset) => asset.format === 'wav'), [assets]);
  const packages = useMemo(() => (task ? installedPackages(catalog, task) : []), [catalog, task]);
  const byId = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  const chosen = sources.find((asset) => asset.id === assetId) ?? sources[0];
  const model = packages[0];

  return (
    <Panel
      title="Transcriptions"
      description="Reads the notes out of a take and writes a MIDI file you can open anywhere."
    >
      <div className="flex flex-col gap-5">
        {!task || packages.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No transcription model is installed. Install MuScriptor on the Models page and it
            will appear here.
          </p>
        ) : sources.length === 0 ? (
          <p className="text-sm text-ink-muted">
            This project has no WAV takes to read. Generate or import one first, or convert a
            take in the workbench.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-faint">Take</span>
              <select
                value={chosen?.id ?? ''}
                onChange={(event) => setAssetId(event.target.value)}
                className="min-h-9 w-full min-w-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink transition-colors duration-150 hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {sources.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.label}
                    {asset.durationSeconds === undefined ? '' : ` (${formatSeconds(asset.durationSeconds)})`}
                  </option>
                ))}
              </select>
            </label>

            <Button
              variant="primary"
              busy={busy}
              disabled={!chosen || !model}
              onClick={() => {
                if (chosen && model) onSubmit(model.id, chosen.id);
              }}
            >
              Transcribe
            </Button>
          </div>
        )}

        {error ? (
          <p role="alert" className="rounded-md border border-bad/40 px-4 py-3 text-sm text-bad">
            {error}
          </p>
        ) : null}

        {loading && artifacts.length === 0 ? (
          <p className="text-sm text-ink-muted">Loading this project's transcriptions.</p>
        ) : artifacts.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nothing transcribed yet. Pick a take above and Miso will read its notes.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {artifacts.map((artifact) => (
              <MidiRow
                key={artifact.id}
                artifact={artifact}
                source={byId.get(artifact.sourceAssetId)}
                onDelete={() => onDelete(artifact.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
