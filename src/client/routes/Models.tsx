import { useState } from 'react';
import { ConfirmDialog } from '../components/Dialog.tsx';
import { ModelCard } from '../components/ModelCard.tsx';
import { Button, CodeBlock, Panel } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useCatalog } from '../lib/useCatalog.ts';

const ENABLE_MANAGEMENT_COMMAND = `docker run -d --name miso-audiocpp --runtime=nvidia \\
  -e NVIDIA_VISIBLE_DEVICES=all -e NVIDIA_DRIVER_CAPABILITIES=all \\
  -v ./models:/app/models \\
  -p 8080:8080 ghcr.io/0xshug0/audio.cpp:full-cuda13 \\
  server --ui --ui-management --host 0.0.0.0 --port 8080 --backend cuda`;

/**
 * The model catalog.
 *
 * It renders from vendored spec data, so it still tells you what each model is
 * when the backend is unreachable or was started without --ui-management. Only
 * the sizes, the installed state, and the buttons go away.
 */
export function Models() {
  const { catalog, error, loading, reload, act, cleanPartials } = useCatalog();
  const [confirmingClean, setConfirmingClean] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<string | undefined>();
  const [unloading, setUnloading] = useState(false);
  const [unloadResult, setUnloadResult] = useState<string | undefined>();

  /**
   * Frees the card.
   *
   * No confirmation, unlike the clean-up beside it. Nothing is deleted and
   * nothing is lost: the next job loads what it needs again, which is about
   * nine seconds for ACE-Step. That puts it with Refresh rather than with the
   * destructive action.
   *
   * This is what a generation that ran out of video memory tells people to
   * reach for. That message has always named "Unload models" and this is the
   * first time the control has existed: the route and the API call were both
   * there, with nothing calling them.
   */
  async function runUnload() {
    setUnloading(true);
    setUnloadResult(undefined);
    try {
      await api.unloadModels();
      setUnloadResult('Models unloaded. The card is free, and the next job loads what it needs.');
    } catch (cause) {
      setUnloadResult(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUnloading(false);
    }
  }

  async function runClean() {
    setCleaning(true);
    const { ok, removed } = await cleanPartials();
    setCleaning(false);
    setConfirmingClean(false);
    if (!ok) return setCleanResult(undefined);
    if (removed === 0) return setCleanResult('Nothing to clean up. No partial downloads were left behind.');
    setCleanResult(
      removed === undefined
        ? 'Partial downloads cleaned up.'
        : `Cleaned up ${removed} partial ${removed === 1 ? 'download' : 'downloads'}.`,
    );
  }

  if (loading) return <p className="text-sm text-ink-muted">Loading the catalog.</p>;

  if (!catalog) {
    return (
      <Panel title="Catalog unavailable" description={error}>
        <Button onClick={() => void reload()}>Try again</Button>
      </Panel>
    );
  }

  const unavailable = catalog.live === 'unavailable';
  const managementOff = catalog.unavailableReason === 'management_disabled';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">Models</h1>
          <p className="mt-1 text-sm text-ink-muted">
            The music models audio.cpp can run. Sizes and install state come from{' '}
            <span className="font-mono text-xs">{catalog.backendUrl}</span>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={() => void runUnload()}
            busy={unloading}
            disabled={unavailable}
          >
            Unload models
          </Button>
          <Button variant="ghost" onClick={() => setConfirmingClean(true)} disabled={unavailable}>
            Clean up partial downloads
          </Button>
          <Button variant="ghost" onClick={() => void reload()}>
            Refresh
          </Button>
        </div>
      </header>

      {unloadResult ? (
        <p role="status" className="rounded-md border border-line px-4 py-3 text-sm text-ink-muted">
          {unloadResult}
        </p>
      ) : null}

      {cleanResult ? (
        <p role="status" className="rounded-md border border-line px-4 py-3 text-sm text-ink-muted">
          {cleanResult}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md border border-bad/40 px-4 py-3 text-sm text-bad">
          {error}
        </p>
      ) : null}

      {catalog.live === 'scanning' ? (
        <p className="rounded-md border border-line px-4 py-3 text-sm text-ink-muted">
          The server is scanning its model packages. Sizes and install state appear when it finishes.
        </p>
      ) : null}

      {managementOff ? (
        <Panel
          title="Model management is switched off"
          description="This server was started without --ui-management, so Miso cannot install or remove models on it. The descriptions below still apply."
        >
          <p className="mb-3 text-sm text-ink-muted">Restart the container with the management routes enabled:</p>
          <CodeBlock>{ENABLE_MANAGEMENT_COMMAND}</CodeBlock>
        </Panel>
      ) : null}

      {unavailable && !managementOff ? (
        <p className="rounded-md border border-warn/40 px-4 py-3 text-sm text-warn">
          Miso could not reach the server, so sizes and install state are missing. {catalog.unavailableMessage}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {catalog.families.map((family) => (
          <ModelCard
            key={family.family}
            family={family}
            disabled={unavailable}
            onInstall={(id) => void act(() => api.installPackage(id))}
            onStop={(id) => void act(() => api.stopInstall(id))}
            onRemove={(id) => void act(() => api.removePackage(id))}
          />
        ))}
      </div>

      <ConfirmDialog
        open={confirmingClean}
        title="Clean up partial downloads?"
        body={
          <>
            <p>
              A download that was cancelled, failed, or stopped when the server did leaves a partly downloaded
              folder behind. audio.cpp cannot resume one, so a later install starts again from the beginning and
              the old folder just takes up space.
            </p>
            <p className="mt-2">
              Miso cannot tell how much there is until it asks, so this checks every model. Installed models are
              not touched.
            </p>
          </>
        }
        confirmLabel="Clean up"
        destructive
        busy={cleaning}
        onConfirm={() => void runClean()}
        onCancel={() => setConfirmingClean(false)}
      />

      <p className="text-xs text-ink-faint">
        Model descriptions come from audio.cpp at commit{' '}
        <span className="font-mono">{catalog.specVersion.slice(0, 12)}</span>.
      </p>
    </div>
  );
}
