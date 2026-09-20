import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ImportDropZone } from '../components/ImportDropZone.tsx';
import { JobList } from '../components/JobList.tsx';
import { RegionControls } from '../components/RegionControls.tsx';
import { RegionEditor } from '../components/remix/RegionEditor.tsx';
import { RemixForm } from '../components/remix/RemixForm.tsx';
import { SourcePicker } from '../components/remix/SourcePicker.tsx';
import { Button, Panel, SegmentedControl } from '../components/ui.tsx';
import { defaultRegion, type Region } from '../lib/region.ts';
import { chooseTask, hasRegion, remixTasks } from '../lib/remixTasks.ts';
import { projectPath, toolsPath } from '../lib/routes.ts';
import { usePlayer } from '../lib/usePlayer.ts';
import { useStudio } from '../lib/useStudio.ts';

/**
 * The remix tools, at /projects/:id/remix/:assetId.
 *
 * The source is in the path rather than in component state, so a take's detail
 * panel can link straight here with that take loaded, the back button works,
 * and the address says what is being edited. Without an asset id the page asks
 * for a source instead.
 *
 * The tool is not in the path. One page carries every task that works from a
 * take, and the picker chooses between them, which was decided on September 14,
 * 2026 over a route per tool. The question the page asks is what to do with
 * this take, so the take is the address and the tool is a control on it.
 *
 * Which tasks appear, and whether the chosen one wants the region editor, are
 * decided in `lib/remixTasks.ts` rather than here, so they can be tested.
 *
 * This page takes the full width. The takes column is the open project's list
 * and this page carries its own source list, so showing both would be one list
 * twice. The shell drops the column for this route.
 */
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
    importing,
    importFile,
    submit,
    cancelJob,
    dismissJobs,
    dismissedCount,
    computePeaksFor,
  } = useStudio();
  const { nowPlaying, playing, toggle } = usePlayer();
  const [searchParams] = useSearchParams();

  const asset = assets.find((entry) => entry.id === assetId);

  // Which tool is in force. Held by id rather than by object so it survives the
  // tasks list being refetched, and resolved through chooseTask so an id this
  // build no longer has falls back instead of emptying the page.
  //
  // Seeded from the address, so a link can name the tool it means. Arriving on
  // this page already knowing you want stems is the common case for that one,
  // since taking a take apart is not a remix of it.
  const requestedTask = searchParams.get('task') ?? undefined;
  const [picked, setPicked] = useState<string | undefined>(requestedTask);

  // A second link to this page with a different tool does not remount the
  // route, so the address has to keep being read rather than only seeding.
  useEffect(() => {
    if (requestedTask !== undefined) setPicked(requestedTask);
  }, [requestedTask]);
  const offered = remixTasks(tasks);
  const task = chooseTask(tasks, picked);
  const regionEditor = task !== undefined && hasRegion(task);

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

  // The project page, which is where this take lives. Built through the shared
  // helper so this page cannot disagree with the rest of the studio about
  // where a project is.
  const backTo = projectPath(routeProjectId ?? projectId ?? '');

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

            The tool's own name appears only once a take is loaded, because that
            is when the picker is on screen and the page really is that tool.
            While it is still asking which take to work from, naming one tool
            announces a choice nobody has made yet, and this page offers three.
          */}
          <h1
            ref={heading}
            tabIndex={-1}
            className="truncate font-display text-lg font-semibold text-ink outline-none"
          >
            {asset && task ? task.label : 'Remix a take'}
          </h1>
          <p className="mt-0.5 text-sm text-ink-faint">
            {task === undefined
              ? 'This build of Miso has no tool that works from a take.'
              : asset
                ? `${task.summary} Working from ${asset.label}.`
                : 'Pick a take to work from, then choose what to do with it.'}
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
          <div className="flex flex-col gap-4">
            {/*
              Every other project route gets this from the takes column, and
              this page drops that column to take the full width. Without it the
              only way to bring in a track to work from is to leave the page,
              import it somewhere else, and come back.
            */}
            <ImportDropZone
              onFile={importFile}
              importing={importing}
              workbenchTo={toolsPath(routeProjectId ?? projectId ?? '')}
            />

            <SourcePicker
              projectId={routeProjectId ?? projectId ?? ''}
              assets={assets}
              loading={loading}
            />
          </div>
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
        <Panel title={asset.label}>
          <div className="flex flex-col gap-5">
            {task === undefined ? (
              <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink">
                This build of Miso has no tool that works from a take, so nothing can be queued
                from here.
              </p>
            ) : (
              <>
                {/*
                  The question the page is asking, so it comes before the
                  controls that answer it. Switching tools rearranges
                  everything below, including whether the region editor is on
                  screen at all, which is why it cannot sit lower down.

                  One tool is not a choice, so the picker stays off screen
                  until there are at least two.
                */}
                {offered.length > 1 ? (
                  <SegmentedControl
                    label="What to do with this take"
                    name="remix-task"
                    options={offered.map((entry) => ({ value: entry.id, label: entry.label }))}
                    value={task.id}
                    onChange={setPicked}
                  />
                ) : null}

                {asset.peaks === undefined && regionEditor ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-md border border-warn/40 bg-warn/10 px-3 py-2">
                    <p className="text-sm text-ink">
                      This take has no saved waveform, so the shape below is drawn from the audio
                      as it loads.
                    </p>
                    <Button variant="ghost" onClick={() => computePeaksFor(asset.id)}>
                      Save waveform
                    </Button>
                  </div>
                ) : null}

                {/*
                  Only for a task that asks for a region. Showing it for a cover
                  would be a control that submits nothing, which is the mistake
                  the phase 5b probes spent their whole budget avoiding.
                */}
                {regionEditor ? (
                  <>
                    <RegionEditor
                      asset={asset}
                      region={region}
                      duration={duration}
                      onRegion={setRegion}
                      onDuration={setDuration}
                      onBeforePlay={() => {
                        // The dock and this editor are two players on one page.
                        // Only one of them should be making noise.
                        if (playing && nowPlaying !== undefined) toggle();
                      }}
                    />

                    <RegionControls region={region} duration={duration} onRegion={setRegion} />
                  </>
                ) : null}

                <div className={regionEditor ? 'border-t border-line pt-5' : undefined}>
                  {/*
                    Keyed on the task so switching tools rebuilds the form.
                    Its values are seeded from the task's own defaults once, so
                    without this a cover would open holding whatever was typed
                    into the repaint form.
                  */}
                  <RemixForm
                    key={task.id}
                    task={task}
                    asset={asset}
                    region={region}
                    catalog={catalog}
                    jobs={jobs}
                    onSubmit={submit}
                  />
                </div>
              </>
            )}
          </div>
        </Panel>
      )}

      {/*
        The queue lives on this page because the takes column that normally
        carries it is not on screen here. Without it a remix would be queued
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
