import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { LibraryTake } from '../../../shared/types.ts';
import { projectPath } from '../../lib/routes.ts';
import { usePlayer } from '../../lib/usePlayer.ts';
import { ExportMenu } from '../ExportMenu.tsx';
import { IconButton, cx } from '../ui.tsx';

/**
 * One take in the library.
 *
 * Close to `TakeRow` and deliberately not it. A library row has a project to
 * name and link to, and it has no detail panel to open, because the panel reads
 * the producing job out of the open project's queue and the library is not in
 * one. Play, export, rename and delete behave the same in both places.
 *
 * Playing goes through the page rather than straight to the player. A library
 * take carries no peaks, and the dock needs them or it fetches the whole file
 * to draw a waveform, so the page fetches the take whole first.
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

export function LibraryRow({
  take,
  toolLabel,
  onPlay,
  onRename,
  onRemove,
}: {
  take: LibraryTake;
  /** What made this take, or undefined for an import and for a task that is gone. */
  toolLabel: string | undefined;
  onPlay: (take: LibraryTake) => void;
  onRename: (label: string) => void;
  onRemove: () => void;
}) {
  const { nowPlaying, playing, toggle } = usePlayer();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(take.label);

  const current = nowPlaying?.id === take.assetId;
  const running = current && playing;

  function commit(event: FormEvent) {
    event.preventDefault();
    const next = draft.trim();
    if (next !== '' && next !== take.label) onRename(next);
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
        label={running ? `Pause ${take.label}` : `Play ${take.label}`}
        icon={running ? Pause : Play}
        variant={current ? 'primary' : 'secondary'}
        // The same take again is a pause, which the player already does with an
        // asset it holds. Anything else has to be fetched before it can play.
        onClick={() => (current ? toggle() : onPlay(take))}
      />

      <div className="min-w-0 flex-1">
        {editing ? (
          <form onSubmit={commit} className="flex gap-2">
            <label className="sr-only" htmlFor={`library-rename-${take.assetId}`}>
              Rename {take.label}
            </label>
            <input
              id={`library-rename-${take.assetId}`}
              autoFocus
              value={draft}
              maxLength={200}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setEditing(false);
                }
              }}
              className="w-full rounded-sm border border-line-strong bg-canvas px-2 py-1 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            />
          </form>
        ) : (
          <div className="min-w-0 px-1 py-0.5">
            <p className="truncate text-sm text-ink">{take.label}</p>
            <p className="truncate text-xs text-ink-faint">
              {formatDuration(take.durationSeconds)} · {take.format} · {formatBytes(take.bytes)}
              {toolLabel === undefined ? null : ` · ${toolLabel}`}
            </p>
          </div>
        )}
      </div>

      <Link
        to={projectPath(take.projectId)}
        aria-label={`Open ${take.projectName}`}
        className={cx(
          'hidden shrink-0 rounded-md border border-line px-2 py-1 text-xs text-ink-muted sm:block',
          'max-w-40 truncate transition-colors duration-150 hover:border-line-strong hover:text-ink',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        )}
      >
        {take.projectName}
      </Link>

      <ExportMenu
        projectId={take.projectId}
        assetId={take.assetId}
        label={take.label}
        format={take.format}
      />

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={`More actions for ${take.label}`}
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
                setDraft(take.label);
                setEditing(true);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-ink-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-ink"
            >
              <Pencil aria-hidden="true" className="h-4 w-4" />
              Rename
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <Link
                to={projectPath(take.projectId)}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-ink-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-ink"
              >
                Open {take.projectName}
              </Link>
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
