import type { SpecPackage } from '../catalog/parse.ts';

/**
 * The shape of a task, separate from the tasks themselves.
 *
 * This lives apart from `registry.ts` so a family module can describe its tasks
 * without importing the registry that collects them, which would be a cycle.
 *
 * Two vocabularies meet in these fields and they are not the same. The vendored
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
  /**
   * Whether this belongs behind the advanced drawer rather than on the form.
   *
   * The test is whether somebody writing a song has a reason to touch it. A
   * prompt and a length do. A sampler seed does, but only once something has
   * gone wrong or gone right and needs repeating.
   */
  advanced?: boolean;
}

export interface TaskDefinition {
  id: string;
  /**
   * What this task is called where it is offered, which is usually an
   * instruction: "Repaint a section".
   */
  label: string;
  /**
   * The same task named as a thing rather than an action: "Repaints".
   *
   * The project page groups takes under headings, and a heading that reads
   * "Repaint a section" tells the reader to do something when it is only naming
   * what is below it. Every entry carries both because the two places have
   * different grammar, not because the wording drifted.
   */
  shortLabel: string;
  /** The one line the studio shows under the task name. */
  summary: string;
  /** Spec family this task runs on, for example ace_step. */
  family: string;
  /** Runtime task kind for /v1/models/load, never the spec's task word. */
  serverTask: 'gen';
  /**
   * The audio.cpp route inside that task kind, for a family that has routes.
   *
   * ACE-Step is the only generation family that does. MiniMax Music 3,
   * HeartMuLa and Stable Audio are each reached as `--task gen --family X` with
   * no route at all, so they leave this out. Nothing reads this field. The
   * route that actually travels is written into the request by buildRequest.
   */
  route?: string;
  /**
   * Whether this family can sing.
   *
   * Declared here rather than read from the vendored spec, because the spec is
   * wrong about it. `stable_audio.json` tags `lyrics` under
   * `capabilities.music` with nothing behind it: no lyrics request option, and
   * no mention of lyrics, vocals or singing anywhere in its manual, while
   * ACE-Step's identical tag is backed by a documented `--lyrics` flag. See
   * DOCS/MEMORY.md.
   *
   * `required` means the family cannot do an instrumental, `never` means it
   * cannot do a vocal, and `both` means the choice is the person's.
   */
  vocals: 'both' | 'required' | 'never';
  /**
   * Session options the package needs when it is loaded for this task.
   *
   * A method taking the package rather than a flat record, because the answer
   * is not the same for every package of a family. ACE-Step wants one fixed
   * switch whatever the precision, while MiniMax Music 3 has to be told which
   * component GGUFs the installed package actually ships. Left out entirely by
   * a family that needs none, which sends no session_options at all.
   */
  sessionOptions?(pkg: SpecPackage): Record<string, string>;
  /**
   * Source audio this task reads, by role. Every role listed here is uploaded
   * to the backend before the task runs, and buildRequest receives the paths
   * the backend gave back. Empty for a task that generates from nothing.
   */
  inputRoles: string[];
  /**
   * Whether a package of this family can run this task, past the family match.
   *
   * Only Stable Audio needs one. Its family ships music packages and SFX
   * packages side by side, and an SFX package asked for music answers with the
   * wrong weights rather than failing, so it has to be kept off the list. Every
   * other family's packages are precisions of the same model, and leaving this
   * out accepts all of them.
   */
  acceptsPackage?(packageId: string): boolean;
  fields: ParamField[];
  /**
   * A check across several params at once, for what a single field cannot say.
   *
   * Field validation sees one value at a time, so it can hold a region
   * boundary inside a range but cannot see that the end lands before the
   * start. An inverted region is not a cosmetic problem: the job queues, loads
   * weights, holds the GPU for a minute, and then fails or returns something
   * meaningless. The editor will not produce one, and the API is still the API.
   *
   * Called only after every field has passed. Returns the sentence to refuse
   * with, or undefined when the combination is fine.
   */
  validate?(params: TaskParams): string | undefined;
  /** Turns validated params into the request body audio.cpp expects. */
  buildRequest(params: TaskParams, staged: Record<string, string>): Record<string, unknown>;
}
