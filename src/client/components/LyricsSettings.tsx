import { useState } from 'react';
import type { LyricsEngine, Settings } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { Button, Field, Panel, Pill, SegmentedControl } from './ui.tsx';

/**
 * Where the lyrics assistant gets its language model.
 *
 * Both engines stay configured and a switch says which is used, so swapping
 * between a provider and a local server does not mean typing a key back in.
 *
 * The key is write only. It goes to the service and never comes back, so this
 * screen can say whether one is stored but cannot show it. That is deliberate:
 * a settings page that renders a key puts it in a phone's memory, a screenshot,
 * and a page source, and nobody who typed it needs to read it again.
 */

const ENGINES: { value: LyricsEngine; label: string }[] = [
  { value: 'external', label: 'API provider' },
  { value: 'local', label: 'Local llama.cpp' },
];

export function LyricsSettings({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (next: Settings) => void;
}) {
  const [engine, setEngine] = useState<LyricsEngine>(settings.lyricsEngine);
  const [externalUrl, setExternalUrl] = useState(settings.lyricsExternalUrl);
  const [externalModel, setExternalModel] = useState(settings.lyricsExternalModel);
  const [key, setKey] = useState('');
  const [localUrl, setLocalUrl] = useState(settings.lyricsLocalUrl);
  const [localModel, setLocalModel] = useState(settings.lyricsLocalModel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  const dirty =
    engine !== settings.lyricsEngine ||
    externalUrl.trim().replace(/\/+$/, '') !== settings.lyricsExternalUrl ||
    externalModel.trim() !== settings.lyricsExternalModel ||
    localUrl.trim().replace(/\/+$/, '') !== settings.lyricsLocalUrl ||
    localModel.trim() !== settings.lyricsLocalModel ||
    key !== '';

  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const next = await api.saveSettings({
        lyricsEngine: engine,
        lyricsExternalUrl: externalUrl,
        lyricsExternalModel: externalModel,
        lyricsLocalUrl: localUrl,
        lyricsLocalModel: localModel,
        ...(key === '' ? {} : { lyricsExternalKey: key }),
      });
      onSaved(next);
      setKey('');
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const clearKey = async () => {
    setBusy(true);
    setError(undefined);
    try {
      onSaved(await api.saveSettings({ lyricsExternalKey: '' }));
      setKey('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Lyrics assistant"
      description="Writes lyrics and expands prompts. It never runs on the GPU holding your music model, which is why it is a separate service rather than a model Miso loads."
    >
      <div className="flex flex-col gap-6">
        <SegmentedControl
          label="Which engine to use"
          name="lyrics-engine"
          options={ENGINES}
          value={engine}
          onChange={(next) => {
            setEngine(next);
            setDone(false);
          }}
          hint="Both stay configured. This only says which one the assistant calls."
        />

        {engine === 'external' ? (
          <div className="flex flex-col gap-5">
            <Field
              label="Base URL"
              type="url"
              inputMode="url"
              spellCheck={false}
              autoComplete="off"
              placeholder="https://api.openai.com/v1"
              value={externalUrl}
              onChange={(event) => setExternalUrl(event.target.value)}
              hint="Any OpenAI-compatible endpoint, including the version path. OpenRouter is https://openrouter.ai/api/v1."
            />

            <Field
              label="Model"
              spellCheck={false}
              autoComplete="off"
              placeholder="gpt-5-nano"
              value={externalModel}
              onChange={(event) => setExternalModel(event.target.value)}
              hint="The model id exactly as your provider writes it."
            />

            <div className="flex flex-col gap-2">
              <Field
                label="API key"
                type="password"
                spellCheck={false}
                autoComplete="off"
                placeholder={settings.lyricsExternalKeySet ? 'Stored. Type a new one to replace it.' : 'sk-...'}
                value={key}
                onChange={(event) => setKey(event.target.value)}
                hint="Kept in Miso's database on this machine and sent only to the URL above."
              />
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={settings.lyricsExternalKeySet ? 'good' : 'neutral'}>
                  {settings.lyricsExternalKeySet ? 'key stored' : 'no key'}
                </Pill>
                {settings.lyricsExternalKeySet ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    busy={busy}
                    onClick={() => void clearKey()}
                  >
                    Remove the stored key
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <Field
              label="Server URL"
              type="url"
              inputMode="url"
              spellCheck={false}
              autoComplete="off"
              placeholder="http://127.0.0.1:8081/v1"
              value={localUrl}
              onChange={(event) => setLocalUrl(event.target.value)}
              hint="A llama.cpp server started with --port, including the /v1 path. No key is needed."
            />

            <Field
              label="Model"
              spellCheck={false}
              autoComplete="off"
              placeholder="local-model"
              value={localModel}
              onChange={(event) => setLocalModel(event.target.value)}
              hint="llama.cpp serves whatever weights it was started with, so any name works here."
            />

            <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink">
              On a single card, a language model and a music model do not both fit. Free the card
              with Unload models before generating, or keep the assistant on a provider.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" className="min-h-11" busy={busy} disabled={!dirty} onClick={() => void save()}>
            Save
          </Button>
          {dirty ? (
            <span className="text-sm text-ink-faint">Unsaved change</span>
          ) : done ? (
            <span className="text-sm text-ink-faint">Saved.</span>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink">
            {error}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
