import { findPackage, loadSpecs } from '../catalog/registry.ts';
import type { SpecPackage } from '../catalog/parse.ts';

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
  label: string;
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
  label: 'ACE-Step 1.5',
  summary: 'Writes a new track from a prompt, with optional lyrics.',
  family: 'ace_step',
  serverTask: 'gen',
  route: 'text2music',
  vocals: 'both',
  sessionOptions: () => ({ 'ace_step.mem_saver': 'true' }),
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
      default: 180,
      help: 'Three minutes by default, which is a song. Generation time scales with this.',
    },
    {
      name: 'bpm',
      label: 'Tempo in BPM',
      kind: 'number',
      required: false,
      min: 40,
      max: 220,
      step: 1,
      help: 'Leave this empty and the model picks a tempo to suit the prompt.',
    },
    {
      name: 'keyscale',
      label: 'Key',
      kind: 'text',
      required: false,
      help: 'For example C major or A minor. Empty lets the model choose.',
    },
    {
      name: 'negativePrompt',
      label: 'Negative prompt',
      kind: 'text',
      required: false,
      advanced: true,
      help: 'What to keep out of the track, such as distorted vocals or crowd noise.',
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
      advanced: true,
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
      advanced: true,
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
      advanced: true,
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

    // bpm, keyscale, and negative_prompt are request options on the CLI and
    // plain fields of the same request object over HTTP. Left out rather than
    // sent empty: unset means the planner chooses the tempo and the key, which
    // is not the same instruction as being told to use nothing.
    if (params.bpm !== undefined) request.bpm = params.bpm;
    if (params.keyscale !== undefined && params.keyscale !== '') request.keyscale = params.keyscale;
    if (params.negativePrompt !== undefined && params.negativePrompt !== '') {
      request.negative_prompt = params.negativePrompt;
    }

    return request;
  },
};

/**
 * MiniMax Music 3, a production caption plus lyrics.
 *
 * No task_route, because the family has no routes. The request is the caption
 * and its options, which is true of every generation family except ACE-Step.
 *
 * `duration_sec` is an autoregressive frame budget rather than a final length,
 * and raising it raises VRAM. Its help text says budget for that reason.
 *
 * `vocals` is 'required', which the server settled rather than the spec. The
 * vendored spec marks lyrics required, but every field left out of
 * /v1/tasks/run gets a default, so an instrumental might still have worked. It
 * does not: a job sent without lyrics came back refused, in those words.
 *
 *     MiniMax Music 3 requires lyrics
 *
 * 'required' locks the studio's vocal control off Instrumental and says why,
 * which is the same machinery Stable Audio uses to lock the other way.
 */
const minimax: TaskDefinition = {
  id: 'generate.minimax',
  label: 'MiniMax Music 3',
  summary: 'Writes a track from a production caption and tagged lyrics.',
  family: 'minimax_music3',
  serverTask: 'gen',
  vocals: 'required',
  /**
   * Which component GGUFs to load, read off the package that is installed.
   *
   * This family ships its language model, depth decoder and flow transformer as
   * separate files, and their precisions differ per package. The backend's own
   * defaults name one fixed set (language_model_q4_0, rvq_depth_decoder_bf16,
   * transformer_q4_0) that no package ships in full: q4_0 carries a q8_0 depth
   * decoder, and q8_0 and bf16 carry none of the three. Loading without these
   * therefore named a file that was not on disk and answered HTTP 500 before
   * the registration was ever created. See DOCS/ERRORS.md.
   *
   * Reading the filenames from the spec rather than writing them here means a
   * package added upstream loads without another edit to this file.
   */
  sessionOptions(pkg) {
    const component = (prefix: string): string | undefined =>
      pkg.files
        .map((file) => file.slice(file.lastIndexOf('/') + 1))
        .find((name) => name.startsWith(prefix) && name.endsWith('.gguf'));

    const components: [prefix: string, option: string][] = [
      ['language_model_', 'minimax_music3.language_model_gguf'],
      ['rvq_depth_decoder_', 'minimax_music3.rvq_depth_decoder_gguf'],
      ['transformer_', 'minimax_music3.flow_transformer_gguf'],
    ];

    const options: Record<string, string> = {};
    for (const [prefix, option] of components) {
      const file = component(prefix);
      // A component this package does not ship is left to the backend's default
      // rather than sent empty, which it would try to open as a filename.
      if (file !== undefined) options[option] = file;
    }

    return options;
  },
  inputRoles: [],
  fields: [
    {
      name: 'prompt',
      label: 'Prompt',
      kind: 'text',
      required: true,
      help: 'A production caption: the genre, the instruments, the voice, and how it was recorded.',
    },
    {
      name: 'lyrics',
      label: 'Lyrics',
      kind: 'lyrics',
      required: false,
      help: 'Section tags such as [verse] and [chorus] are read by this model.',
    },
    {
      name: 'durationSeconds',
      label: 'Length in seconds',
      kind: 'number',
      required: false,
      min: 5,
      max: 300,
      step: 5,
      default: 120,
      help: 'A budget rather than an exact length. Raising it also raises video memory use.',
    },
    {
      name: 'steps',
      label: 'Steps',
      kind: 'number',
      required: false,
      min: 1,
      max: 100,
      step: 1,
      default: 30,
      advanced: true,
      help: 'Flow matching steps per chunk.',
    },
    {
      name: 'guidanceScale',
      label: 'Guidance',
      kind: 'number',
      required: false,
      min: 0,
      max: 20,
      step: 0.1,
      default: 1.7,
      advanced: true,
      help: 'How closely the flow transformer follows the caption.',
    },
    {
      name: 'arGuidanceScale',
      label: 'Semantic guidance',
      kind: 'number',
      required: false,
      min: 0,
      max: 20,
      step: 0.1,
      default: 1.5,
      advanced: true,
      help: 'Guidance for the autoregressive stage, which decides the structure.',
    },
    {
      name: 'topK',
      label: 'Top K',
      kind: 'number',
      required: false,
      min: 1,
      max: 1000,
      step: 1,
      advanced: true,
      help: 'How many candidates each sampled token chooses between.',
    },
    {
      name: 'seed',
      label: 'Seed',
      kind: 'number',
      required: false,
      min: 0,
      max: 2_147_483_647,
      step: 1,
      advanced: true,
      help: 'Leave this empty for a different result every time.',
    },
  ],
  buildRequest(params) {
    const request: Record<string, unknown> = { text: params.prompt };

    if (params.lyrics !== undefined && params.lyrics !== '') request.lyrics = params.lyrics;
    // duration_seconds, the same name every other family takes. `duration_sec`
    // is the spelling the CLI's --request-option uses, and it is not the field
    // the HTTP request object reads: sending it left this model on its own 20
    // second default while the length asked for was ignored. Confirmed against
    // a live server, 45 seconds asked and 44.93 delivered. See DOCS/ERRORS.md.
    if (params.durationSeconds !== undefined) request.duration_seconds = params.durationSeconds;
    if (params.steps !== undefined) request.num_inference_steps = params.steps;
    if (params.guidanceScale !== undefined) request.guidance_scale = params.guidanceScale;
    if (params.arGuidanceScale !== undefined) request.ar_guidance_scale = params.arGuidanceScale;
    if (params.topK !== undefined) request.top_k = params.topK;
    if (params.seed !== undefined) request.seed = params.seed;

    return request;
  },
};

/**
 * HeartMuLa, lyrics and tags to music.
 *
 * `tags` is required by the CLI manual and carries what the other families put
 * in the prompt: genre, mood, tempo, and the kind of voice. The guided builder
 * compiles it, so it is only typed by hand in custom mode.
 *
 * infinite_mode is deliberately absent. It is a boolean, ParamField has no
 * boolean kind, and adding one for a single option on a single family is more
 * machinery than the option is worth until something else needs it.
 */
const heartmula: TaskDefinition = {
  id: 'generate.heartmula',
  label: 'HeartMuLa',
  summary: 'Writes a track from lyrics and a list of style tags.',
  family: 'heartmula',
  serverTask: 'gen',
  vocals: 'both',
  inputRoles: [],
  fields: [
    {
      name: 'prompt',
      label: 'Prompt',
      kind: 'text',
      required: true,
      help: 'A short description of the song. The detail goes in the tags below.',
    },
    {
      name: 'tags',
      label: 'Tags',
      kind: 'text',
      required: true,
      help: 'Comma separated: genre, mood, instruments, tempo, and the voice. For example pop, bright, drums, female vocal.',
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
      default: 120,
      help: 'The longest the track will run. Generation time scales with it.',
    },
    {
      name: 'steps',
      label: 'Steps',
      kind: 'number',
      required: false,
      min: 1,
      max: 100,
      step: 1,
      default: 10,
      advanced: true,
      help: 'Solver steps for the codec that turns tokens back into audio.',
    },
    {
      name: 'guidanceScale',
      label: 'Guidance',
      kind: 'number',
      required: false,
      min: 0,
      max: 20,
      step: 0.1,
      default: 1.5,
      advanced: true,
      help: 'How closely the model follows the prompt and the tags.',
    },
    {
      name: 'temperature',
      label: 'Temperature',
      kind: 'number',
      required: false,
      min: 0.1,
      max: 4,
      step: 0.1,
      default: 1,
      advanced: true,
      help: 'Higher wanders further from the obvious choice.',
    },
    {
      name: 'topK',
      label: 'Top K',
      kind: 'number',
      required: false,
      min: 1,
      max: 1000,
      step: 1,
      default: 50,
      advanced: true,
      help: 'How many candidates each sampled token chooses between.',
    },
    {
      name: 'seed',
      label: 'Seed',
      kind: 'number',
      required: false,
      min: 0,
      max: 2_147_483_647,
      step: 1,
      advanced: true,
      help: 'Leave this empty for a different result every time.',
    },
  ],
  buildRequest(params) {
    const request: Record<string, unknown> = { text: params.prompt };

    if (params.tags !== undefined && params.tags !== '') request.tags = params.tags;
    if (params.lyrics !== undefined && params.lyrics !== '') request.lyrics = params.lyrics;
    // duration_seconds rather than the CLI's duration_sec, for the reason
    // written against MiniMax above. This family was sending the same wrong
    // name and would have been capped the same way.
    if (params.durationSeconds !== undefined) request.duration_seconds = params.durationSeconds;
    if (params.steps !== undefined) request.num_inference_steps = params.steps;
    if (params.guidanceScale !== undefined) request.guidance_scale = params.guidanceScale;
    if (params.temperature !== undefined) request.temperature = params.temperature;
    if (params.topK !== undefined) request.top_k = params.topK;
    if (params.seed !== undefined) request.seed = params.seed;

    return request;
  },
};

/**
 * Stable Audio 3, text to music.
 *
 * There is no lyrics field, because this family does not sing. Its manual never
 * mentions lyrics, vocals or singing, and it has no lyrics option, despite its
 * vendored spec tagging `lyrics` under capabilities. That contradiction is why
 * `vocals` is declared here rather than read from the spec. See DOCS/MEMORY.md.
 *
 * Init-audio and inpainting are the same family reached with source audio, and
 * they belong to the remix phase rather than to this entry.
 */
const stableAudio: TaskDefinition = {
  id: 'generate.stableaudio',
  label: 'Stable Audio 3',
  summary: 'Writes an instrumental track from a description of the sound.',
  family: 'stable_audio',
  serverTask: 'gen',
  vocals: 'never',
  inputRoles: [],
  // The SFX packages belong to generate.sfx in phase 7. Offered here they would
  // look like another precision of the music model and quietly produce a sound
  // effect instead of a track.
  acceptsPackage: (packageId) => !packageId.includes('_sfx_'),
  fields: [
    {
      name: 'prompt',
      label: 'Prompt',
      kind: 'text',
      required: true,
      help: 'Describe the instruments, the genre, and the texture of the recording.',
    },
    {
      name: 'durationSeconds',
      label: 'Length in seconds',
      kind: 'number',
      required: false,
      min: 5,
      max: 300,
      step: 5,
      default: 120,
      help: 'Generation time scales with this.',
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
      advanced: true,
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
      advanced: true,
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
      advanced: true,
      help: 'Leave this empty for a different result every time.',
    },
  ],
  buildRequest(params) {
    // duration_seconds here, because Stable Audio takes it as a real flag
    // rather than a request option the way MiniMax and HeartMuLa do.
    const request: Record<string, unknown> = { text: params.prompt };

    if (params.durationSeconds !== undefined) request.duration_seconds = params.durationSeconds;
    if (params.steps !== undefined) request.num_inference_steps = params.steps;
    if (params.guidanceScale !== undefined) request.guidance_scale = params.guidanceScale;
    if (params.seed !== undefined) request.seed = params.seed;

    return request;
  },
};

/**
 * ACE-Step 1.5, repaint.
 *
 * The first task that reads an existing asset. `inputRoles` names the source,
 * the worker stages it to the backend before the run, and buildRequest receives
 * the path the backend gave back.
 *
 * Every field name below was confirmed against a live container on 2026-09-13
 * rather than taken from the CLI manual, because this route cannot be checked
 * by its status code: /v1/tasks/run defaults every field it does not recognise,
 * so a wrong name returns a perfectly good track that ignored you. The proof is
 * that the returned audio was identical to the source outside the window and
 * completely different inside it. See src/server/audiocpp/fixtures/README.md.
 *
 * There is no duration field. Repaint locks the length to the source, measured
 * at 20.00 seconds in and 20.00 seconds out, so a box asking for a length would
 * be a control the model ignores.
 *
 * repaint_mode stays out while repaint_strength covers the same idea. Three
 * named presets beside a 0 to 1 dial are two controls for one question.
 */
const repaint: TaskDefinition = {
  id: 'remix.repaint',
  label: 'Repaint a section',
  summary: 'Replaces the part of a take you select, and leaves the rest alone.',
  family: 'ace_step',
  serverTask: 'gen',
  route: 'repaint',
  vocals: 'both',
  sessionOptions: () => ({ 'ace_step.mem_saver': 'true' }),
  inputRoles: ['source'],
  fields: [
    {
      name: 'prompt',
      label: 'Prompt',
      kind: 'text',
      required: true,
      help: 'What the new section should sound like, for example a brighter chorus.',
    },
    {
      name: 'regionStart',
      label: 'Region start in seconds',
      kind: 'number',
      required: true,
      min: 0,
      max: 3600,
      step: 0.1,
      help: 'Set by dragging on the waveform, or typed here.',
    },
    {
      name: 'regionEnd',
      label: 'Region end in seconds',
      kind: 'number',
      required: true,
      min: 0,
      max: 3600,
      step: 0.1,
      help: 'Has to land after the start, and inside the track.',
    },
    {
      name: 'lyrics',
      label: 'Lyrics',
      kind: 'lyrics',
      required: false,
      help: 'Words for the section being replaced, if it has any.',
    },
    {
      name: 'strength',
      label: 'Strength',
      kind: 'number',
      required: false,
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.5,
      help: 'Low nudges what is already there. High replaces it.',
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
      advanced: true,
      help: 'More steps take longer and change the result more than they improve it.',
    },
    {
      name: 'seed',
      label: 'Seed',
      kind: 'number',
      required: false,
      min: 0,
      max: 2_147_483_647,
      step: 1,
      advanced: true,
      help: 'A repaint repeats exactly for the same seed, so this is how a good one is kept.',
    },
  ],
  validate(params) {
    const { regionStart: start, regionEnd: end } = params;
    // Both are required fields, so anything other than two numbers here has
    // already been refused and the per-field message is the better one.
    if (typeof start !== 'number' || typeof end !== 'number') return undefined;
    if (end <= start) return 'The region has to end after it starts.';
    return undefined;
  },
  buildRequest(params, staged) {
    const request: Record<string, unknown> = {
      task_route: 'repaint',
      text: params.prompt,
      // The staged path the worker uploaded, under the one name that works.
      audio: staged.source,
      repaint_start: params.regionStart,
      repaint_end: params.regionEnd,
    };

    if (params.lyrics !== undefined && params.lyrics !== '') request.lyrics = params.lyrics;
    if (params.strength !== undefined) request.repaint_strength = params.strength;
    if (params.steps !== undefined) request.num_inference_steps = params.steps;
    if (params.seed !== undefined) request.seed = params.seed;

    return request;
  },
};

const tasks = new Map<string, TaskDefinition>(
  [text2music, minimax, heartmula, stableAudio, repaint].map((task) => [task.id, task]),
);

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

  // Only once every field is known good, so a cross-field message never talks
  // about a value that was never valid on its own.
  const across = task.validate?.(value);
  if (across !== undefined) return { ok: false, error: across };

  return { ok: true, value };
}

/** Whether a catalog package can run this task: a family match, then the task's own say. */
export function packageRunsTask(task: TaskDefinition, packageId: string): boolean {
  if (findPackage(packageId)?.spec.family !== task.family) return false;
  return task.acceptsPackage?.(packageId) ?? true;
}

/**
 * Every package this task can run on, by id.
 *
 * Sent to the browser so the studio's precision list holds the same packages
 * the service would accept, rather than the whole family and a rejection after
 * the fact.
 */
export function taskPackageIds(task: TaskDefinition): string[] {
  return loadSpecs()
    .filter((spec) => spec.family === task.family)
    .flatMap((spec) => spec.packages)
    .map((pkg) => pkg.id)
    .filter((id) => task.acceptsPackage?.(id) ?? true);
}
