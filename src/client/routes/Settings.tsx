import { useEffect, useState } from 'react';
import type { BackendStatus, Settings as SettingsData } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { LyricsSettings } from '../components/LyricsSettings.tsx';
import { StorageUsage } from '../components/StorageUsage.tsx';
import { Button, CodeBlock, Field, Panel, Pill } from '../components/ui.tsx';

const RUN_COMMAND = `docker run -d --name miso-audiocpp --runtime=nvidia \\
  -e NVIDIA_VISIBLE_DEVICES=all -e NVIDIA_DRIVER_CAPABILITIES=all \\
  -v ./models:/app/models -p 8080:8080 \\
  ghcr.io/0xshug0/audio.cpp:full-cuda13 \\
  server --ui --ui-management --host 0.0.0.0 --port 8080 --backend cuda`;

export function SettingsRoute() {
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState<SettingsData | undefined>();
  const [tested, setTested] = useState<BackendStatus | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSaved(s);
        setUrl(s.backendUrl);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const dirty = saved !== undefined && url.trim().replace(/\/+$/, '') !== saved.backendUrl;

  async function test() {
    setBusy(true);
    setError(undefined);
    try {
      setTested(await api.getBackendStatus(url));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const next = await api.saveSettings({ backendUrl: url });
      setSaved(next);
      setUrl(next.backendUrl);
      setTested(await api.getBackendStatus());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl">Settings</h1>
        <p className="mt-1 text-ink-muted">Where Miso finds the models it runs, and who writes your lyrics.</p>
      </div>

      <Panel
        title="audio.cpp server"
        description="Miso sends every generation to this address. It can be this machine, a home server, or a NAS."
      >
        <div className="flex flex-col gap-5">
          <Field
            label="Server URL"
            type="url"
            inputMode="url"
            spellCheck={false}
            autoComplete="off"
            placeholder="http://127.0.0.1:8080"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setTested(undefined);
            }}
            hint="The address of a running audio.cpp server, including the port."
            error={error}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={test} busy={busy} disabled={!url.trim()}>
              Test connection
            </Button>
            <Button variant="primary" onClick={save} busy={busy} disabled={!dirty || !url.trim()}>
              Save
            </Button>
            {dirty ? <span className="text-sm text-ink-faint">Unsaved change</span> : null}
          </div>

          {tested ? <StatusReport status={tested} /> : null}
        </div>
      </Panel>

      <Panel
        title="Starting a server"
        description="Miso does not manage the container yet, so start it yourself with this command."
      >
        <div className="flex flex-col gap-4">
          <CodeBlock>{RUN_COMMAND}</CodeBlock>
          <div className="flex flex-col gap-2 text-sm text-ink-muted">
            <p>
              Use <code className="font-mono text-ink">--runtime=nvidia</code>, not{' '}
              <code className="font-mono text-ink">--gpus all</code>. The second one starts the
              container and lets nvidia-smi work while CUDA silently falls back to the processor.
            </p>
            <p>
              <code className="font-mono text-ink">--ui-management</code> is required. Without it
              Miso cannot browse models, download them, upload audio, or load a model to run.
            </p>
          </div>
        </div>
      </Panel>

      {saved ? <LyricsSettings settings={saved} onSaved={setSaved} /> : null}

      <StorageUsage />
    </div>
  );
}

function StatusReport({ status }: { status: BackendStatus }) {
  if (!status.reachable) {
    return (
      <div className="rounded-md border border-bad/40 bg-bad/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Pill tone="bad">no answer</Pill>
          <span className="text-sm font-medium text-ink">Could not connect</span>
        </div>
        <p className="mt-2 text-sm text-ink-muted">{status.error}</p>
      </div>
    );
  }

  const rows: [string, string][] = [
    ['Compute backend', status.backend ?? 'unknown'],
    ['Models registered', String(status.models ?? 0)],
    ['Response time', status.latencyMs !== undefined ? `${status.latencyMs} ms` : 'unknown'],
  ];

  return (
    <div className="rounded-md border border-line bg-canvas px-4 py-3">
      <div className="flex items-center gap-2">
        <Pill tone="good">connected</Pill>
        <span className="text-sm font-medium text-ink">Server is responding</span>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 sm:contents">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="font-mono text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {status.managementEnabled === false ? (
        <div className="mt-3 border-t border-line pt-3">
          <div className="flex items-center gap-2">
            <Pill tone="warn">limited</Pill>
            <span className="text-sm text-ink">Model management is off</span>
          </div>
          <p className="mt-1.5 text-sm text-ink-muted">
            This server was started without <code className="font-mono">--ui-management</code>.
            Miso can check its health, but cannot download models, upload audio, or load a model to
            run. Restart it with that flag.
          </p>
        </div>
      ) : null}
    </div>
  );
}
