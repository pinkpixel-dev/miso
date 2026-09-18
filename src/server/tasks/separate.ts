import type { TaskDefinition } from './types.ts';

/**
 * Splitting a take into stems.
 *
 * One task over three families, because all three answer the same request and
 * differ only in what comes back. Confirmed against the running container on
 * 2026-09-18, full measurements in src/server/audiocpp/fixtures/README.md:
 *
 *   HTDemucs           4 stems, drums bass other vocals, 3.8 s for 40 s of audio
 *   Mel-Band RoFormer  2 stems, vocals and instrumental, 14.9 s
 *   BS-RoFormer        2 stems, vocals and instrumental, 77.8 s
 *
 * There are no request fields, and that is not an omission. Every one of the
 * three vendored specs carries an empty `options.request`, and every probe run
 * sent nothing but `audio`. The two RoFormers take `num_overlap`, but as a
 * session option set when the weights load, not as something a person picks per
 * run.
 *
 * All three genuinely separate, which is worth stating because ACE-Step's
 * `extract` route claimed to and did not. See DOCS/ERRORS.md. The proof here is
 * that the vocal stem falls to near silence through an instrumental break the
 * mix plays straight through.
 */
export const separate: TaskDefinition = {
  id: 'stems.separate',
  label: 'Split into stems',
  shortLabel: 'Stems',
  summary: 'Separates a take into vocals and backing, or into four parts.',
  family: ['htdemucs', 'mel_band_roformer', 'bs_roformer'],
  serverTask: 'sep',
  // Nothing here sings or writes words. A stem carries whatever the source had.
  vocals: 'both',
  inputRoles: ['source'],
  // Both families refuse anything else outright, before any work starts, and
  // every take audio.cpp generates is 48 kHz. The worker converts.
  inputSampleRate: 44_100,
  fields: [],
  buildRequest(_params, staged) {
    return { audio: staged.source };
  },
};
