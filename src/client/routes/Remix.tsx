import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { JobList } from '../components/JobList.tsx';
import { RegionControls } from '../components/remix/RegionControls.tsx';
import { RegionEditor } from '../components/remix/RegionEditor.tsx';
import { RemixForm } from '../components/remix/RemixForm.tsx';
import { SourcePicker } from '../components/remix/SourcePicker.tsx';
import { Button, Panel } from '../components/ui.tsx';
import { defaultRegion, type Region } from '../lib/region.ts';
import { usePlayer } from '../lib/usePlayer.ts';
import { useStudio } from '../lib/useStudio.ts';

/**
 * The region editor, at /projects/:id/remix/:assetId.
 *
 * The source is in the path rather than in component state, so a take's detail
 * panel can link straight here with that take loaded, the back button works,
 * and the address says what is being edited. Without an asset id the page asks
 * for a source instead.
 *
 * This page takes the full width. The takes column is the open project's list
 * and this page carries its own source list, so showing both would be one list
 * twice. The shell drops the column for this route.
 */
/** The registry task this page drives. */
const REMIX_TASK_ID = 'remix.repaint';

export function RemixRoute() {
  const { id: routeProjectId, assetId } = useParams();
  const {
    project,
    projectId,
    assets,
    tasks,
    catalog,
    jobs,
    loading,
    error,
    submit,
    cancelJob,
    dismissJobs,
    dismissedCount,
    computePeaksFor,
  } = useStudio();
  const { nowPlaying, playing, toggle } = usePlayer();

  const asset = assets.find((entry) => entry.id === assetId);
  // This page is the repaint editor specifically, so it asks for that task by
  // name rather than offering whichever remix routes happen to exist. The other
  // ACE-Step routes get their own pages when they arrive.
  const task = tasks.find((entry) => entry.id === REMIX_TASK_ID);

  // The asset row's own figure until wavesurfer has decoded enough to disagree.
  // Starting from it means the region opens in the right place rather than
  // jumping once the audio loads.
  const [duration, setDuration] = useState(asset?.durationSeconds ?? 0);
  const [region, setRegion] = useState<Region>(() => defaultRegion(asset?.durationSeconds ?? 0));

  // A different take is a different track, so its region starts again rather
  // than keeping seconds that meant something on the last one.
  useEffect(() => {
    const length = asset?.durationSeconds ?? 0;
    setDuration(length);
    setRegion(defaultRegion(length));
  }, [asset?.id, asset?.durationSeconds]);

  // Arriving here follows a link, and a client side route change leaves focus
  // on whatever was clicked, which is a panel that has since closed. Moving it
  // to the heading means a keyboard or screen reader lands at the top of the
  // page it just opened rather than back at the document body.
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, [assetId]);

  const backTo = `/projects/${encodeURIComponent(routeProjectId ?? projectId ?? '')}`;

  if (!project && loading) {
    return <p className="text-sm text-ink-muted">Loading this project.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {/*
            tabIndex -1 so it can be focused on arrival without joining the tab
            order. Programmatic focus does not raise a focus ring, so this is
            silent for a mouse and useful for everyone else.
          */}
          <h1
            ref={heading}
            tabIndex={-1}
            className="truncate font-display text-lg font-semibold text-ink outline-none"
          >
            Repaint a section
          </h1>
          <p className="mt-0.5 text-sm text-ink-faint">
            {asset
              ? `Replacing part of ${asset.label}. The rest of the take is left alone.`
              : 'Replaces the part of a take you select, and leaves the rest alone.'}
          </p>
        </div>

        <Link
          to={backTo}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-ink-muted transition-colors duration-150 hover:bg-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
          {project ? `Back to ${project.name}` : 'Back to the project'}
        </Link>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink"
        >
          {error}
        </p>
      ) : null}

      {assetId === undefined ? (
        <Panel title="Pick a source">
          <SourcePicker
            projectId={routeProjectId ?? projectId ?? ''}
            assets={assets}
            loading={loading}
          />
        </Panel>
      ) : asset === undefined ? (
        <Panel title="That take is not here">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-muted">
              {loading
                ? 'Loading this project.'
                : 'This project has no take with that address. It may have been deleted.'}
            </p>
            {loading ? null : (
              <Link
                to={`${backTo}/remix`}
                className="self-start text-sm text-accent underline underline-offset-4 hover:no-underline"
              >
                Pick a different source
              </Link>
            )}
          </div>
        </Panel>
      ) : (
        <Panel
          title={asset.label}
          description="Select the part to replace. Miso rebuilds it in the style of the track around it. Lyrics steer what it sings, though not on every run."
        >
          <div className="flex flex-col gap-5">
            {asset.peaks === undefined ? (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-warn/40 bg-warn/10 px-3 py-2">
                <p className="text-sm text-ink">
                  This take has no saved waveform, so the shape below is drawn from the audio as it
                  loads.
                </p>
                <Button variant="ghost" onClick={() => computePeaksFor(asset.id)}>
                  Save waveform
                </Button>
              </div>
            ) : null}

            <RegionEditor
              asset={asset}
              region={region}
              duration={duration}
              onRegion={setRegion}
              onDuration={setDuration}
              onBeforePlay={() => {
                // The dock and this editor are two players on one page. Only
                // one of them should be making noise.
                if (playing && nowPlaying !== undefined) toggle();
              }}
            />

            <RegionControls region={region} duration={duration} onRegion={setRegion} />

            {task === undefined ? (
              <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink">
                This build of Miso has no repaint task, so nothing can be queued from here.
              </p>
            ) : (
              <div className="border-t border-line pt-5">
                <RemixForm
                  task={task}
                  asset={asset}
                  region={region}
                  catalog={catalog}
                  jobs={jobs}
                  onSubmit={submit}
                />
              </div>
            )}
          </div>
        </Panel>
      )}

      {/*
        The queue lives on this page because the takes column that normally
        carries it is not on screen here. Without it a repaint would be queued
        into silence.
      */}
      {assetId === undefined ? null : (
        <JobList
          jobs={jobs}
          hiddenCount={dismissedCount}
          onCancel={cancelJob}
          onClear={dismissJobs}
        />
      )}
    </div>
  );
}
