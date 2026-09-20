import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { SaveControls } from '../components/workbench/SaveControls.tsx';
import { SourceFacts } from '../components/workbench/SourceFacts.tsx';
import { SourcePanel } from '../components/workbench/SourcePanel.tsx';
import { Button, Panel } from '../components/ui.tsx';
import { projectPath } from '../lib/routes.ts';
import { useStudio } from '../lib/useStudio.ts';
import { useWorkbench } from '../lib/useWorkbench.ts';

/**
 * The audio workbench, at /projects/:id/tools.
 *
 * The one tool page with no model behind it. Everything else in Miso queues a
 * job, waits on a GPU and writes a row with lineage. This converts, trims and
 * levels audio in the browser, and the service only hears about it when you
 * save, through the same upload route an import uses.
 *
 * That is why it is its own route rather than a tool inside Remix. The question
 * that page asks is what to make from a take, and the answer always costs
 * minutes. The question this page asks is what shape a file should be in, and
 * the answer is immediate. Putting them behind one picker would misrepresent
 * both.
 *
 * It takes the full width and drops the takes column, because it carries its
 * own list of takes and needs the room for a waveform.
 */
export function ToolsRoute() {
  const { id: routeProjectId } = useParams();
  const { project, projectId, assets, loading, reload } = useStudio();
  const [searchParams] = useSearchParams();

  const workbench = useWorkbench(routeProjectId ?? projectId, reload);
  const { source, loadTake } = workbench;

  // Arriving here follows a link, and a client side route change leaves focus
  // on whatever was clicked, which is a panel that has since closed. Moving it
  // to the heading means a keyboard or screen reader lands at the top of the
  // page it just opened rather than back at the document body.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  // A take named in the address is loaded once, so a link from a take's detail
  // panel opens this page already working on it. Held in a ref rather than
  // depended on, because loading it sets state this effect would otherwise see
  // as a reason to load it again.
  const requestedTake = searchParams.get('take') ?? undefined;
  const loadedTake = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (requestedTake === undefined || loadedTake.current === requestedTake) return;
    const asset = assets.find((entry) => entry.id === requestedTake);
    if (!asset) return;

    loadedTake.current = requestedTake;
    void loadTake(asset);
  }, [requestedTake, assets, loadTake]);

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
            order. Programmatic focus raises no focus ring, so this is silent
            for a mouse and useful for everyone else.
          */}
          <h1
            ref={heading}
            tabIndex={-1}
            className="truncate font-display text-lg font-semibold text-ink outline-none"
          >
            Audio tools
          </h1>
          <p className="mt-0.5 text-sm text-ink-faint">
            {source
              ? `Working on ${source.name}. Nothing is saved until you save it.`
              : 'Convert, trim and level audio in this browser. No model, no queue.'}
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

      {workbench.error ? (
        <p
          role="alert"
          className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink"
        >
          {workbench.error}
        </p>
      ) : null}

      {source === undefined ? (
        <SourcePanel
          assets={assets}
          loading={loading}
          busy={workbench.loading}
          onFile={(file) => void workbench.loadFile(file)}
          onTake={(asset) => void workbench.loadTake(asset)}
        />
      ) : (
        <Panel title={source.name}>
          <div className="flex flex-col gap-5">
            <SourceFacts source={source} />

            <div className="border-t border-line pt-5">
              <SaveControls workbench={workbench} suffix="converted" label="Save into the project" />
            </div>

            <div className="border-t border-line pt-4">
              <Button
                variant="ghost"
                onClick={() => {
                  loadedTake.current = undefined;
                  workbench.reset();
                }}
                className="min-h-11"
              >
                <RotateCcw aria-hidden="true" className="h-4 w-4 shrink-0" />
                Work on something else
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {workbench.loading ? (
        <p className="text-sm text-ink-muted">Decoding. This happens in the browser.</p>
      ) : null}
    </div>
  );
}
