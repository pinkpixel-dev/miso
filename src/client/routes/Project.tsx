import { AudioLines, Pencil, Plus, Scissors, SlidersHorizontal, Waves } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Asset } from '../../shared/types.ts';
import { ConfirmDialog } from '../components/Dialog.tsx';
import { ImportDropZone } from '../components/ImportDropZone.tsx';
import { JobList } from '../components/JobList.tsx';
import { TakeSections } from '../components/project/TakeSections.tsx';
import { TakeDetailPanel } from '../components/shell/TakeDetailPanel.tsx';
import { IconButton, Panel, cx } from '../components/ui.tsx';
import { SEPARATE_TASK_ID, createPath, remixPath, soundPath, toolsPath } from '../lib/routes.ts';
import { findProducingJob } from '../lib/takeDetails.ts';
import { groupTakes } from '../lib/takeGroups.ts';
import { usePlayer } from '../lib/usePlayer.ts';
import { useStudio } from '../lib/useStudio.ts';

/**
 * The project, at /projects/:id.
 *
 * Opening a project shows the project rather than a form. This page takes the
 * full width, because it carries its own list of takes and the takes column
 * beside the create form is that same list at a narrower scope.
 *
 * Everything in the project is here, grouped by how it was made. The create
 * page's column holds only what that form generated, so the list you write
 * into does not fill up with repaints.
 */

const toolLink = cx(
  'inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-raised px-3.5 py-2',
  'text-sm font-medium text-ink transition-colors duration-150',
  'hover:border-line-strong hover:bg-raised/70 active:bg-raised',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
);

function formatBytes(bytes: number): string {
  if (bytes === 0) return 'empty';
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}

function countLabel(count: number): string {
  return count === 1 ? '1 take' : `${count} takes`;
}

export function ProjectRoute() {
  const {
    project,
    projectId,
    assets,
    allJobs,
    jobs,
    tasks,
    loading,
    error,
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

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>();
  const [pendingRemoval, setPendingRemoval] = useState<Asset | undefined>();
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const detailCloseRef = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const sections = useMemo(() => groupTakes(assets, allJobs, tasks), [assets, allJobs, tasks]);

  const closeDetails = useCallback(() => {
    setSelectedAssetId(undefined);
    // Closing returns focus to the row that opened the panel, rather than
    // dropping it on the document body beside a panel that is no longer there.
    const trigger = detailTriggerRef.current;
    detailTriggerRef.current = null;
    trigger?.focus();
  }, []);

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId);
  const selectedJob = selectedAsset ? findProducingJob(allJobs, selectedAsset.id) : undefined;

  // A take can be deleted while its details are open, from here or from the
  // takes column on another route.
  useEffect(() => {
    if (selectedAssetId !== undefined && selectedAsset === undefined) closeDetails();
  }, [closeDetails, selectedAsset, selectedAssetId]);

  // An unfinished rename must not carry into the next project.
  useEffect(() => {
    setEditingName(false);
    setSelectedAssetId(undefined);
    detailTriggerRef.current = null;
  }, [projectId]);

  // Arriving here follows a link, and a client side route change leaves focus
  // on whatever was clicked, which is often a control that is no longer on
  // screen. Moving it to the heading lands a keyboard or screen reader at the
  // top of the page they just opened rather than back at the document body.
  useEffect(() => {
    heading.current?.focus();
  }, [projectId]);

  if (loading && !project) {
    return <p className="text-sm text-ink-muted">Loading this project.</p>;
  }

  if (!project || projectId === undefined) {
    return (
      <Panel title="Project not found">
        <p className="text-sm text-ink-muted">
          Nothing here with that address.{' '}
          <Link to="/" className="text-accent underline underline-offset-4 hover:no-underline">
            Start somewhere else
          </Link>
          .
        </p>
      </Panel>
    );
  }

  function beginRename() {
    if (!project) return;
    setNameDraft(project.name);
    setEditingName(true);
  }

  function commitRename(event?: FormEvent) {
    event?.preventDefault();
    if (!project) return;
    const next = nameDraft.trim();
    if (next !== '' && next !== project.name) renameProject(next);
    setEditingName(false);
  }

  return (
    // The detail panel is absolutely positioned and needs a box to position
    // against. Without this it would lay itself out over whatever ancestor
    // happened to be positioned.
    <div className="relative min-h-full">
      <div className="flex flex-col gap-6">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {editingName ? (
              <form onSubmit={commitRename}>
                <label htmlFor="rename-open-project" className="sr-only">
                  Rename {project.name}
                </label>
                <input
                  id="rename-open-project"
                  autoFocus
                  value={nameDraft}
                  maxLength={200}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onBlur={() => commitRename()}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setEditingName(false);
                    }
                  }}
                  className="w-full rounded-sm border border-line-strong bg-canvas px-2 py-1 font-display text-lg font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                />
              </form>
            ) : (
              <div className="flex min-w-0 items-center gap-1">
                {/*
                  tabIndex -1 so it can be focused on arrival without joining
                  the tab order. Programmatic focus raises no focus ring, so
                  this is silent for a mouse and useful for everyone else.
                */}
                <h1
                  ref={heading}
                  tabIndex={-1}
                  className="truncate font-display text-lg font-semibold text-ink outline-none"
                >
                  {project.name}
                </h1>
                <IconButton
                  label={`Rename ${project.name}`}
                  icon={Pencil}
                  onClick={beginRename}
                />
              </div>
            )}
            <p className="mt-0.5 text-sm text-ink-faint">
              {loading ? 'Loading.' : `${countLabel(assets.length)}, ${formatBytes(project.bytes)}`}
            </p>
          </div>

          <nav aria-label="Tools for this project" className="flex flex-wrap gap-2">
            <Link to={createPath(projectId)} className={toolLink}>
              <Plus aria-hidden="true" className="h-4 w-4 shrink-0" />
              Generate a take
            </Link>
            {assets.length === 0 ? null : (
              <Link to={remixPath(projectId)} className={toolLink}>
                <Scissors aria-hidden="true" className="h-4 w-4 shrink-0" />
                Remix a take
              </Link>
            )}
            {/*
              Its own link rather than a tool inside Remix. Splitting a take
              apart is not a remix of it, and the picker on that page is where
              this went unfound.
            */}
            {assets.length === 0 ? null : (
              <Link
                to={remixPath(projectId, undefined, SEPARATE_TASK_ID)}
                className={toolLink}
              >
                <AudioLines aria-hidden="true" className="h-4 w-4 shrink-0" />
                Split into stems
              </Link>
            )}
            {/*
              Always offered, unlike the tools above it. The others need a take
              to work from, and this one takes a file straight off the disk, so
              an empty project is exactly when it is useful: it is how an mp3
              becomes something separation will accept.
            */}
            <Link to={toolsPath(projectId)} className={toolLink}>
              <SlidersHorizontal aria-hidden="true" className="h-4 w-4 shrink-0" />
              Audio tools
            </Link>
            {/*
              Also always offered. Sound effects need nothing to work from, and
              the transcription half says so itself when the project has no WAV
              take to read.
            */}
            <Link to={soundPath(projectId)} className={toolLink}>
              <Waves aria-hidden="true" className="h-4 w-4 shrink-0" />
              Sound design
            </Link>
          </nav>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink"
          >
            {error}
          </p>
        ) : null}

        {/*
          The takes are the reading matter on this page, so they get a measure
          rather than the full width of whatever monitor this is on. The queue
          and the import zone sit in the same column so the page has one edge.
        */}
        <div className="flex max-w-3xl flex-col gap-8">
          <ImportDropZone
              onFile={importFile}
              importing={importing}
              workbenchTo={toolsPath(projectId)}
            />

          {assets.length === 0 ? (
            <Panel title="Nothing here yet">
              <p className="text-sm text-ink-muted">
                Generate a take to get started, or drop a song in above.{' '}
                <Link
                  to={createPath(projectId)}
                  className="text-accent underline underline-offset-4 hover:no-underline"
                >
                  Open the create page
                </Link>
                .
              </p>
            </Panel>
          ) : (
            <TakeSections
              sections={sections}
              selectedAssetId={selectedAssetId}
              onOpenDetails={(asset, trigger) => {
                detailTriggerRef.current = trigger;
                setSelectedAssetId(asset.id);
              }}
              onRename={(asset, label) => renameAsset(asset.id, label)}
              onRemove={(asset) => setPendingRemoval(asset)}
            />
          )}

          {/*
            The queue is here as well as on the create page. You can start a
            job and come back, and a page about the project that cannot say a
            job is running is a page you have to leave to find out.
          */}
          <JobList
            jobs={jobs}
            hiddenCount={dismissedCount}
            onCancel={cancelJob}
            onClear={dismissJobs}
          />
        </div>
      </div>

      <TakeDetailPanel
        asset={selectedAsset}
        job={selectedJob}
        assets={assets}
        jobs={allJobs}
        tasks={tasks}
        closeButtonRef={detailCloseRef}
        onSelect={setSelectedAssetId}
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
            // The dock holds an asset rather than an id, so a deleted take
            // would otherwise sit in the transport pointing at a missing file.
            clear(pendingRemoval.id);
            removeAsset(pendingRemoval.id);
          }
          setPendingRemoval(undefined);
        }}
        onCancel={() => setPendingRemoval(undefined)}
      />
    </div>
  );
}
