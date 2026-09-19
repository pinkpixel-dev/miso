import type { TaskDefinition } from './types.ts';

/**
 * Converting a vocal to a different voice.
 *
 * RVC, and only RVC. Seed-VC and MeanVC2 were probed against the running
 * container on 2026-09-18 alongside it, both work, and both were left out:
 *
 *   RVC       40 kHz mono, 9 to 10 s for 40 s of audio, same input same output
 *   Seed-VC   22.05 kHz mono, 36 s, and not reproducible even with a set seed
 *   MeanVC2   16 kHz mono, 7 to 10 s, so nothing above 8 kHz survives
 *
 * Both of the others also need a reference clip rather than a packaged voice,
 * which is a second input role. `inputRoles` is a list, so that door is open.
 * Full measurements are in src/server/audiocpp/fixtures/README.md.
 *
 * The request shape is the thing to be careful with here. Every option below
 * travels nested under `options`, which is not how any other task in this
 * registry sends them, and sending them the usual way is not an error: four
 * different voices came back byte for byte identical because the fields were
 * quietly ignored. The rule upstream is that a CLI flag is a top level request
 * field and a `--request-option` belongs under `options`. See buildRequest.
 *
 * No `inputSampleRate`. RVC took 44.1 kHz and 48 kHz stereo in the probe and
 * answered at 40 kHz either way, so nothing has to be converted on the way in.
 * The way out is a different matter, which `matchesSourceSampleRate` handles.
 */
export const rvc: TaskDefinition = {
  id: 'voice.rvc',
  label: 'Convert the voice',
  shortLabel: 'Voices',
  summary: 'Sings a vocal stem again in one of four packaged voices.',
  family: 'rvc',
  serverTask: 'vc',
  // It only ever sings. There is nothing here to ask about words or an
  // instrumental: it is given a vocal and it hands one back.
  vocals: 'required',
  inputRoles: ['source'],
  // One track comes back and it is a stem, so it lands beside the stems it was
  // converted from and Save mix can reach it.
  resultKind: 'stem',
  // 40 kHz out against 44.1 kHz stems. Converted once, here, on the way out.
  matchesSourceSampleRate: true,
  fields: [
    {
      name: 'voiceId',
      label: 'Voice',
      kind: 'choice',
      required: false,
      default: 'default',
      values: [
        { value: 'default', label: 'Default' },
        { value: 'manthos', label: 'Manthos' },
        { value: 'chocola', label: 'Chocola' },
        { value: 'fraise', label: 'Fraise' },
      ],
      help: 'The four voices that ship with the model. They sound different from each other.',
    },
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
      help: 'Moves the pitch before the voice is applied. Twelve is an octave.',
    },
    {
      name: 'retrievalBlend',
      label: 'Retrieval blend',
      kind: 'number',
      required: false,
      min: 0,
      max: 1,
      step: 0.1,
      default: 0,
      advanced: true,
      help: 'How much of the voice is drawn from its own recordings rather than from yours. Zero turns it off.',
    },
    {
      name: 'pitchFilterRadius',
      label: 'Pitch smoothing',
      kind: 'number',
      required: false,
      min: 0,
      max: 7,
      step: 1,
      default: 3,
      advanced: true,
      help: 'Median filter over the detected pitch. Above two it is on.',
    },
  ],
  /**
   * A conversion is named after the stem it sang again, plus the voice.
   *
   * "Cool to Be You (vocals)" converted twice would otherwise be two rows with
   * one name, in the library and in the stem deck, where the whole point is
   * hearing one against the other.
   */
  labelSuffix(params) {
    const chosen = params.voiceId;
    return typeof chosen === 'string' && chosen !== '' ? chosen : undefined;
  },
  /**
   * The nested shape, which is this task's whole trap.
   *
   * Do not flatten these into the request beside `audio`. RVC accepts a request
   * with unknown top level fields, fills in its own defaults for everything it
   * was actually asked about, and answers with a perfectly good track that
   * ignored you. Under `options` a wrong name is refused instead, which is what
   * makes this worth testing.
   */
  buildRequest(params, staged) {
    const options: Record<string, unknown> = {};

    if (typeof params.voiceId === 'string') options.voice_id = params.voiceId;
    if (typeof params.semitoneShift === 'number') options.semitone_shift = params.semitoneShift;
    if (typeof params.retrievalBlend === 'number') options.retrieval_blend = params.retrievalBlend;
    if (typeof params.pitchFilterRadius === 'number') {
      options.pitch_filter_radius = params.pitchFilterRadius;
    }

    return { audio: staged.source, options };
  },
};
