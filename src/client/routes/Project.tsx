import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Asset } from '../../shared/types.ts';
import { AssetRow } from '../components/AssetRow.tsx';
import { ConfirmDialog } from '../components/Dialog.tsx';
import { ImportDropZone } from '../components/ImportDropZone.tsx';
import { WaveformPlayer } from '../components/WaveformPlayer.tsx';
import { Panel } from '../components/ui.tsx';
import { useProject } from '../lib/useProject.ts';

export function ProjectRoute() {
  const { id = '' } = useParams();
  const {
    project,
    assets,
    error,
    loading,
    importing,
    importFile,
    renameAsset,
    removeAsset,
    computePeaksFor,
  } = useProject(id);

  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [pendingRemoval, setPendingRemoval] = useState<Asset | undefined>();

  if (loading) {
    return <p className="text-sm text-ink-muted">Loading this project.</p>;
  }

  if (!project) {
    return (
      <Panel title="Project not found">
        <p className="text-sm text-ink-muted">
          Nothing here with that address.{' '}
          <Link to="/" className="text-accent underline underline-offset-4 hover:no-underline">
            Back to the library
          </Link>
          .
        </p>
      </Panel>
    );
  }

  const selected = assets.find((asset) => asset.id === selectedId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          to="/"
          className="text-sm text-ink-muted underline underline-offset-4 hover:no-underline"
        >
          Library
        </Link>
        <h1 className="mt-1 text-2xl">{project.name}</h1>
        <p className="mt-1 text-ink-muted">
          {project.assetCount === 1 ? '1 track' : `${project.assetCount} tracks`}
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink"
        >
          {error}
        </p>
      ) : null}

      <ImportDropZone onFile={(file) => void importFile(file)} importing={importing} />

      {selected ? (
        <WaveformPlayer asset={selected} onComputePeaks={() => void computePeaksFor(selected.id)} />
      ) : null}

      <Panel title="Tracks">
        {assets.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing imported yet. Add a file above.</p>
        ) : (
          <ul className="flex flex-col">
            {assets.map((asset) => (
              <AssetRow
                key={asset.id}
                asset={asset}
                selected={asset.id === selectedId}
                onSelect={() => setSelectedId(asset.id)}
                onRename={(label) => void renameAsset(asset.id, label)}
                onRemove={() => setPendingRemoval(asset)}
              />
            ))}
          </ul>
        )}
      </Panel>

      <ConfirmDialog
        open={pendingRemoval !== undefined}
        title={`Delete ${pendingRemoval?.label ?? 'this track'}?`}
        body="The file is removed from disk. This cannot be undone."
        confirmLabel="Delete track"
        destructive
        onConfirm={() => {
          if (pendingRemoval) {
            if (pendingRemoval.id === selectedId) setSelectedId(undefined);
            void removeAsset(pendingRemoval.id);
          }
          setPendingRemoval(undefined);
        }}
        onCancel={() => setPendingRemoval(undefined)}
      />
    </div>
  );
}
