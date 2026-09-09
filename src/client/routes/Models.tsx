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
  const { catalog, error, loading, reload, act } = useCatalog();

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
        <Button variant="ghost" onClick={() => void reload()}>
          Refresh
        </Button>
      </header>

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
            onClean={(id) => void act(() => api.cleanPartial(id))}
          />
        ))}
      </div>

      <p className="text-xs text-ink-faint">
        Model descriptions come from audio.cpp at commit{' '}
        <span className="font-mono">{catalog.specVersion.slice(0, 12)}</span>.
      </p>
    </div>
  );
}
