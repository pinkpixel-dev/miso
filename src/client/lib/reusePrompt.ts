import type { Job, StudioState } from '../../shared/types.ts';
import { EMPTY_STUDIO } from './studio.ts';

/**
 * Turning a finished job back into a form somebody can edit.
 *
 * Every job row is already a complete record of what made a take: the params
 * as the registry validated them, the song title, and the guided builder state
 * when the builder is what wrote it. Nothing here reads the database or the
 * service, because nothing needs to. This module only decides what the create
 * form should start from, which is why it is pure and tested on its own rather
 * than living inside the panel that renders it.
 */

/** Every field of the create form is held as text, whatever the task calls it. */
export type Values = Record<string, string>;

/** Which way into the form a job was written, and so which way it reopens. */
export type Mode = 'guided' | 'custom';

/** What the create form starts from when it is seeded by a past job. */
export interface Prefill {
  /** The recorded model, when it is still installed. */
  modelId: string | undefined;
  /**
   * The recorded model, when it is not installed any more.
   *
   * Set instead of `modelId` rather than beside it, so the form cannot seed a
   * model it cannot run. The settings still load and the form falls back to its
   * own default, and this is what the notice on screen names.
   */
  missingModelId: string | undefined;
  values: Values;
  title: string;
  builder: StudioState;
  mode: Mode;
}

/**
 * Text for a recorded param, or nothing when it is not something a box holds.
 *
 * Numbers come back as their decimal form because the form holds every field as
 * text. Anything else is dropped rather than coerced: a param that is an object
 * or an array has no sensible reading in a text box, and `String()` would put
 * `[object Object]` in one.
 */
function textValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * What the create form should start from to make another take like this one.
 *
 * The params are not filtered against the task's declared fields. The form only
 * reads the names its own task declares, so filtering here would mean passing a
 * task in for no change in what ends up on screen.
 *
 * `job.studio` is the record of which way in was used. It is documented on the
 * type as present when the guided builder wrote the job and absent when the
 * form did, so it decides the mode rather than anything having to guess from
 * the shape of the prompt.
 */
export function prefillFromJob(job: Job, installedModelIds: readonly string[]): Prefill {
  const values: Values = {};
  for (const [name, value] of Object.entries(job.params)) {
    const text = textValue(value);
    if (text !== undefined) values[name] = text;
  }

  const installed = installedModelIds.includes(job.modelId);

  return {
    modelId: installed ? job.modelId : undefined,
    missingModelId: installed ? undefined : job.modelId,
    values,
    title: job.title ?? '',
    builder: job.studio ?? EMPTY_STUDIO,
    mode: job.studio === undefined ? 'custom' : 'guided',
  };
}
