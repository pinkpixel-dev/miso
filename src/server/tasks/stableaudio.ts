import { isSfxPackage } from '../catalog/sfx.ts';
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
  // effect instead of a track. The catalog splits them onto their own card with
  // the same rule, which is why it lives in one place.
  acceptsPackage: (packageId) => !isSfxPackage(packageId),
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
 * Stable Audio 3 SFX, a description of a sound to a sound effect.
 *
 * The same family and the same request shape as the music task above, on the
 * SFX packages that task refuses. Two tasks rather than one switch on a form,
 * because the two produce different kinds of thing: a track fills its whole
 * length, and a sound effect is an event with silence around it.
 *
 * Measured on 2026-09-19 against Stable Audio 3 Medium on the same prompts and
 * seed. Asked for a door slam the SFX packages sit near silence and spike once,
 * while the music packages hold a continuous wash for the whole six seconds.
 * The full loudness envelopes are in `audiocpp/fixtures/README.md`.
 *
 * `duration_seconds`, `num_inference_steps`, `guidance_scale` and `seed` were
 * each checked with two values far apart, which is the only way to tell a real
 * option from one the server accepts and ignores. All four change the audio.
 *
 * The output is quiet, peaking around -28 dBFS on the probes, which is what a
 * sound effect should look like next to a mastered track. Normalize in the
 * workbench is the answer when it needs to sit louder.
 */
export const stableAudioSfx: TaskDefinition = {
  id: 'generate.sfx',
  label: 'Make a sound effect',
  shortLabel: 'Sound effects',
  summary: 'Writes a short sound from a description of what happens.',
  family: 'stable_audio',
  serverTask: 'gen',
  vocals: 'never',
  inputRoles: [],
  acceptsPackage: (packageId) => isSfxPackage(packageId),
  guidedPrompt: false,
  // Off the create form, which is where songs are written. A door slam is not
  // a take, and burying it under "generate a take" is how nobody found it.
  surface: 'sound',
  fields: [
    {
      name: 'prompt',
      label: 'Prompt',
      kind: 'text',
      required: true,
      help: 'Describe the sound as an event: what makes it, and what happens to it.',
    },
    {
      name: 'durationSeconds',
      label: 'Length in seconds',
      kind: 'number',
      required: false,
      min: 1,
      max: 60,
      step: 1,
      default: 6,
      // Shorter than the music task, which goes to 300. A sound effect is an
      // event, and asking for a minute of one mostly buys silence around it.
      help: 'Long enough for the sound to finish. Most effects need only a few seconds.',
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
    const request: Record<string, unknown> = { text: params.prompt };

    if (params.durationSeconds !== undefined) request.duration_seconds = params.durationSeconds;
    if (params.steps !== undefined) request.num_inference_steps = params.steps;
    if (params.guidanceScale !== undefined) request.guidance_scale = params.guidanceScale;
    if (params.seed !== undefined) request.seed = params.seed;

    return request;
  },
};
