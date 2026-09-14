import { Pencil } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Asset } from '../../../shared/types.ts';
import { projectPath, remixPath } from '../../lib/routes.ts';
import { findProducingJob } from '../../lib/takeDetails.ts';
import { generatedTakes } from '../../lib/takeGroups.ts';
import { usePlayer } from '../../lib/usePlayer.ts';
import { useStudio } from '../../lib/useStudio.ts';
import { ConfirmDialog } from '../Dialog.tsx';
import { ImportDropZone } from '../ImportDropZone.tsx';
import { JobList } from '../JobList.tsx';
import { IconButton } from '../ui.tsx';
import { TakeDetailPanel } from './TakeDetailPanel.tsx';
import { TakeRow } from './TakeRow.tsx';

/**
 * What the create form has generated, and the queue that adds to it.
 *
 * This lives in the shell rather than the create route so it survives a move
 * to the models or settings screen. What you are working on should not vanish
 * because you went to install a model.
 *
 * It holds generated takes only. Imports and anything made out of another take
 * are on the project page, so the list beside the form is what the form put
 * there rather than everything in the project. The rule itself is in
 * `takeGroups.ts`, shared with that page so the two cannot disagree.
 *
 * There is no search, filter or sort bar. The reference layout has one, and a
 * project with four takes has nothing to filter. It is worth adding when a real
 * project gets big enough to be annoying and not before.
 */

function countLabel(count: number): string {
  return count === 1 ? '1 take' : `${count} takes`;
}

export function Workspace() {
  const {
    project,
    projectId,
    assets,
    allJobs,
    jobs,
    tasks,
    loading,
    importing,
    importFile,
    renameProject,
    renameAsset,
    removeAsset,
    cancelJob,
    dismissJobs,
    dismissedCount,
  } = useStudio();
  const { clear } = usePlayer();
  const [pendingRemoval, setPendingRemoval] = useState<Asset | undefined>();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>();
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const detailCloseRef = useRef<HTMLButtonElement>(null);

  const closeDetails = useCallback(() => {
    setSelectedAssetId(undefined);
    const trigger = detailTriggerRef.current;
    detailTriggerRef.current = null;
    trigger?.focus();
  }, []);

  const shown = useMemo(() => generatedTakes(assets, allJobs, tasks), [assets, allJobs, tasks]);
  const heldBack = assets.length - shown.length;

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId);
  const selectedJob = selectedAsset
    ? findProducingJob(allJobs, selectedAsset.id)
    : undefined;

  function beginRename() {
    if (!project) return;
    setNameDraft(project.name);
    setEditingName(true);
  }

  function commitRename() {
    if (!project) return;
    const next = nameDraft.trim();
    if (next !== '' && next !== project.name) renameProject(next);
    setEditingName(false);
  }

  // This shell survives route changes. Close an unfinished rename when a
  // different project opens so its draft can never carry into the next one.
  useEffect(() => {
    setEditingName(false);
    setSelectedAssetId(undefined);
    detailTriggerRef.current = null;
  }, [projectId]);

  useEffect(() => {
    if (selectedAssetId !== undefined && selectedAsset === undefined) closeDetails();
  }, [closeDetails, selectedAsset, selectedAssetId]);

  return (
    <aside
      aria-label="Takes and queue"
      className="relative order-2 flex min-h-0 min-w-0 shrink-0 flex-col gap-5 border-line bg-canvas px-4 py-5 lg:order-none lg:h-full lg:overflow-hidden lg:border-l"
    >
      <div className="min-w-0 border-b border-line pb-3">
        <div className="flex min-w-0 items-center gap-1">
          {editingName && project ? (
            <form
              className="min-w-0 flex-1"
              onSubmit={(event) => {
                event.preventDefault();
                commitRename();
              }}
            >
              <label htmlFor={`rename-project-${project.id}`} className="sr-only">
                Rename {project.name}
              </label>
              <input
                id={`rename-project-${project.id}`}
                autoFocus
                value={nameDraft}
                maxLength={200}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setEditingName(false);
                  }
                }}
                className="w-full rounded-sm border border-line-strong bg-canvas px-2 py-1 text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              />
            </form>
          ) : (
            <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {project ? project.name : 'No project open'}
            </h2>
          )}
          {project && !editingName ? (
            <IconButton label={`Rename ${project.name}`} icon={Pencil} onClick={beginRename} />
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-faint">
            {projectId === undefined
              ? 'Choose one on the left, or make a new one.'
              : loading
                ? 'Loading.'
                : countLabel(shown.length)}
          </p>

          {/*
            The discoverable way into the editor, for somebody who has not
            opened a take yet. The fast way is the action inside a take's
            detail panel, which arrives with that take already chosen.
          */}
          {projectId !== undefined && assets.length > 0 ? (
            <Link
              to={remixPath(projectId)}
              className="shrink-0 rounded-sm text-xs text-accent underline underline-offset-4 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Remix a take
            </Link>
          ) : null}
        </div>
      </div>

      {projectId === undefined ? null : (
        <>
          <ImportDropZone onFile={importFile} importing={importing} />

          <div className="flex min-h-0 flex-1 flex-col gap-5 lg:grid lg:grid-rows-[minmax(0,11fr)_minmax(0,9fr)]">
            <div className="min-h-0 lg:overflow-y-auto lg:pr-1">
              {shown.length === 0 && !loading ? (
                <p className="text-sm text-ink-muted">
                  {assets.length === 0 ? (
                    'Nothing here yet. Generate something, or choose an audio file above.'
                  ) : (
                    <>
                      Nothing generated here yet.{' '}
                      <Link
                        to={projectPath(projectId)}
                        className="text-accent underline underline-offset-4 hover:no-underline"
                      >
                        {countLabel(assets.length)} on the project page
                      </Link>
                      .
                    </>
                  )}
                </p>
              ) : (
                <>
                  <ul className="flex flex-col gap-2">
                    {shown.map((asset) => (
                      <TakeRow
                        key={asset.id}
                        asset={asset}
                        detailsOpen={selectedAssetId === asset.id}
                        onOpenDetails={(trigger) => {
                          detailTriggerRef.current = trigger;
                          setSelectedAssetId(asset.id);
                        }}
                        onRename={(label) => renameAsset(asset.id, label)}
                        onRemove={() => setPendingRemoval(asset)}
                      />
                    ))}
                  </ul>

                  {/*
                    A shorter list than the project holds is said out loud. A
                    list that silently drops rows reads as takes going missing.
                  */}
                  {heldBack > 0 ? (
                    <p className="mt-3 text-xs text-ink-faint">
                      <Link
                        to={projectPath(projectId)}
                        className="text-accent underline underline-offset-4 hover:no-underline"
                      >
                        {heldBack === 1 ? '1 more take' : `${heldBack} more takes`} on the project
                        page
                      </Link>
                      , imported or made from another take.
                    </p>
                  ) : null}
                </>
              )}
            </div>

            <div className="min-h-0 lg:overflow-y-auto lg:pr-1">
              <JobList
                jobs={jobs}
                hiddenCount={dismissedCount}
                onCancel={cancelJob}
                onClear={dismissJobs}
              />
            </div>
          </div>
        </>
      )}

      <TakeDetailPanel
        asset={selectedAsset}
        job={selectedJob}
        closeButtonRef={detailCloseRef}
        onClose={closeDetails}
      />

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
