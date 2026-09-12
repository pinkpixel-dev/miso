import { useEffect, useState } from 'react';
import type { SavedPrompt, SavedPromptKind } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { FormDialog } from './Dialog.tsx';
import { Button, Field } from './ui.tsx';

/**
 * Keep a prompt or a lyric sheet by name, and reach for it again later.
 *
 * This is deliberately not job history. History records what was used, which is
 * everything, including the six attempts that went nowhere. This records the
 * one somebody decided was worth keeping, and it survives the project it was
 * written in being deleted.
 *
 * Saving over a name replaces it, so the list does not fill up with four
 * versions of the same idea.
 */

const LABELS: Record<SavedPromptKind, { one: string; save: string; load: string }> = {
  prompt: { one: 'prompt', save: 'Save this prompt', load: 'Load a saved prompt' },
  lyrics: { one: 'lyric sheet', save: 'Save these lyrics', load: 'Load a saved lyric sheet' },
};

export function SavedPrompts({
  kind,
  body,
  onLoad,
  disabled,
}: {
  kind: SavedPromptKind;
  /** What "save" would keep. Empty means there is nothing to save yet. */
  body: string;
  onLoad: (body: string) => void;
  disabled?: boolean;
}) {
  const [saved, setSaved] = useState<SavedPrompt[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const labels = LABELS[kind];

  useEffect(() => {
    let cancelled = false;
    void api
      .getSaved(kind)
      .then((entries) => {
        if (!cancelled) setSaved(entries);
      })
      .catch(() => {
        // A list that could not be fetched is an empty picker, not an error
        // banner over a form somebody is trying to write a song in.
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const entry = await api.savePrompt({ kind, name: name.trim(), body: body.trim() });
      setSaved((current) => [
        entry,
        ...current.filter((existing) => existing.id !== entry.id),
      ].sort((a, b) => a.name.localeCompare(b.name)));
      setNaming(false);
      setName('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const existing = saved.find((entry) => entry.name === name.trim());

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        className="min-h-11"
        disabled={disabled || body.trim() === ''}
        onClick={() => setNaming(true)}
      >
        {labels.save}
      </Button>

      {saved.length > 0 ? (
        <label className="flex items-center gap-2">
          <span className="sr-only">{labels.load}</span>
          <select
            aria-label={labels.load}
            value=""
            disabled={disabled}
            onChange={(event) => {
              const entry = saved.find((option) => option.id === event.target.value);
              if (entry) onLoad(entry.body);
            }}
            className="min-h-11 rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-45"
          >
            <option value="">{labels.load}</option>
            {saved.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <FormDialog
        open={naming}
        title={labels.save}
        description={`Give it a name you will recognize. Saving over a name replaces that ${labels.one}.`}
        confirmLabel={existing ? 'Replace it' : 'Save'}
        confirmDisabled={name.trim() === ''}
        busy={busy}
        onConfirm={() => void save()}
        onCancel={() => {
          setNaming(false);
          setName('');
          setError(undefined);
        }}
      >
        <Field
          label="Name"
          placeholder={kind === 'prompt' ? 'Warm synthwave' : 'Chorus idea'}
          value={name}
          onChange={(event) => setName(event.target.value)}
          hint={existing ? `There is already a ${labels.one} called this. Saving replaces it.` : undefined}
          error={error}
        />
      </FormDialog>
    </div>
  );
}
