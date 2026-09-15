import type { TaskDefinition } from './types.ts';

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
export const heartmula: TaskDefinition = {
  id: 'generate.heartmula',
  label: 'HeartMuLa',
  shortLabel: 'HeartMuLa',
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
