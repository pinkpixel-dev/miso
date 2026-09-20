import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Asset, Catalog, Job, StudioTask } from '../../../shared/types.ts';
import { buildLabel, installedPackages } from '../../lib/models.ts';
import type { Region } from '../../lib/region.ts';
import { extraInputRoles, REGION_FIELDS } from '../../lib/remixTasks.ts';
import { estimateSeconds } from '../../lib/useJobs.ts';
import { BuilderCard } from '../BuilderCard.tsx';
import { PlainField } from '../TaskFields.tsx';
import { Button } from '../ui.tsx';

/**
 * The fields for whichever remix tool is in force, and the button that queues
 * it.
 *
 * Everything shown here comes from the task definition. The page drives several
 * tools now and they disagree about almost everything: repaint takes a region
 * and treats its prompt as a nudge, while a cover takes no region and follows
 * its prompt closely. Copy written for one of them is wrong on the others, so
 * the labels, the help and the button all read from the registry, which is
 * where the measurements that justify them are recorded.
 *
 * The fields are rendered plainly, the way custom mode does in the create
 * column. There is no guided builder here on purpose. The builder compiles a
 * description of a song, and these tasks take an instruction about an existing
 * one. Those are different sentences and the compiler writes the wrong one.
 *
 * That also sidesteps a trap. `supportsGuided` keys on the model family, and
 * every task here is ACE-Step, so a shared panel would offer the guided switch
 * and quietly compile a song description over an edit instruction.
 */

type Values = Record<string, string>;

function initialValues(task: StudioTask): Values {
  const values: Values = {};
  for (const field of task.fields) {
    if (REGION_FIELDS.has(field.name)) continue;
    values[field.name] = field.default === undefined ? '' : String(field.default);
  }
  return values;
}

function describeEstimate(seconds: number | undefined): string {
  if (seconds === undefined) return 'The first run also loads the model, so it takes longer.';
  if (seconds < 90) return `Past runs of this took about ${seconds} seconds.`;
  return `Past runs of this took about ${Math.round(seconds / 60)} minutes.`;
}

export function RemixForm({
  task,
  asset,
  assets,
  region,
  catalog,
  jobs,
  onSubmit,
}: {
  task: StudioTask;
  asset: Asset;
  /**
   * Every track in this project, for a task that reads a second one.
   *
   * Only `extraInputRoles` tasks touch this. The source is the take the page
   * opened on and is never picked here.
   */
  assets: Asset[];
  /**
   * The editor's current region. Only read for a task that asks for one: the
   * loop below writes it into the params by field name, so a task without
   * those fields never sees it.
   */
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
  /**
   * The track chosen for each role past the source, by role name.
   *
   * Seeded empty rather than with the first candidate. A voice to copy is the
   * whole point of the run, and defaulting it would let somebody queue a
   * conversion into whichever track happened to sort first.
   */
  const [roleAssets, setRoleAssets] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [queued, setQueued] = useState(false);

  const chosen = packages.find((pkg) => pkg.id === modelId) ?? packages[0];

  const plainFields = task.fields.filter(
    (field) => !field.advanced && !REGION_FIELDS.has(field.name),
  );
  const advancedFields = task.fields.filter(
    (field) => field.advanced && !REGION_FIELDS.has(field.name),
  );

  const extraRoles = extraInputRoles(task);
  // Anything but the take being worked on. Converting a vocal into its own
  // voice is a long way to round-trip a file.
  const candidates = assets.filter((entry) => entry.id !== asset.id);

  const missingField = task.fields.some((field) => {
    if (!field.required || REGION_FIELDS.has(field.name)) return false;
    return (values[field.name] ?? '').trim() === '';
  });
  const missingRole = extraRoles.some((role) => (roleAssets[role] ?? '') === '');
  const missing = missingField || missingRole;

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
      //
      // Driven by the task's own fields, so a tool with no region simply never
      // reaches these branches and the editor's numbers are not sent.
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
      inputs: [
        { assetId: asset.id, role: 'source' },
        ...extraRoles.map((role) => ({ assetId: roleAssets[role] ?? '', role })),
      ],
    });

    setSubmitting(false);
    // The form stays as it is on success, because the next thing people do is
    // change something slightly and run it again. The queue says it worked.
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

      {/*
        A picker per role past the source, labelled by the task rather than by
        this file. Drawn above the fields because it is an input rather than a
        setting: the run is "this take, in that voice", and the voice belongs
        next to the model it is handed to.
      */}
      {extraRoles.map((role) => {
        const copy = task.inputRoleLabels?.[role];
        const helpId = `remix-role-${role}-help`;
        return (
          <div key={role} className="flex flex-col gap-1.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">{copy?.label ?? role}</span>
              <select
                value={roleAssets[role] ?? ''}
                disabled={candidates.length === 0}
                aria-describedby={copy?.help ? helpId : undefined}
                onChange={(event) => {
                  setRoleAssets({ ...roleAssets, [role]: event.target.value });
                  setQueued(false);
                }}
                className="min-h-9 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink transition-colors duration-150 hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-45"
              >
                <option value="">
                  {candidates.length === 0 ? 'No other track in this project' : 'Choose a track'}
                </option>
                {candidates.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            {copy?.help ? (
              <p id={helpId} className="text-xs text-ink-faint">
                {copy.help}
              </p>
            ) : null}
          </div>
        );
      })}

      <div className="flex flex-col gap-5">
        {plainFields.map((field) => (
          <PlainField
            key={field.name}
            field={field}
            value={values[field.name] ?? ''}
            onChange={(value) => setValue(field.name, value)}
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
              These tools repeat exactly for the same seed, so setting one is how a result you
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
          No model that can run this is installed.{' '}
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

      {/*
        The task's own name, so the button says what it is about to do rather
        than naming one tool on every tool's form.
      */}
      <Button
        variant="primary"
        onClick={() => void submit()}
        busy={submitting}
        disabled={missing || !chosen}
        className="min-h-11 w-full"
      >
        {submitting ? 'Queueing' : task.label}
      </Button>
    </div>
  );
}
