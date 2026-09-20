import type { MidiNote } from '../../shared/types.ts';

/**
 * The arithmetic behind the MIDI preview, kept apart from the audio graph.
 *
 * The preview exists to answer one question: did the transcription get the
 * notes right. It is not a rendering of the MIDI file and does not try to be.
 * Everything is one voice, because the model's instrument labels are not
 * trustworthy enough to act on: an isolated drum stem came back as acoustic
 * guitar. See `src/server/tasks/muscriptor.ts`.
 */

/** Equal temperament, with MIDI 69 at 440 Hz. */
export function noteFrequency(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

/** Where the last note stops, which is how long the preview runs for. */
export function previewDuration(notes: MidiNote[]): number {
  return notes.reduce((longest, note) => Math.max(longest, note.end), 0);
}

/**
 * How loud one voice should be, given how many usually sound together.
 *
 * Summing twelve oscillators at full scale clips hard. Dividing by the count
 * outright makes a dense chord inaudible next to a single note, so this backs
 * off on the square root, which is the usual compromise and keeps a solo line
 * present without letting a chord distort.
 *
 * Feed it `typicalPolyphony`, not a peak. The limiter in `useMidiPreview.ts`
 * is what catches the moments denser than this expects.
 */
export function voiceGain(polyphony: number): number {
  return 0.5 / Math.sqrt(Math.max(1, polyphony));
}

/**
 * How many notes sound at once for most of the time something is sounding.
 *
 * This used to be the plain maximum, and the maximum is the wrong number to
 * set a level from. MuScriptor can stutter at the end of a long take: one
 * transcription here holds 1725 duplicate ten millisecond drum hits piled on a
 * single instant, against two to six notes through the actual music. Dividing
 * by that peak put the whole of a 169 second piece at about -38 dBFS, which
 * played correctly and was inaudible.
 *
 * So the count is weighted by how long it lasts rather than counted per event.
 * A spike a hundredth of a second wide carries a hundredth of a second of
 * weight and cannot move a quantile, while a genuinely dense passage can.
 *
 * Silence is left out of the total. The question is how many notes are
 * sounding when any of them are, and counting the gaps would answer a quieter
 * question in a piece that is mostly rests.
 */
export function typicalPolyphony(notes: MidiNote[], quantile = 0.95): number {
  if (notes.length === 0) return 0;

  // An explicit time and delta per edge, rather than a signed time. Signing the
  // time cannot tell the start of a note at 0 from the end of one at 0.
  const edges = notes.flatMap((note) => [
    { time: note.start, delta: 1 },
    { time: note.end, delta: -1 },
  ]);

  // Ends sort before starts at the same instant, so a note beginning exactly as
  // another finishes counts as one voice rather than two. That is the cautious
  // direction: it can only make the preview quieter, never louder.
  edges.sort((left, right) => left.time - right.time || left.delta - right.delta);

  const heldFor = new Map<number, number>();
  let sounding = 0;
  let open = 0;
  let previous = edges[0]?.time ?? 0;

  for (const edge of edges) {
    const span = edge.time - previous;
    if (span > 0 && open > 0) {
      heldFor.set(open, (heldFor.get(open) ?? 0) + span);
      sounding += span;
    }
    previous = edge.time;
    open += edge.delta;
  }

  // Every note was instantaneous, so nothing was held for any measurable time.
  // One voice is the honest answer and the limiter covers the rest.
  if (sounding === 0) return 1;

  let seen = 0;
  for (const count of [...heldFor.keys()].sort((left, right) => left - right)) {
    seen += heldFor.get(count) ?? 0;
    if (seen >= sounding * quantile) return count;
  }

  return 1;
}

/** The notes still to come from a given position, with times relative to it. */
export function notesFrom(notes: MidiNote[], fromSeconds: number): MidiNote[] {
  return notes
    .filter((note) => note.end > fromSeconds)
    .map((note) => ({ ...note, start: Math.max(0, note.start - fromSeconds), end: note.end - fromSeconds }));
}
