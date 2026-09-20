import { useMemo, useState } from 'react';
import type { Catalog, StudioTask } from '../../../shared/types.ts';
import { buildLabel, installedPackages } from '../../lib/models.ts';
import { PlainField } from '../TaskFields.tsx';
import { Button, Panel } from '../ui.tsx';
import { Disclosure } from '../Disclosure.tsx';

/**
 * Writing a sound effect from a description.
 *
 * Not the generate form. That one writes songs: it carries a lyric editor, a
 * guided builder that asks for a genre and a voice, saved prompts and an
 * assistant, none of which mean anything for a door slam. What is left when
 * those go is a prompt, a length and three advanced numbers, which is small
 * enough to draw here from the task's own fields.
 *
 * The fields still come from the service rather than being written out here,
 * so the form follows the task registry the way every other form does.
 */
export function SoundEffects({
  task,
  catalog,
  busy,
  onSubmit,
}: {
  task: StudioTask | undefined;
  catalog: Catalog | undefined;
  busy: boolean;
  onSubmit: (modelId: string, params: Record<string, string | number>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [modelId, setModelId] = useState<string | undefined>();

  const packages = useMemo(() => (task ? installedPackages(catalog, task) : []), [catalog, task]);
  const chosen = packages.find((pkg) => pkg.id === modelId) ?? packages[0];

  if (!task) {
    return (
      <Panel title="Sound effects">
        <p className="text-sm text-ink-muted">Loading what this build can do.</p>
      </Panel>
    );
  }

  if (packages.length === 0) {
    return (
      <Panel
        title="Sound effects"
        description="A short sound written from a description of what happens."
      >
        <p className="text-sm text-ink-muted">
          No sound effect model is installed. Install Stable Audio 3 SFX on the Models page and
          it will appear here.
        </p>
      </Panel>
    );
  }

  const plain = task.fields.filter((field) => !field.advanced);
  const advanced = task.fields.filter((field) => field.advanced);
  const valueOf = (name: string) =>
    values[name] ?? (task.fields.find((field) => field.name === name)?.default?.toString() ?? '');

  const prompt = (values.prompt ?? '').trim();

  function submit() {
    if (!chosen || prompt === '') return;

    const params: Record<string, string | number> = {};
    for (const field of task!.fields) {
      const raw = valueOf(field.name).trim();
      if (raw === '') continue;
      params[field.name] = field.kind === 'number' ? Number(raw) : raw;
    }

    onSubmit(chosen.id, params);
    // The prompt is kept. Sound design is iterative, and retyping the whole
    // description to change one word in it is the wrong default.
  }

  return (
    <Panel
      title="Sound effects"
      description="A short sound written from a description of what happens."
    >
      <div className="flex flex-col gap-4">
        {plain.map((field) => (
          <PlainField
            key={field.name}
            field={field}
            value={valueOf(field.name)}
            onChange={(value) => setValues({ ...values, [field.name]: value })}
            placeholder="a heavy wooden door creaking open then slamming shut"
          />
        ))}

        {packages.length > 1 ? (
          <label className="flex items-center gap-2">
            <span className="shrink-0 text-xs font-medium text-ink-faint">Model</span>
            <select
              value={chosen?.id ?? ''}
              onChange={(event) => setModelId(event.target.value)}
              className="min-h-9 min-w-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink transition-colors duration-150 hover:border-line-strong"
            >
              {packages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {buildLabel(pkg, task.label)}
                  {pkg.recommended ? ' (recommended)' : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {advanced.length > 0 ? (
          <Disclosure summary="Advanced">
            <div className="flex flex-col gap-4 pt-2">
              {advanced.map((field) => (
                <PlainField
                  key={field.name}
                  field={field}
                  value={valueOf(field.name)}
                  onChange={(value) => setValues({ ...values, [field.name]: value })}
                />
              ))}
            </div>
          </Disclosure>
        ) : null}

        <Button
          variant="primary"
          className="self-start"
          busy={busy}
          disabled={prompt === ''}
          onClick={submit}
        >
          Make the sound
        </Button>
      </div>
    </Panel>
  );
}
