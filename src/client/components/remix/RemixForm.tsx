import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Asset, Catalog, Job, StudioTask } from '../../../shared/types.ts';
import { buildLabel, installedPackages } from '../../lib/models.ts';
import type { Region } from '../../lib/region.ts';
import { estimateSeconds } from '../../lib/useJobs.ts';
import { BuilderCard } from '../BuilderCard.tsx';
import { PlainField } from '../TaskFields.tsx';
import { Button } from '../ui.tsx';

/**
 * What to put in the selected region, and the button that queues it.
 *
 * The fields are rendered plainly, the way custom mode does in the create
 * column. There is no guided builder here on purpose. The builder compiles a
 * description of a song, and a repaint takes an instruction about one section,
 * for example "replace the middle with a brighter chorus". Those are different
 * sentences and the compiler writes the wrong one.
 *
 * That also sidesteps a trap. `supportsGuided` keys on the model family, and
 * this task is ACE-Step, so a shared panel would offer the guided switch and
 * quietly compile a song description over an edit instruction.
 */

/** The editor owns these, so the form must not draw boxes for them too. */
const OWNED_BY_EDITOR = new Set(['regionStart', 'regionEnd']);

type Values = Record<string, string>;

function initialValues(task: StudioTask): Values {
  const values: Values = {};
  for (const field of task.fields) {
    if (OWNED_BY_EDITOR.has(field.name)) continue;
    values[field.name] = field.default === undefined ? '' : String(field.default);
  }
  return values;
}

function describeEstimate(seconds: number | undefined): string {
  if (seconds === undefined) return 'The first run also loads the model, so it takes longer.';
  if (seconds < 90) return `Past repaints took about ${seconds} seconds.`;
  return `Past repaints took about ${Math.round(seconds / 60)} minutes.`;
}

export function RemixForm({
  task,
  asset,
  region,
  catalog,
  jobs,
  onSubmit,
}: {
  task: StudioTask;
  asset: Asset;
  region: Region;
  catalog: Catalog | undefined;
  jobs: Job[];
  onSubmit: (body: {
    taskId: string;
    modelId: string;
    params: Record<string, string | number>;
    inputs: { assetId: string; role: string }[];
  }) => Promise<boolean>;
}) {
  const packages = useMemo(() => installedPackages(catalog, task), [catalog, task]);
  const [modelId, setModelId] = useState<string | undefined>();
  const [values, setValues] = useState<Values>(() => initialValues(task));
  const [submitting, setSubmitting] = useState(false);
  const [queued, setQueued] = useState(false);

  const chosen = packages.find((pkg) => pkg.id === modelId) ?? packages[0];

  const plainFields = task.fields.filter(
    (field) => !field.advanced && !OWNED_BY_EDITOR.has(field.name),
  );
  const advancedFields = task.fields.filter(
    (field) => field.advanced && !OWNED_BY_EDITOR.has(field.name),
  );

  const missing = task.fields.some((field) => {
    if (!field.required || OWNED_BY_EDITOR.has(field.name)) return false;
    return (values[field.name] ?? '').trim() === '';
  });

  const setValue = (name: string, value: string) => {
    setValues({ ...values, [name]: value });
    setQueued(false);
  };

  async function submit() {
    if (!chosen) return;
    setSubmitting(true);

    const params: Record<string, string | number> = {};
    for (const field of task.fields) {
      // The region comes from the editor rather than a box, but it travels as
      // an ordinary parameter. That is what makes a take able to say it came
      // from repainting seconds 32 to 48, with no new storage anywhere.
      if (field.name === 'regionStart') {
        params.regionStart = region.start;
        continue;
      }
      if (field.name === 'regionEnd') {
        params.regionEnd = region.end;
        continue;
      }

      const raw = (values[field.name] ?? '').trim();
      if (raw === '') continue;
      params[field.name] = field.kind === 'number' ? Number(raw) : raw;
    }

    const ok = await onSubmit({
      taskId: task.id,
      modelId: chosen.id,
      params,
      inputs: [{ assetId: asset.id, role: 'source' }],
    });

    setSubmitting(false);
    // The form stays as it is on success, because the next thing people do is
    // move the region slightly and run it again. The queue says it worked.
    setQueued(ok);
  }

  return (
    <div className="flex flex-col gap-5">
      <label className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="shrink-0 text-sm font-medium text-ink">Model</span>
        <select
          value={chosen?.id ?? ''}
          disabled={packages.length === 0}
          onChange={(event) => setModelId(event.target.value)}
          className="min-h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink transition-colors duration-150 hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-45"
        >
          {packages.length === 0 ? (
            <option value="">No model installed</option>
          ) : (
            packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {buildLabel(pkg, task.label)}
                {pkg.recommended ? ' (recommended)' : ''}
              </option>
            ))
          )}
        </select>
      </label>

      <p className="-mt-3 text-xs text-ink-faint">
        {describeEstimate(chosen ? estimateSeconds(jobs, task.id, chosen.id) : undefined)}
      </p>

      <div className="flex flex-col gap-5">
        {plainFields.map((field) => (
          <PlainField
            key={field.name}
            field={field}
            value={values[field.name] ?? ''}
            onChange={(value) => setValue(field.name, value)}
            placeholder="a brighter chorus with a piano lead"
          />
        ))}
      </div>

      {advancedFields.length > 0 ? (
        <BuilderCard
          id="remix-advanced"
          title={`Advanced options (${advancedFields.length})`}
          defaultOpen={false}
        >
          <div className="flex flex-col gap-5">
            <p className="text-sm text-ink-faint">
              A repaint repeats exactly for the same seed, so setting one is how a section you
              liked comes back.
            </p>
            {advancedFields.map((field) => (
              <PlainField
                key={field.name}
                field={field}
                value={values[field.name] ?? ''}
                onChange={(value) => setValue(field.name, value)}
              />
            ))}
          </div>
        </BuilderCard>
      ) : null}

      {packages.length === 0 ? (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink">
          No model that can repaint is installed.{' '}
          <Link to="/models" className="text-accent underline underline-offset-4 hover:no-underline">
            Install one on the Models screen
          </Link>
          .
        </p>
      ) : null}

      {queued ? (
        <p role="status" className="rounded-md border border-good/40 bg-good/10 px-3 py-2 text-sm text-ink">
          Queued. The new take appears in this project when it finishes, and the original is left
          as it was.
        </p>
      ) : null}

      <Button
        variant="primary"
        onClick={() => void submit()}
        busy={submitting}
        disabled={missing || !chosen}
        className="min-h-11 w-full"
      >
        {submitting ? 'Queueing' : 'Repaint the region'}
      </Button>
    </div>
  );
}
