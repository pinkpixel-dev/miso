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
 * when you send one it does not know. Singing from lyrics and singing from a
 * melody are `generate.sing` below, because they make a vocal that did not
 * exist rather than remixing a take. The rest are speech conversion and speech
 * editing, which Miso does not offer.
 *
 * `style_converted_svc` and `singing_style_conversion` were probed on
 * 2026-09-20 and left out. Both take lyrics and change the delivery as well as
 * the voice, and `singing_style_conversion` returned 16.48 seconds from a 20
 * second source. A conversion whose output does not line up with the stems it
 * came from cannot be mixed with them, which is most of what a conversion is
 * for here.
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

/**
 * Singing from lyrics, in a voice you point at, with or without a melody.
 *
 * One task over two Vevo2 routes, because from the form's side it is one thing:
 * words, a voice, and optionally a tune to sing them to. Hand it a melody and
 * it runs `humming_to_singing`, leave the melody out and it runs
 * `text_to_singing` and writes its own. Splitting that into two entries would
 * put two tools on the create form that take almost the same inputs, which is
 * the mistake the separation task avoided by holding three families behind one
 * entry.
 *
 * The two routes live under different runtime kinds, which is why `serverTask`
 * is a function here and static everywhere else. `text_to_singing` is a `tts`
 * route and `humming_to_singing` is an `svc` route, and asking for the first
 * under an `svc` registration answers `Vevo2 route text_to_singing is not valid
 * for task svc`. The resolver reads the staged inputs rather than the params,
 * because the melody is an input.
 *
 * `instrument_to_singing` is not offered. Upstream says it shares the melody
 * path with `humming_to_singing`, and both returned 7.92 seconds from the same
 * 8 second reference on 2026-09-20. Two names for one path is not a choice
 * worth putting on a form.
 *
 * Measured the same day, all on `vevo2_q8_0`:
 *
 *   text_to_singing       4.5 s, 6.72 s of singing from 8 words
 *   text_to_singing       11.4 s, 19.28 s from 28 words at max_tokens 1500
 *   humming_to_singing    9.8 s, 7.92 s from an 8 s melody
 *   instrument_to_singing 5.9 s, 7.92 s from the same melody
 *
 * So length follows the lyrics when there is no melody and the melody when
 * there is one. `maxTokens` is the ceiling on the first of those, and the
 * default of 500 stops at about seven seconds, which is shorter than most
 * people's first attempt. It is on the form rather than in the drawer for that
 * reason.
 *
 * 24 kHz mono out, like every Vevo2 route. The note on `voice.vevo2` above
 * applies here and there is no source rate to match it back to, so what comes
 * out is what the model sent.
 */
export const vevoSing: TaskDefinition = {
  id: 'generate.sing',
  label: 'Sing lyrics in a voice',
  shortLabel: 'Sung vocals',
  summary: 'Sings your words in the voice of a track you pick. Give it a melody to follow, or let it write one. 24 kHz out.',
  family: 'vevo2',
  serverTask: (staged) => (staged.prosodyRef === undefined ? 'tts' : 'svc'),
  // It only sings. There is no instrumental to ask about, and the words are
  // required rather than optional.
  vocals: 'required',
  inputRoles: ['voiceRef', 'prosodyRef'],
  optionalInputRoles: ['prosodyRef'],
  inputRoleLabels: {
    voiceRef: {
      label: 'Voice to sing in',
      help: 'Any track in this project. A clean vocal works best, and a few seconds is enough.',
    },
    prosodyRef: {
      label: 'Melody to follow (optional)',
      help: 'A hummed or played tune for it to sing along to. Leave this empty and it writes its own melody from the words.',
    },
  },
  // The guided builder writes a description of a song: a genre, a mood, a
  // production style. This task takes words to sing and a voice to sing them
  // in, and none of that compiles into either field.
  guidedPrompt: false,
  fields: [
    {
      name: 'lyrics',
      label: 'Lyrics',
      kind: 'lyrics',
      required: true,
      help: 'The words to sing. Length follows what you write when no melody is given.',
    },
    {
      name: 'maxTokens',
      label: 'Length limit',
      kind: 'number',
      required: false,
      min: 100,
      max: 4000,
      step: 100,
      default: 1500,
      help: 'The ceiling on how long the singing can run. Raise it for a long lyric, lower it to stop early.',
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
      name: 'temperature',
      label: 'Temperature',
      kind: 'number',
      required: false,
      min: 0.1,
      max: 4,
      step: 0.1,
      default: 1,
      advanced: true,
      help: 'Higher wanders further from the obvious phrasing.',
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
   * Flat, like `voice.vevo2`. Every field here is a CLI flag upstream.
   *
   * `prosody_ref` is written only when one was staged, and that absence is the
   * same fact `serverTask` read to pick the route. The two cannot disagree,
   * because both are reading `staged`.
   */
  buildRequest(params, staged) {
    const melody = staged.prosodyRef;

    const request: Record<string, unknown> = {
      task_route: melody === undefined ? 'text_to_singing' : 'humming_to_singing',
      voice_ref: staged.voiceRef,
      target_text: params.lyrics,
    };

    if (melody !== undefined) request.prosody_ref = melody;
    if (typeof params.maxTokens === 'number') request.max_tokens = params.maxTokens;
    if (typeof params.steps === 'number') request.num_inference_steps = params.steps;
    if (typeof params.temperature === 'number') request.temperature = params.temperature;
    if (typeof params.seed === 'number') request.seed = params.seed;

    return request;
  },
};
