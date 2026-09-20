import type { TaskDefinition } from './types.ts';

/**
 * Singing voice conversion against a reference voice, on Vevo2.
 *
 * This sits beside RVC rather than replacing it, and the two are not
 * interchangeable. RVC sings a stem again in one of four voices that ship with
 * the model and answers at 40 kHz. Vevo2 sings it in whatever voice it is
 * handed and answers at 24 kHz. Neither is the better one: the choice is
 * bandwidth against having any say in the voice.
 *
 * Measured against the running container on 2026-09-20, all with the
 * `vevo2_q8_0` package and `style_preserved_svc`:
 *
 *   20 s of vocal converted in 11.3 to 11.6 s
 *   24 kHz mono out, whatever the source rate was
 *   same seed twice, byte for byte identical
 *   no seed, different every run
 *   two different voice references, audibly and measurably different results
 *
 * The 24 kHz is the thing to be honest about. Nothing above 12 kHz survives and
 * resampling does not bring it back, which is why Seed-VC was shelved at 22.05
 * kHz in phase 6b. What is different here is the rest of the row: Seed-VC took
 * 36 seconds and could not be repeated with a seed, and both of those are fixed.
 * The full table is in src/server/audiocpp/fixtures/README.md and the decision
 * is in DOCS/MEMORY.md.
 *
 * One route, deliberately. Vevo2 has eleven, and the backend lists all of them
 * when you send one it does not know. The other ten are speech conversion,
 * speech editing, text to singing and melody to singing, and the last of those
 * is worth having but is not a remix of a take: it starts from a hummed melody
 * and makes a vocal that did not exist before. That belongs on its own surface
 * rather than bolted to this one.
 *
 * Every field below is a CLI flag upstream, so every one of them travels flat
 * in the request. Nothing here belongs under `options`. That is the opposite of
 * RVC next door, and the rule that tells them apart is in DOCS/ERRORS.md: a CLI
 * flag is a top level field, a `--request-option` is nested. Both halves of it
 * were re-checked here before this task was written. `task_route` and
 * `voice_ref` were each sent as something the model cannot know, and both were
 * refused rather than swallowed.
 */
export const vevoSvc: TaskDefinition = {
  id: 'voice.vevo2',
  label: 'Sing it in another voice',
  shortLabel: 'Voices',
  summary: 'Sings a vocal stem again in the voice of any track you point it at. 24 kHz out.',
  family: 'vevo2',
  serverTask: 'svc',
  // Handed a vocal, hands a vocal back. There is nothing to ask about lyrics or
  // an instrumental.
  vocals: 'required',
  inputRoles: ['source', 'voiceRef'],
  inputRoleLabels: {
    voiceRef: {
      label: 'Voice to copy',
      help: 'Any track in this project. A clean vocal of the singer you want works best, and a few seconds is enough.',
    },
  },
  // One track back, and it is a stem: it belongs beside the stems it was
  // converted from, and Save mix has to be able to reach it.
  resultKind: 'stem',
  // 24 kHz out against 44.1 kHz stems. Converted once, on the way out, for the
  // same reason RVC's 40 kHz is. The mix route refuses a set whose rates
  // disagree rather than summing them, so a conversion that cannot sit beside
  // its own siblings is not much use. This restores the rate, not the content:
  // what was lost above 12 kHz stays lost.
  matchesSourceSampleRate: true,
  fields: [
    {
      name: 'semitoneShift',
      label: 'Semitone shift',
      kind: 'number',
      required: false,
      min: -24,
      max: 24,
      step: 1,
      default: 0,
      advanced: true,
      help: 'Moves the source pitch before the voice is applied. Twelve is an octave. Zero lets the model work the shift out from the two voices.',
    },
    {
      name: 'steps',
      label: 'Steps',
      kind: 'number',
      required: false,
      min: 1,
      max: 100,
      step: 1,
      default: 32,
      advanced: true,
      help: 'Flow matching steps for the acoustic stage.',
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
      help: 'The same seed and the same inputs give the same result. Leave it empty for a different take every run.',
    },
  ],
  /**
   * A conversion is named after the stem it sang again, plus what did it.
   *
   * RVC names the voice it used, because the voice is one of four and its name
   * means something. Here the voice is another track, whose name is already on
   * screen and could be anything, so the suffix names the model instead. Two
   * conversions of one stem are still told apart in the library and in the stem
   * deck, which is the point.
   */
  labelSuffix() {
    return 'vevo2';
  },
  /**
   * Flat, all of it. See the note above the task.
   *
   * `voice_ref` and `audio` are both staged paths the worker put there, named
   * by the roles in `inputRoles`.
   */
  buildRequest(params, staged) {
    const request: Record<string, unknown> = {
      task_route: 'style_preserved_svc',
      audio: staged.source,
      voice_ref: staged.voiceRef,
    };

    // Left out when it is zero rather than sent as zero. The two are not the
    // same instruction: unset means the model estimates the shift between the
    // source and the reference, which is what the route does by default and is
    // almost always the right answer.
    if (typeof params.semitoneShift === 'number' && params.semitoneShift !== 0) {
      request.source_shift_steps = params.semitoneShift;
    }
    if (typeof params.steps === 'number') request.num_inference_steps = params.steps;
    if (typeof params.seed === 'number') request.seed = params.seed;

    return request;
  },
};
