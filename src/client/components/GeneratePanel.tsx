import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Catalog, CatalogPackage, Job, StudioTask } from '../../shared/types.ts';
import { estimateSeconds } from '../lib/useJobs.ts';
import { Button, Field, Panel, TextArea } from './ui.tsx';

/**
 * The studio form: pick a task, pick a model, fill in the fields, generate.
 *
 * The fields are rendered from what the service says the task takes, not from a
 * layout written here. That is the point of the task registry: a new task
 * arrives as data and gets a working form without a new screen.
 *
 * The guided prompt builder, with its genre chips and tempo and vocal
 * controls, sits on top of this later in phase 4. This is the surface it
 * compiles into.
 */

type Values = Record<string, string>;

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
  }) => Promise<boolean>;
}) {
  const [taskId, setTaskId] = useState<string | undefined>();
  const [modelId, setModelId] = useState<string | undefined>();
  const [values, setValues] = useState<Values>({});
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

  const missing = task.fields.some(
    (field) => field.required && (fieldValues[field.name] ?? '').trim() === '',
  );

  const submit = async () => {
    if (!chosenModel) return;
    setSubmitting(true);

    const params: Record<string, string | number> = {};
    for (const field of task.fields) {
      const raw = (fieldValues[field.name] ?? '').trim();
      if (raw === '') continue;
      params[field.name] = field.kind === 'number' ? Number(raw) : raw;
    }

    const ok = await onSubmit({ taskId: task.id, modelId: chosenModel, params });
    setSubmitting(false);

    // The prompt stays on a success, because the next thing people do is change
    // one word and run it again. Only the queue tells them it worked.
    if (ok) return;
  };

  return (
    <Panel title="Generate" description={task.summary}>
      <div className="flex flex-col gap-5">
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
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink hover:border-line-strong"
            >
              {tasks.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {task.fields.map((field) =>
          field.kind === 'number' ? (
            <Field
              key={field.name}
              label={field.label}
              type="number"
              inputMode="decimal"
              min={field.min}
              max={field.max}
              step={field.step}
              hint={field.help}
              value={fieldValues[field.name] ?? ''}
              onChange={(event) =>
                setValues({ ...fieldValues, [field.name]: event.target.value })
              }
            />
          ) : (
            <TextArea
              key={field.name}
              label={field.label}
              rows={field.kind === 'lyrics' ? 8 : 3}
              hint={field.help}
              placeholder={
                field.kind === 'lyrics'
                  ? '[Verse]\nThe first line of the song'
                  : 'cinematic synth pop with clear vocals'
              }
              value={fieldValues[field.name] ?? ''}
              onChange={(event) =>
                setValues({ ...fieldValues, [field.name]: event.target.value })
              }
            />
          ),
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Model</span>
          <select
            value={chosenModel ?? ''}
            disabled={installed.length === 0}
            onChange={(event) => setModelId(event.target.value)}
            className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-45"
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
          >
            {submitting ? 'Queueing' : 'Generate'}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
