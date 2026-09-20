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

/**
 * A runtime task kind for /v1/models/load, never a spec's task word.
 *
 * The backend accepts fourteen and lists them in the error when it is sent one
 * it does not know. These are the six Miso asks for.
 */
export type ServerTaskKind = 'gen' | 'sep' | 'vc' | 'svc' | 'tts' | 'midi';

export type ParamValue = string | number;

export interface TaskParams {
  [key: string]: ParamValue | undefined;
}

export interface ParamField {
  name: string;
  label: string;
  kind: 'text' | 'lyrics' | 'number' | 'choice';
  required: boolean;
  /** Numbers only. Both ends are inclusive and enforced on the server. */
  min?: number;
  max?: number;
  step?: number;
  /**
   * The only values a `choice` field accepts, in the order they are offered.
   *
   * Checked on the server as well as drawn in the browser, because RVC refuses
   * a voice it does not know with `unknown RVC voice id: x` after the job has
   * queued and the weights have loaded. A list this short is worth checking
   * before any of that happens.
   */
  values?: { value: string; label: string }[];
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
  /**
   * Spec families this task runs on, for example ace_step.
   *
   * A list because separation is one task over three families: HTDemucs,
   * BS-RoFormer and Mel-Band RoFormer all answer the same request and differ
   * only in what they return. Three entries in the tool list beside a take
   * would be three ways to do one thing. Every generation task names a single
   * family and reads exactly as it did before.
   */
  family: string | string[];
  /**
   * Runtime task kind for /v1/models/load, never the spec's task word.
   *
   * `sep` is separation, `vc` is voice conversion and `midi` is transcription.
   * Sending a spec word here is rejected outright, which cost a phase 0
   * debugging session recorded in DOCS/ERRORS.md.
   *
   * The backend accepts fourteen: vad, asr, diar, sep, gen, tts, clon, vc, s2s,
   * align, vdes, spk, svc and midi. It lists them in the error when you send
   * one it does not know, which is how that list was found on 2026-09-19. Only
   * the five Miso runs are here, because this union is what Miso uses rather
   * than what the server would accept.
   *
   * `svc` is singing voice conversion, and it is not `vc` with a different
   * name. Vevo2 registers separately under each, and the route names it
   * accepts differ: loading it as `vc` and then asking for
   * `style_preserved_svc` is refused.
   *
   * A function when one task reaches routes that live under different kinds.
   * `generate.sing` is the only one: Vevo2 puts `text_to_singing` under `tts`
   * and `humming_to_singing` under `svc`, and asking for the first under an
   * `svc` registration answers `Vevo2 route text_to_singing is not valid for
   * task svc`. It is given the staged inputs rather than the params, because
   * what decides the route there is whether a melody was handed over, and that
   * is an input.
   */
  serverTask: ServerTaskKind | ((staged: Record<string, string>) => ServerTaskKind);
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
   * What each role past `source` is called on screen, and one line on what it
   * is for.
   *
   * `source` needs no entry: every page that offers a task already opened on
   * the take it reads, so the source is what you came in on rather than
   * something to pick. A second role is different. Vevo2 is handed a vocal and
   * a voice to sing it in, and "voiceRef" is not a label.
   *
   * Kept beside the roles rather than in a map in the browser, because the task
   * is the thing that knows what it is asking for.
   */
  inputRoleLabels?: Record<string, { label: string; help: string }>;
  /**
   * Roles from `inputRoles` a job may leave out.
   *
   * Every other role is required, and the job route refuses a job missing one
   * before anything queues. `generate.sing` needs this because its melody is
   * the difference between two routes rather than between a valid request and
   * an invalid one: hand it a melody and it sings that, leave it out and it
   * makes its own.
   */
  optionalInputRoles?: string[];
  /**
   * The sample rate this task's source audio must arrive at.
   *
   * Separation refuses anything but 44.1 kHz before it starts any work, and
   * every take audio.cpp generates is 48 kHz, so something has to convert. The
   * task says what it needs and the worker honours it, rather than the worker
   * knowing which families are fussy.
   *
   * Left out by every task that takes the source as it is.
   */
  inputSampleRate?: number;
  /**
   * What a single output from this task is, when it is not an ordinary take.
   *
   * Voice conversion returns one track and that track is a stem: it is one
   * part of a song, it belongs beside the stems it was converted from, and the
   * mix route has to be able to pick it up. Left out by every task whose one
   * output is a take in its own right.
   *
   * Several outputs are stems whatever this says, which is what separation
   * relies on.
   */
  resultKind?: 'generated' | 'stem';
  /**
   * Whether the result has to be converted back to the rate its source came in
   * at.
   *
   * RVC answers at 40 kHz whatever it was given, and the stems it will sit
   * beside are 44.1 kHz. The mix route refuses a set whose rates disagree,
   * rather than summing them and playing one part at the wrong speed, so a
   * conversion that cannot be mixed with its own siblings is not much use.
   *
   * Converting once here, when the asset is written, is cheaper and easier to
   * explain than a mix that quietly resamples whatever it is handed.
   */
  matchesSourceSampleRate?: boolean;
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
  /**
   * A second package this task's family cannot run without.
   *
   * Only YuE2 has one. Its five packages are three models and two decoders,
   * and a working install needs one of each in the same directory. Without
   * this the Models screen would offer a model package that installs, sits on
   * disk at 4 GB, and fails at load with a message about a missing component.
   *
   * Left out by every family whose packages are precisions of one thing.
   */
  requiresPackage?: string;
  /**
   * Whether the guided prompt builder is offered for this task.
   *
   * The builder writes songs. It asks for a genre, a mood and a voice, and
   * compiles them into a caption the family understands. Stable Audio's SFX
   * task runs on a family the builder knows, so without this it would offer to
   * describe a door slam as dreamy lo-fi with female vocals.
   *
   * Left out by every task the builder suits, which is every song generator.
   */
  guidedPrompt?: boolean;
  /**
   * Where the studio offers this task, when `inputRoles` would put it in the
   * wrong place.
   *
   * By default a task with no input roles goes on the create form and a task
   * reading a source goes on the remix picker, which needs no declaration and
   * means a route added later lands somewhere sensible on its own. Sound
   * effects and transcription both go to the sound page instead: neither makes
   * a song, and transcription does not even make audio. Decided on 2026-09-19.
   */
  surface?: 'sound';
  /**
   * Silence to put in front of the source before the task sees it, in seconds.
   *
   * MuScriptor drops a note that starts at t=0. A probe of a synthesized scale
   * returned seven of its eight notes, and the same file with one second of
   * silence in front returned all eight. That matters most for a clip trimmed
   * in the workbench, where a cut lands exactly on an onset by design.
   *
   * The offset is taken back off the returned times, so what is stored lines up
   * with the source. Left out by every task that reads what it is given.
   */
  inputLeadInSeconds?: number;
  /**
   * What a finished job leaves behind, when it is not audio.
   *
   * Transcription writes a MIDI file and note events, which are not a take and
   * do not belong in the takes column. `storeResult` reads this to decide which
   * of the two storage paths a result takes.
   */
  produces?: 'artifact';
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
  /**
   * What to add to a source's name, so a derived take says what was done to it.
   *
   * A task with no prompt is named after what it read, which is right for
   * separation: four stems called after the song, each with its own part in
   * brackets. A conversion read one stem and hands back one track, so without
   * this it would be called exactly what its source is called and the two could
   * not be told apart in the library or in the deck.
   *
   * Returns undefined when there is nothing worth adding.
   */
  labelSuffix?(params: Record<string, unknown>): string | undefined;
  /** Turns validated params into the request body audio.cpp expects. */
  buildRequest(params: TaskParams, staged: Record<string, string>): Record<string, unknown>;
}
