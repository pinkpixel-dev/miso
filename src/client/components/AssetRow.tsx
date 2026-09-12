import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Asset } from '../../shared/types.ts';
import { downloadUrl } from '../lib/api.ts';
import { Button, Pill } from './ui.tsx';

function formatBytes(bytes: number): string {
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}

/** Seconds as m:ss. An unknown duration says so rather than showing 0:00. */
function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined) return 'length unknown';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function AssetRow({
  asset,
  selected,
  onSelect,
  onRename,
  onRemove,
}: {
  asset: Asset;
  selected: boolean;
  onSelect: () => void;
  onRename: (label: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(asset.label);

  function commit(event: FormEvent) {
    event.preventDefault();
    if (draft.trim() !== '' && draft.trim() !== asset.label) onRename(draft.trim());
    setEditing(false);
  }

  return (
    <li
      className={[
        'flex flex-col gap-2 border-t border-line py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between',
        selected ? 'bg-raised/40' : '',
      ].join(' ')}
    >
      <div className="min-w-0">
        {editing ? (
          <form onSubmit={commit} className="flex gap-2">
            <label className="sr-only" htmlFor={`rename-${asset.id}`}>
              Rename {asset.label}
            </label>
            <input
              id={`rename-${asset.id}`}
              autoFocus
              value={draft}
              maxLength={200}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              className="rounded-sm border border-line-strong bg-canvas px-2 py-1 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            />
            <Button type="submit" variant="secondary">
              Save
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSelect}
              aria-pressed={selected}
              className="rounded-sm text-left text-sm text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {asset.label}
            </button>
            <span className="font-mono text-xs text-ink-faint">{asset.format}</span>
            {asset.peaks ? null : <Pill tone="neutral">no waveform yet</Pill>}
          </div>
        )}

        <p className="mt-1 text-sm text-ink-muted">
          {formatDuration(asset.durationSeconds)}, {formatBytes(asset.bytes)}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        <Button variant="secondary" onClick={onSelect} disabled={selected}>
          {selected ? 'Playing' : 'Play'}
        </Button>
        <Button variant="ghost" onClick={() => setEditing(true)}>
          Rename
        </Button>
        <a
          href={downloadUrl(asset.projectId, asset.id)}
          download={asset.filename}
          className="inline-flex items-center rounded-md border border-line px-3 py-1.5 text-sm text-ink hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Export
        </a>
        <Button variant="ghost" onClick={onRemove}>
          Delete
        </Button>
      </div>
    </li>
  );
}
