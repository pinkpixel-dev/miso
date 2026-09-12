import { findPackage } from '../catalog/registry.ts';

/**
 * What Miso can ask audio.cpp to do.
 *
 * One entry per task, and adding a model to an existing task is a data change
 * here rather than a new screen. Phase 4 ships the first entry,
 * generate.text2music, and phases 5 to 7 add the remix, stem, and finishing
 * routes beside it.
 *
 * Two vocabularies meet in this file and they are not the same. The vendored
 * specs describe a family's tasks in catalog words ("music", "edit"), while the
 * server model config wants a runtime task kind ("gen"). Sending a spec word to
 * /v1/models/load is rejected outright, which cost a phase 0 debugging session
 * recorded in DOCS/ERRORS.md. `serverTask` below is always the runtime kind.
 */

export type ParamValue = string | number;

export interface TaskParams {
  [key: string]: ParamValue | undefined;
}

export interface ParamField {
  name: string;
  label: string;
  kind: 'text' | 'lyrics' | 'number';
  required: boolean;
  /** Numbers only. Both ends are inclusive and enforced on the server. */
  min?: number;
  max?: number;
  step?: number;
  default?: ParamValue;
  /** One sentence shown under the field. */
  help?: string;
}

export interface TaskDefinition {
  id: string;
  label: string;
  /** The one line the studio shows under the task name. */
  summary: string;
  /** Spec family this task runs on, for example ace_step. */
  family: string;
  /** Runtime task kind for /v1/models/load, never the spec's task word. */
  serverTask: 'gen';
  /** The audio.cpp route inside that task kind. */
  route: string;
  /** Session options the model needs when it is loaded for this task. */
  sessionOptions: Record<string, string>;
  /**
   * Source audio this task reads, by role. Every role listed here is uploaded
   * to the backend before the task runs, and buildRequest receives the paths
   * the backend gave back. Empty for a task that generates from nothing.
   */
  inputRoles: string[];
  fields: ParamField[];
  /** Turns validated params into the request body audio.cpp expects. */
  buildRequest(params: TaskParams, staged: Record<string, string>): Record<string, unknown>;
}

/**
 * ACE-Step 1.5, text to music.
 *
 * mem_saver is on because a 16 GB card cannot hold ACE-Step twice: the Turbo Q8
 * package is 6.19 GB on disk and about 13.1 GB resident, and a second request
 * after a generation failed to allocate until mem_saver brought the resident
 * figure down to 530 MB. It is a requirement here rather than an option.
 */
const text2music: TaskDefinition = {
  id: 'generate.text2music',
  label: 'Generate a track',
  summary: 'Writes a new track from a prompt, with optional lyrics.',
  family: 'ace_step',
  serverTask: 'gen',
  route: 'text2music',
  sessionOptions: { 'ace_step.mem_saver': 'true' },
  inputRoles: [],
  fields: [
    {
      name: 'prompt',
      label: 'Prompt',
      kind: 'text',
      required: true,
      help: 'Describe the music: genre, mood, instruments, and the kind of vocal.',
    },
    {
      name: 'lyrics',
      label: 'Lyrics',
      kind: 'lyrics',
      required: false,
      help: 'Leave this empty for an instrumental.',
    },
    {
      name: 'durationSeconds',
      label: 'Length in seconds',
      kind: 'number',
      required: false,
      min: 5,
      max: 300,
      step: 5,
      default: 30,
    },
    {
      name: 'steps',
      label: 'Steps',
      kind: 'number',
      required: false,
      min: 1,
      max: 100,
      step: 1,
      default: 8,
      help: 'More steps take longer and change the result more than they improve it.',
    },
    {
      name: 'guidanceScale',
      label: 'Guidance',
      kind: 'number',
      required: false,
      min: 0,
      max: 20,
      step: 0.1,
      default: 1,
      help: 'How closely the model follows the prompt.',
    },
    {
      name: 'seed',
      label: 'Seed',
      kind: 'number',
      required: false,
      min: 0,
      max: 2_147_483_647,
      step: 1,
      help: 'Leave this empty for a different result every time.',
    },
  ],
  buildRequest(params) {
    // Field names are the CLI's, which is what /v1/tasks/run takes inside its
    // request object. Anything the person left empty is left out rather than
    // sent as null, so the model's own default applies.
    const request: Record<string, unknown> = {
      task_route: 'text2music',
      text: params.prompt,
    };

    if (params.lyrics !== undefined && params.lyrics !== '') request.lyrics = params.lyrics;
    if (params.durationSeconds !== undefined) request.duration_seconds = params.durationSeconds;
    if (params.steps !== undefined) request.num_inference_steps = params.steps;
    if (params.guidanceScale !== undefined) request.guidance_scale = params.guidanceScale;
    if (params.seed !== undefined) request.seed = params.seed;

    return request;
  },
};

const tasks = new Map<string, TaskDefinition>([[text2music.id, text2music]]);

export function listTasks(): TaskDefinition[] {
  return [...tasks.values()];
}

export function findTask(id: string): TaskDefinition | undefined {
  return tasks.get(id);
}

export type ParamResult =
  | { ok: true; value: TaskParams }
  | { ok: false; error: string };

/**
 * Checks submitted params against a task's fields.
 *
 * Unknown keys are dropped rather than refused. A client a version ahead of the
 * service sends a field this build does not know, and dropping it generates a
 * slightly plainer track where refusing generates nothing at all.
 */
export function validateParams(task: TaskDefinition, raw: unknown): ParamResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'Parameters must be an object' };
  }

  const input = raw as Record<string, unknown>;
  const value: TaskParams = {};

  for (const field of task.fields) {
    const given = input[field.name];

    if (given === undefined || given === null || given === '') {
      if (field.required) return { ok: false, error: `${field.label} is required` };
      if (field.default !== undefined) value[field.name] = field.default;
      continue;
    }

    if (field.kind === 'number') {
      const parsed = typeof given === 'number' ? given : Number(given);
      if (!Number.isFinite(parsed)) {
        return { ok: false, error: `${field.label} must be a number` };
      }
      if (field.min !== undefined && parsed < field.min) {
        return { ok: false, error: `${field.label} cannot be below ${field.min}` };
      }
      if (field.max !== undefined && parsed > field.max) {
        return { ok: false, error: `${field.label} cannot be above ${field.max}` };
      }
      value[field.name] = parsed;
      continue;
    }

    if (typeof given !== 'string') {
      return { ok: false, error: `${field.label} must be text` };
    }
    value[field.name] = given;
  }

  return { ok: true, value };
}

/** Whether a catalog package can run this task, which is a family match. */
export function packageRunsTask(task: TaskDefinition, packageId: string): boolean {
  return findPackage(packageId)?.spec.family === task.family;
}
