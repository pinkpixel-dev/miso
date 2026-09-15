import type { TaskDefinition } from './types.ts';

/**
 * Stable Audio 3, text to music.
 *
 * There is no lyrics field, because this family does not sing. Its manual never
 * mentions lyrics, vocals or singing, and it has no lyrics option, despite its
 * vendored spec tagging `lyrics` under capabilities. That contradiction is why
 * `vocals` is declared here rather than read from the spec. See DOCS/MEMORY.md.
 *
 * This is the whole of Stable Audio in Miso. Its init-audio and inpainting
 * modes were probed for phase 5b on 2026-09-14 and both are inert: the server
 * opens the source WAV, since a path that does not exist answers HTTP 500, and
 * then produces audio byte-identical to a plain text-to-music request on the
 * same seed. There is no better field name to find, so there is no remix entry
 * for this family. See DOCS/ERRORS.md.
 */
export const stableAudio: TaskDefinition = {
  id: 'generate.stableaudio',
  label: 'Stable Audio 3',
  shortLabel: 'Stable Audio',
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
