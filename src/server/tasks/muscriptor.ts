import type { TaskDefinition } from './types.ts';

/**
 * Transcribing a take into notes and a MIDI file.
 *
 * The first task in Miso whose result is not audio. It answers with note events
 * as JSON and a standard MIDI file in an `artifacts` array, so it takes the
 * artifact path through `storeResult` rather than the one that writes takes.
 *
 * Probed against the running container on 2026-09-19, measurements in
 * src/server/audiocpp/fixtures/README.md. What that probe settled:
 *
 *   runtime task kind   `midi`, not a spec word and not `gen`
 *   pitch accuracy      a synthesized C major scale came back exactly right,
 *                       onsets inside 30 ms
 *   speed               80 s of audio in 3.4 s, about 24x realtime
 *   weights             412 MB, and about 390 MiB of VRAM
 *
 * There are no request fields, and that is not an omission. The vendored spec
 * describes instrument constraints, sampling and beam search, and none of them
 * is reachable as a request option on this image. Only `audio` travels.
 *
 * Its instrument labels are not trusted anywhere in Miso. An isolated drum stem
 * came back as 76 acoustic guitar notes and no drums. Pitch is the part that
 * measured well, so pitch is the part that is used.
 */
export const transcribe: TaskDefinition = {
  id: 'analyze.midi',
  label: 'Transcribe to MIDI',
  shortLabel: 'Transcriptions',
  summary: 'Reads the notes out of a take and writes a MIDI file.',
  family: 'muscriptor',
  serverTask: 'midi',
  // It reads notes. It neither sings nor cares whether the source does.
  vocals: 'both',
  inputRoles: ['source'],
  // A note starting at t=0 is dropped without this. See types.ts.
  inputLeadInSeconds: 1,
  produces: 'artifact',
  // Not a remix: it turns a take into something that is not a take. The sound
  // page carries it instead, with sound effects.
  surface: 'sound',
  fields: [],
  buildRequest(_params, staged) {
    return { audio: staged.source };
  },
};
