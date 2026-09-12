import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  Catalog,
  CatalogPackage,
  Job,
  StudioState,
  StudioTask,
  TaskField,
} from '../../shared/types.ts';
import { EMPTY_STUDIO, compilePrompt, supportsGuided, wantsLyrics } from '../lib/studio.ts';
import { estimateSeconds } from '../lib/useJobs.ts';
import { Disclosure } from './Disclosure.tsx';
import { LyricsEditor } from './LyricsEditor.tsx';
import { PromptBuilder } from './PromptBuilder.tsx';
import { Button, Field, Panel, SegmentedControl, TextArea } from './ui.tsx';

/**
 * The studio form.
 *
 * There are two ways in and they write the same job. Guided mode collects
 * chips and toggles and compiles them into the prompt. Custom mode is the
 * fields the task declares, rendered as they come, for when the prompt is
 * already in somebody's head and the chips are in the way.
 *
 * The fields themselves still come from what the service says the task takes,
 * in both modes. That is the point of the task registry: a new task arrives as
 * data and gets a working form without a new screen. What guided mode adds on
 * top is the compiler, which knows one family so far.
 */

type Values = Record<string, string>;
type Mode = 'guided' | 'custom';

const MODES: { value: Mode; label: string }[] = [
  { value: 'guided', label: 'Guided' },
  { value: 'custom', label: 'Custom' },
];

/** Fields guided mode draws itself, so the plain renderer must not draw them again. */
const BUILT_BY_GUIDED = new Set(['prompt', 'lyrics', 'bpm', 'keyscale']);

function initialValues(task: StudioTask): Values {
  const values: Values = {};
  for (const field of task.fields) {
    values[field.name] = field.default === undefined ? '' : String(field.default);
  }
  return values;
}

/** Installed packages of this task's family, recommended first. */
function packagesFor(catalog: Catalog | undefined, task: StudioTask): CatalogPackage[] {
  const family = catalog?.families.find((entry) => entry.family === task.family);
  if (!family) return [];
  return [...family.packages].sort((a, b) => Number(b.recommended) - Number(a.recommended));
}

function describeEstimate(seconds: number | undefined): string {
  if (seconds === undefined) return 'The first run also loads the model, so it takes longer.';
  if (seconds < 90) return `Past runs took about ${seconds} seconds.`;
  return `Past runs took about ${Math.round(seconds / 60)} minutes.`;
}

/** One task field, drawn the way its kind asks to be drawn. */
function PlainField({
  field,
  value,
  onChange,
}: {
  field: TaskField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.kind === 'number') {
    return (
      <Field
        label={field.label}
        type="number"
        inputMode="decimal"
        min={field.min}
        max={field.max}
        step={field.step}
        hint={field.help}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (field.kind === 'lyrics') {
    return <LyricsEditor label={field.label} hint={field.help} value={value} onChange={onChange} />;
  }

  return (
    <TextArea
      label={field.label}
      rows={3}
      hint={field.help}
      placeholder="cinematic synth pop with clear vocals"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function GeneratePanel({
  tasks,
  jobs,
  catalog,
  catalogLoading,
  onSubmit,
}: {
  tasks: StudioTask[];
  jobs: Job[];
  catalog: Catalog | undefined;
  catalogLoading: boolean;
  onSubmit: (body: {
    taskId: string;
    modelId: string;
    params: Record<string, string | number>;
    title?: string;
    studio?: StudioState;
  }) => Promise<boolean>;
}) {
  const [taskId, setTaskId] = useState<string | undefined>();
  const [modelId, setModelId] = useState<string | undefined>();
  const [values, setValues] = useState<Values>({});
  const [title, setTitle] = useState('');
  const [builder, setBuilder] = useState<StudioState>(EMPTY_STUDIO);
  const [mode, setMode] = useState<Mode>('guided');
  const [submitting, setSubmitting] = useState(false);

  const task = tasks.find((entry) => entry.id === taskId) ?? tasks[0];
  const packages = useMemo(() => (task ? packagesFor(catalog, task) : []), [catalog, task]);
  const installed = packages.filter((entry) => entry.installed);

  const chosenModel = modelId ?? installed[0]?.id;
  const fieldValues = Object.keys(values).length > 0 || !task ? values : initialValues(task);

  if (!task) {
    return (
      <Panel title="Generate">
        <p className="text-sm text-ink-muted">Loading what this build can do.</p>
      </Panel>
    );
  }

  // A family with no compilation rules has no guided mode to offer, so the
  // switch disappears rather than sitting there doing nothing.
  const guidedAvailable = supportsGuided(task.family);
  const guided = guidedAvailable && mode === 'guided';

  const setValue = (name: string, value: string) =>
    setValues({ ...fieldValues, [name]: value });

  const prompt = guided ? compilePrompt(builder) : (fieldValues.prompt ?? '').trim();
  const instrumental = guided && !wantsLyrics(builder);

  const plainFields = task.fields.filter(
    (field) => !field.advanced && !(guided && BUILT_BY_GUIDED.has(field.name)),
  );
  const advancedFields = task.fields.filter((field) => field.advanced);

  const missing = task.fields.some((field) => {
    if (!field.required) return false;
    if (guided && field.name === 'prompt') return prompt === '';
    return (fieldValues[field.name] ?? '').trim() === '';
  });

  const submit = async () => {
    if (!chosenModel) return;
    setSubmitting(true);

    const params: Record<string, string | number> = {};
    for (const field of task.fields) {
      // The compiled prompt is the prompt in guided mode, and the lyrics box
      // is off while the vocals are instrumental, so what is in it is kept for
      // later rather than sent now.
      if (guided && field.name === 'prompt') {
        if (prompt !== '') params.prompt = prompt;
        continue;
      }
      if (instrumental && field.kind === 'lyrics') continue;

      const raw = (fieldValues[field.name] ?? '').trim();
      if (raw === '') continue;
      params[field.name] = field.kind === 'number' ? Number(raw) : raw;
    }

    const ok = await onSubmit({
      taskId: task.id,
      modelId: chosenModel,
      params,
      title: title.trim() === '' ? undefined : title.trim(),
      studio: guided ? builder : undefined,
    });
    setSubmitting(false);

    // The form stays on a success, because the next thing people do is change
    // one word and run it again. Only the queue tells them it worked.
    if (ok) return;
  };

  return (
    <Panel title="Generate" description={task.summary}>
      <div className="flex flex-col gap-6">
        {tasks.length > 1 ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Task</span>
            <select
              value={task.id}
              onChange={(event) => {
                setTaskId(event.target.value);
                setValues({});
                setModelId(undefined);
              }}
              className="min-h-11 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink hover:border-line-strong"
            >
              {tasks.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <Field
          label="Song title"
          placeholder="Midnight Drive"
          hint="What the take is called in your library. Not sent to the model."
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />

        {guidedAvailable ? (
          <SegmentedControl
            label="How to write the prompt"
            name="prompt-mode"
            options={MODES}
            value={mode}
            onChange={(next) => {
              // Custom mode opens on whatever guided mode had built, so the
              // switch is a handover rather than a blank page. What is already
              // in the box wins, because that was typed.
              if (next === 'custom' && (fieldValues.prompt ?? '').trim() === '' && prompt !== '') {
                setValues({ ...fieldValues, prompt });
              }
              setMode(next);
            }}
            hint={
              mode === 'guided'
                ? 'Pick the pieces and Miso writes the prompt.'
                : 'Write the prompt yourself, exactly as the model receives it.'
            }
          />
        ) : null}

        {guided ? (
          <PromptBuilder
            task={task}
            builder={builder}
            onBuilder={setBuilder}
            values={fieldValues}
            onValue={setValue}
          />
        ) : null}

        {plainFields.map((field) => (
          <PlainField
            key={field.name}
            field={field}
            value={fieldValues[field.name] ?? ''}
            onChange={(value) => setValue(field.name, value)}
          />
        ))}

        {advancedFields.length > 0 ? (
          <Disclosure
            summary={`Advanced options (${advancedFields.length})`}
          >
            <div className="flex flex-col gap-5 border-l border-line pl-4">
              <p className="text-sm text-ink-faint">
                Left alone these use the model's own defaults. A seed is worth setting when a
                take came out right and you want it again.
              </p>
              {advancedFields.map((field) => (
                <PlainField
                  key={field.name}
                  field={field}
                  value={fieldValues[field.name] ?? ''}
                  onChange={(value) => setValue(field.name, value)}
                />
              ))}
            </div>
          </Disclosure>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Model</span>
          <select
            value={chosenModel ?? ''}
            disabled={installed.length === 0}
            onChange={(event) => setModelId(event.target.value)}
            className="min-h-11 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-45"
          >
            {installed.length === 0 ? (
              <option value="">No model installed</option>
            ) : (
              installed.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                  {entry.recommended ? ' (recommended)' : ''}
                </option>
              ))
            )}
          </select>
          <span className="text-sm text-ink-faint">
            {describeEstimate(chosenModel ? estimateSeconds(jobs, task.id, chosenModel) : undefined)}
          </span>
        </label>

        {installed.length === 0 && !catalogLoading ? (
          <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink">
            {task.label} needs a {task.family.replace('_', ' ')} model, and none is installed.{' '}
            <Link to="/models" className="text-accent underline underline-offset-4 hover:no-underline">
              Install one on the Models screen
            </Link>
            .
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={() => void submit()}
            busy={submitting}
            disabled={missing || !chosenModel}
            className="min-h-11"
          >
            {submitting ? 'Queueing' : 'Generate'}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
