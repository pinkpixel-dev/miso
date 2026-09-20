import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Asset } from '../../../shared/types.ts';
import { usePlayer } from '../../lib/usePlayer.ts';
import { ExportMenu } from '../ExportMenu.tsx';
import { IconButton, Pill, cx } from '../ui.tsx';

/**
 * One take in the workspace column.
 *
 * Play and export are permanent controls because they are what this row is
 * for. Rename and delete sit behind an overflow menu: they are rare, one of
 * them cannot be undone, and a 360px column has no room for four buttons per
 * row without every label being an unlabelled icon.
 *
 * There is no artwork here. Miso has no image model, and an empty frame reads
 * as a picture that failed to load rather than a feature that does not exist.
 */

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

export function TakeRow({
  asset,
  detailsOpen,
  onOpenDetails,
  onRename,
  onRemove,
}: {
  asset: Asset;
  detailsOpen: boolean;
  onOpenDetails: (trigger: HTMLButtonElement) => void;
  onRename: (label: string) => void;
  onRemove: () => void;
}) {
  const { nowPlaying, playing, play } = usePlayer();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(asset.label);

  const current = nowPlaying?.id === asset.id;
  const running = current && playing;

  function commit(event: FormEvent) {
    event.preventDefault();
    if (draft.trim() !== '' && draft.trim() !== asset.label) onRename(draft.trim());
    setEditing(false);
  }

  return (
    <li
      className={cx(
        'flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors duration-150',
        current
          ? 'border-accent/50 bg-raised'
          : 'border-line bg-surface hover:border-line-strong hover:bg-raised/60',
      )}
    >
      <IconButton
        label={running ? `Pause ${asset.label}` : `Play ${asset.label}`}
        icon={running ? Pause : Play}
        variant={current ? 'primary' : 'secondary'}
        onClick={() => play(asset)}
      />

      <div className="min-w-0 flex-1">
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
              className="w-full rounded-sm border border-line-strong bg-canvas px-2 py-1 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            />
          </form>
        ) : (
          <button
            type="button"
            aria-label={`View details for ${asset.label}`}
            aria-controls="take-detail-panel"
            aria-expanded={detailsOpen}
            onClick={(event) => onOpenDetails(event.currentTarget)}
            className="block w-full min-w-0 rounded-sm px-1 py-0.5 text-left hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <p className="truncate text-sm text-ink">{asset.label}</p>
            <p className="truncate text-xs text-ink-faint">
              {formatDuration(asset.durationSeconds)} · {asset.format} · {formatBytes(asset.bytes)}
            </p>
          </button>
        )}
      </div>

      {asset.peaks ? null : <Pill tone="neutral">no waveform</Pill>}

      <ExportMenu
        projectId={asset.projectId}
        assetId={asset.id}
        filename={asset.filename}
        label={asset.label}
        format={asset.format}
        hasScore={asset.hasScore}
      />

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={`More actions for ${asset.label}`}
            className={cx(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
              'text-ink-muted transition-colors duration-150 hover:bg-raised hover:text-ink',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              'data-[state=open]:bg-raised data-[state=open]:text-ink',
            )}
          >
            <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-40 rounded-md border border-line bg-surface p-1 shadow-xl"
          >
            <DropdownMenu.Item
              onSelect={() => {
                setDraft(asset.label);
                setEditing(true);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-ink-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-ink"
            >
              <Pencil aria-hidden="true" className="h-4 w-4" />
              Rename
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={onRemove}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-bad outline-none data-[highlighted]:bg-bad/10"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </li>
  );
}
