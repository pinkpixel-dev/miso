import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Asset, LibraryTake } from '../../shared/types.ts';
import { LibraryRow } from '../components/library/LibraryRow.tsx';
import { ConfirmDialog } from '../components/Dialog.tsx';
import { IconButton, Panel, cx } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { searchTakes, taskLabels } from '../lib/librarySearch.ts';
import { useLibrary } from '../lib/useLibrary.ts';
import { usePlayer } from '../lib/usePlayer.ts';

/**
 * Every take in Miso, at /library.
 *
 * App level, so it takes the full width and has no project context of its own.
 * A project's takes column beside a list of every project's takes would be the
 * same thing at two scopes.
 *
 * The list is flat and newest first, with the project named on each row. Not
 * grouped by project, because the projects list is already that, and this page
 * is for the times you remember a prompt and not where you put it.
 */

function countLabel(count: number): string {
  return count === 1 ? '1 take' : `${count} takes`;
}

export function LibraryRoute() {
  const { takes, tasks, loading, error, rename, remove } = useLibrary();
  const { play, clear } = usePlayer();

  const [query, setQuery] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<LibraryTake | undefined>();
  const [playError, setPlayError] = useState<string | undefined>();
  const heading = useRef<HTMLHeadingElement>(null);
  const search = useRef<HTMLInputElement>(null);

  // Arriving here follows a link, and a client side route change leaves focus
  // on whatever was clicked. The heading is where a keyboard or a screen reader
  // should land.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  const labels = useMemo(() => taskLabels(tasks), [tasks]);
  const results = useMemo(() => searchTakes(takes, query, labels), [takes, query, labels]);

  const projectCount = useMemo(
    () => new Set(results.map((take) => take.projectId)).size,
    [results],
  );

  /**
   * Hands a take to the dock with its waveform.
   *
   * The library list carries no peaks, and the player draws from them or else
   * downloads the whole file to work them out, which for a three minute WAV is
   * 34 MB. So the take is fetched whole first. If that fails the take still
   * plays, because a missing waveform is not a reason to refuse.
   */
  async function playTake(take: LibraryTake) {
    try {
      play(await api.getAsset(take.projectId, take.assetId));
      setPlayError(undefined);
    } catch (cause) {
      setPlayError(cause instanceof Error ? cause.message : String(cause));
      play({
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
      } satisfies Asset);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="min-w-0">
        {/*
          tabIndex -1 so it can be focused on arrival without joining the tab
          order. Programmatic focus raises no focus ring.
        */}
        <h1
          ref={heading}
          tabIndex={-1}
          className="font-display text-lg font-semibold text-ink outline-none"
        >
          Library
        </h1>
        <p className="mt-0.5 text-sm text-ink-faint">
          Every take in Miso, whatever project it is in.
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

      {playError ? (
        <p
          role="alert"
          className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink"
        >
          The waveform for that take could not be loaded, so it is playing without one.{' '}
          {playError}
        </p>
      ) : null}

      <div className="flex max-w-3xl flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="library-search" className="text-sm font-medium text-ink">
            Search
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint"
            />
            <input
              id="library-search"
              ref={search}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, project, title, prompt, lyrics, or tool"
              aria-describedby="library-count"
              className={cx(
                'w-full rounded-md border border-line bg-canvas py-2 pr-10 pl-9 text-sm text-ink',
                'placeholder:text-ink-faint',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
              )}
            />
            {query === '' ? null : (
              <div className="absolute top-1/2 right-1 -translate-y-1/2">
                <IconButton
                  label="Clear the search"
                  icon={X}
                  onClick={() => {
                    setQuery('');
                    search.current?.focus();
                  }}
                />
              </div>
            )}
          </div>
          <p id="library-count" aria-live="polite" className="text-xs text-ink-faint">
            {loading
              ? 'Loading.'
              : query === ''
                ? `${countLabel(results.length)} across ${projectCount === 1 ? '1 project' : `${projectCount} projects`}`
                : `${countLabel(results.length)} matching.`}
          </p>
        </div>

        {loading && takes.length === 0 ? null : takes.length === 0 ? (
          <Panel title="Nothing here yet">
            <p className="text-sm text-ink-muted">
              Takes appear here as soon as you generate or import one.{' '}
              <Link to="/" className="text-accent underline underline-offset-4 hover:no-underline">
                Open a project
              </Link>
              .
            </p>
          </Panel>
        ) : results.length === 0 ? (
          <Panel title="No takes match that">
            <p className="text-sm text-ink-muted">
              Nothing here has all of those words in its name, project, title, prompt, lyrics, or
              tool.{' '}
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  search.current?.focus();
                }}
                className="text-accent underline underline-offset-4 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Clear the search
              </button>
              .
            </p>
          </Panel>
        ) : (
          <ul className="flex flex-col gap-2">
            {results.map((take) => (
              <LibraryRow
                key={take.assetId}
                take={take}
                toolLabel={take.taskId === undefined ? undefined : labels.get(take.taskId)}
                onPlay={(entry) => void playTake(entry)}
                onRename={(label) => void rename(take, label)}
                onRemove={() => setPendingRemoval(take)}
              />
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={pendingRemoval !== undefined}
        title={`Delete ${pendingRemoval?.label ?? 'this take'}?`}
        body={
          pendingRemoval === undefined
            ? 'The file is removed from disk. This cannot be undone.'
            : `The file is removed from disk, and the take leaves ${pendingRemoval.projectName}. This cannot be undone.`
        }
        confirmLabel="Delete take"
        destructive
        onConfirm={() => {
          if (pendingRemoval) {
            // The dock holds an asset rather than an id, so a deleted take
            // would otherwise sit in the transport pointing at a missing file.
            clear(pendingRemoval.assetId);
            void remove(pendingRemoval);
          }
          setPendingRemoval(undefined);
        }}
        onCancel={() => setPendingRemoval(undefined)}
      />
    </div>
  );
}
