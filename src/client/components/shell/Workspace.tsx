import { useEffect, useState } from 'react';
import type { Asset } from '../../../shared/types.ts';
import { usePlayer } from '../../lib/usePlayer.ts';
import { useStudio } from '../../lib/useStudio.ts';
import { ConfirmDialog } from '../Dialog.tsx';
import { Disclosure } from '../Disclosure.tsx';
import { ImportDropZone } from '../ImportDropZone.tsx';
import { JobList } from '../JobList.tsx';
import { TakeRow } from './TakeRow.tsx';

/**
 * The takes in the active project, and the queue that adds to them.
 *
 * This lives in the shell rather than the project route so it survives a move
 * to the models or settings screen. What you are working on should not vanish
 * because you went to install a model.
 *
 * There is no search, filter or sort bar. The reference layout has one, and a
 * project with four takes has nothing to filter. It is worth adding when a real
 * project gets big enough to be annoying and not before.
 */

/**
 * How many takes stay on screen before the rest fold away.
 *
 * The column is capped rather than scrolled, matching the queue directly below
 * it. Two independent scroll regions stacked in one 360px column is a way to
 * lose things: you scroll one, the other stays put, and neither shows you where
 * its end is. Folding keeps the whole column one length.
 */
const RECENT_TAKES = 8;

function countLabel(count: number): string {
  return count === 1 ? '1 take' : `${count} takes`;
}

export function Workspace() {
  const {
    project,
    projectId,
    assets,
    jobs,
    loading,
    importing,
    importFile,
    renameAsset,
    removeAsset,
    cancelJob,
    dismissJobs,
    dismissedCount,
  } = useStudio();
  const { clear, setQueue } = usePlayer();
  const [pendingRemoval, setPendingRemoval] = useState<Asset | undefined>();

  // The dock's skip buttons move through this list. It is handed over from here
  // because the player sits above the studio data on purpose, so it cannot read
  // the open project itself. Order matches what is on screen, so Next means the
  // row below rather than some private ordering of its own.
  useEffect(() => {
    setQueue(assets);
  }, [assets, setQueue]);

  return (
    <aside
      aria-label="Takes and queue"
      className="order-2 flex min-w-0 shrink-0 flex-col gap-5 border-line bg-canvas px-4 py-5 lg:order-none lg:overflow-y-auto lg:border-l"
    >
      <div className="min-w-0 border-b border-line pb-3">
        <h2 className="truncate text-sm font-medium text-ink">
          {project ? project.name : 'No project open'}
        </h2>
        <p className="mt-0.5 text-xs text-ink-faint">
          {projectId === undefined
            ? 'Choose one on the left, or make a new one.'
            : loading
              ? 'Loading.'
              : countLabel(assets.length)}
        </p>
      </div>

      {projectId === undefined ? null : (
        <>
          <div className="flex flex-col gap-3">
            {assets.length === 0 && !loading ? (
              <p className="text-sm text-ink-muted">
                Nothing here yet. Generate something, or drop a file in below.
              </p>
            ) : (
              <>
                <ul className="flex flex-col gap-2">
                  {assets.slice(0, RECENT_TAKES).map((asset) => (
                    <TakeRow
                      key={asset.id}
                      asset={asset}
                      onRename={(label) => renameAsset(asset.id, label)}
                      onRemove={() => setPendingRemoval(asset)}
                    />
                  ))}
                </ul>

                {assets.length > RECENT_TAKES ? (
                  <Disclosure
                    summary={`${assets.length - RECENT_TAKES} earlier ${
                      assets.length - RECENT_TAKES === 1 ? 'take' : 'takes'
                    }`}
                  >
                    <ul className="flex flex-col gap-2">
                      {assets.slice(RECENT_TAKES).map((asset) => (
                        <TakeRow
                          key={asset.id}
                          asset={asset}
                          onRename={(label) => renameAsset(asset.id, label)}
                          onRemove={() => setPendingRemoval(asset)}
                        />
                      ))}
                    </ul>
                  </Disclosure>
                ) : null}
              </>
            )}

            <ImportDropZone onFile={importFile} importing={importing} />
          </div>

          <JobList
            jobs={jobs}
            hiddenCount={dismissedCount}
            onCancel={cancelJob}
            onClear={dismissJobs}
          />
        </>
      )}

      <ConfirmDialog
        open={pendingRemoval !== undefined}
        title={`Delete ${pendingRemoval?.label ?? 'this take'}?`}
        body="The file is removed from disk. This cannot be undone."
        confirmLabel="Delete take"
        destructive
        onConfirm={() => {
          if (pendingRemoval) {
            // The dock is holding an asset, not an id, so a deleted take would
            // otherwise sit in the transport pointing at a file that is gone.
            clear(pendingRemoval.id);
            removeAsset(pendingRemoval.id);
          }
          setPendingRemoval(undefined);
        }}
        onCancel={() => setPendingRemoval(undefined)}
      />
    </aside>
  );
}
