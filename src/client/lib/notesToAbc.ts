import type { MidiNote } from '../../shared/types.ts';

/**
 * Note events turned into an ABC melody, for handing a transcription to YuE2.
 *
 * This is the piece DOCS/ROADMAP.md calls step 1 of a cover. `analyze.midi`
 * already reads a take into notes with exact pitch, and YuE2 already sings a
 * score it is given, measured on 2026-09-20 and confirmed by listening. What
 * was missing is the middle: notes with times in seconds, into a document with
 * bars and a key.
 *
 * Three things have to be invented here, because MuScriptor answers with pitch
 * and seconds and nothing else. A tempo, a meter and a key. Two of them are
 * guessed from the notes and the third is assumed, and all three are shown to
 * the person and can be overridden, because a guess that cannot be seen is a
 * guess that is silently wrong. See DOCS/MEMORY.md.
 *
 * Deliberately pure and deliberately in the client. It runs on notes already
 * fetched, so re-rendering the score while somebody drags the tempo costs a
 * function call rather than a request, and it is testable without a GPU or a
 * backend, which is most of why step 1 was worth doing before step 2.
 */

/** Sixteenths, which is `L:1/16` in the header and what YuE2's own scores use. */
const UNITS_PER_BEAT = 4;

/** Below this, two onsets are the same musical event rather than two of them. */
const SAME_ONSET_SECONDS = 0.05;

/** The range a guessed tempo is folded into. See `inferTempo`. */
const SLOWEST_TEMPO = 60;
const FASTEST_TEMPO = 160;

export interface AbcOptions {
  /** Quarter notes per minute, which the header carries as `Q:1/4=`. */
  tempo: number;
  /** The `M:` numerator, so 3 in 3/4. */
  beatsPerBar: number;
  /** The `M:` denominator, so 4 in 3/4. */
  beatUnit: number;
  /** A key name as `keyNames()` gives it, such as `C` or `Am`. */
  key: string;
}

export const DEFAULT_METER = { beatsPerBar: 4, beatUnit: 4 };

/**
 * One note at a time, keeping the highest wherever notes overlap.
 *
 * The skyline, which is the usual way to pull a melody out of polyphony and
 * rests on singers and lead lines sitting above the accompaniment. On a
 * separated vocals stem it does almost nothing, because the stem is close to
 * monophonic already, and that is the input this is meant for. On a full mix it
 * is doing real work and is the first thing to suspect if a cover comes out
 * wrong.
 *
 * Returns notes that never overlap, in time order.
 */
export function skyline(notes: MidiNote[]): MidiNote[] {
  if (notes.length === 0) return [];

  // Every instant where the set of sounding notes can change.
  const bounds = new Set<number>();
  for (const note of notes) {
    if (note.end > note.start) {
      bounds.add(note.start);
      bounds.add(note.end);
    }
  }

  const edges = [...bounds].sort((left, right) => left - right);
  const segments: MidiNote[] = [];
  // Which note each segment was cut from. Two slices join back together only
  // when they came from the same note: `C C` sung twice is two notes at one
  // pitch, and merging those would turn a repeated note into one long one and
  // quietly delete half of a melody like Twinkle Twinkle.
  let lastSource = -1;

  for (let index = 0; index + 1 < edges.length; index += 1) {
    const from = edges[index]!;
    const to = edges[index + 1]!;

    let top: MidiNote | undefined;
    let topSource = -1;
    for (let candidate = 0; candidate < notes.length; candidate += 1) {
      const note = notes[candidate]!;
      if (note.start <= from && note.end >= to && note.end > note.start) {
        if (top === undefined || note.pitch > top.pitch) {
          top = note;
          topSource = candidate;
        }
      }
    }
    if (top === undefined) continue;

    const last = segments[segments.length - 1];
    if (last !== undefined && topSource === lastSource && last.end >= from - 1e-9) {
      last.end = to;
      continue;
    }

    segments.push({ pitch: top.pitch, start: from, end: to, instrument: top.instrument });
    lastSource = topSource;
  }

  return segments;
}

/** Onsets, with notes that start together counted once. */
function onsets(notes: MidiNote[]): number[] {
  const times = [...new Set(notes.map((note) => note.start))].sort((a, b) => a - b);
  const distinct: number[] = [];
  for (const time of times) {
    const previous = distinct[distinct.length - 1];
    if (previous === undefined || time - previous > SAME_ONSET_SECONDS) distinct.push(time);
  }
  return distinct;
}

/**
 * A tempo for these notes, in quarter notes per minute.
 *
 * The beat is taken to be the typical gap between one onset and the next, and
 * the median is used rather than the mean so that a held note or a pause does
 * not drag the answer. That number is then doubled or halved until it lands in
 * a range music is usually written in.
 *
 * The octave folding is the part worth understanding. A tempo and its double
 * describe the same music, because every onset on a grid at 60 is also on a
 * grid at 120, so no amount of arithmetic can separate them and the choice is a
 * convention rather than a measurement.
 *
 * Fitting a grid to the onsets was tried first and abandoned. At 0.5 second
 * spacing, 60, 90, 120, 150 and 180 all fit perfectly, and 90 makes a quarter
 * note three sixteenths long, which is correct arithmetic and nonsense
 * notation.
 *
 * Returns 120 for anything with fewer than two onsets, where there is nothing
 * to measure.
 */
export function inferTempo(notes: MidiNote[]): number {
  const times = onsets(notes);
  if (times.length < 2) return 120;

  const gaps: number[] = [];
  for (let index = 1; index < times.length; index += 1) {
    gaps.push(times[index]! - times[index - 1]!);
  }
  gaps.sort((left, right) => left - right);

  const beat = gaps[Math.floor(gaps.length / 2)]!;
  if (!Number.isFinite(beat) || beat <= 0) return 120;

  let tempo = 60 / beat;
  while (tempo < SLOWEST_TEMPO) tempo *= 2;
  while (tempo > FASTEST_TEMPO) tempo /= 2;

  return Math.round(tempo);
}

/** The twelve majors and twelve minors, spelled the way ABC wants them. */
const MAJOR_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// Both lists are indexed by the pitch class of their tonic, so index 0 is the
// key on C. Ordering one of them from A instead is a bug that spells every
// minor key a third away from the right one.
const MINOR_KEYS = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

export function keyNames(): string[] {
  return [...MAJOR_KEYS, ...MINOR_KEYS];
}

/*
  Krumhansl and Schmuckler's key profiles, which weight each scale degree by how
  much of a piece in that key tends to sit on it. Correlating a piece's own
  pitch histogram against all twenty four rotations and taking the best is the
  standard way to guess a key, and it is about thirty lines rather than a model.
*/
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(histogram: number[], profile: number[], rotation: number): number {
  const meanH = histogram.reduce((sum, value) => sum + value, 0) / 12;
  const meanP = profile.reduce((sum, value) => sum + value, 0) / 12;

  let top = 0;
  let leftSq = 0;
  let rightSq = 0;
  for (let index = 0; index < 12; index += 1) {
    const left = histogram[(index + rotation) % 12]! - meanH;
    const right = profile[index]! - meanP;
    top += left * right;
    leftSq += left * left;
    rightSq += right * right;
  }

  if (leftSq === 0 || rightSq === 0) return 0;
  return top / Math.sqrt(leftSq * rightSq);
}

/**
 * The key these notes most look like, as an ABC key name.
 *
 * Weighted by how long each pitch class sounds rather than by how often it
 * appears, because a passing note and a held tonic are not equal evidence.
 *
 * Returns `C` for an empty transcription. A wrong key is not fatal: it changes
 * how the score is spelled, not which pitches it names, so a cover in the wrong
 * key signature still sings the right tune.
 */
export function inferKey(notes: MidiNote[]): string {
  if (notes.length === 0) return 'C';

  const histogram = Array.from({ length: 12 }, () => 0);
  for (const note of notes) {
    const pitchClass = ((note.pitch % 12) + 12) % 12;
    histogram[pitchClass] = histogram[pitchClass]! + Math.max(0, note.end - note.start);
  }

  let best = 'C';
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let tonic = 0; tonic < 12; tonic += 1) {
    const major = correlation(histogram, MAJOR_PROFILE, tonic);
    if (major > bestScore) {
      bestScore = major;
      best = MAJOR_KEYS[tonic]!;
    }
    const minor = correlation(histogram, MINOR_PROFILE, tonic);
    if (minor > bestScore) {
      bestScore = minor;
      best = MINOR_KEYS[tonic]!;
    }
  }

  return best;
}

/*
  Key signatures, as a count of sharps when positive and flats when negative.
  A minor key carries its relative major's signature, which is why Am is 0 and
  Cm is three flats rather than anything to do with C.
*/
const SIGNATURES: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, Gb: -6, Db: -5, Ab: -4, Eb: -3, Bb: -2, F: -1,
  Am: 0, Em: 1, Bm: 2, 'F#m': 3, 'C#m': 4, 'G#m': 5, Ebm: -6, Bbm: -5, Fm: -4, Cm: -3,
  Gm: -2, Dm: -1,
};

const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** What the key signature does to each letter, before any accidental in the bar. */
function signatureAlters(key: string): Record<string, number> {
  const count = SIGNATURES[key] ?? 0;
  const alters: Record<string, number> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };

  if (count > 0) for (const letter of SHARP_ORDER.slice(0, count)) alters[letter] = 1;
  if (count < 0) for (const letter of FLAT_ORDER.slice(0, -count)) alters[letter] = -1;

  return alters;
}

interface Spelled {
  letter: string;
  alter: number;
  octave: number;
}

/**
 * A MIDI pitch written as a letter, an alteration and an octave.
 *
 * The key is consulted first, so a note already in the key is spelled the way
 * the key spells it and needs no accidental printed at all. Only a note outside
 * the key falls through to the second pass, which leans sharp in a sharp key
 * and flat in a flat key. That is what keeps an F sharp in D major written `F`
 * rather than `^F` on every appearance.
 */
function spell(pitch: number, key: string): Spelled {
  const alters = signatureAlters(key);
  const pitchClass = ((pitch % 12) + 12) % 12;

  const octaveFor = (letter: string, alter: number): number =>
    Math.round((pitch - alter - NATURAL_PITCH_CLASS[letter]!) / 12) - 1;

  for (const letter of LETTERS) {
    const alter = alters[letter]!;
    if ((((NATURAL_PITCH_CLASS[letter]! + alter) % 12) + 12) % 12 === pitchClass) {
      return { letter, alter, octave: octaveFor(letter, alter) };
    }
  }

  const preferred = (SIGNATURES[key] ?? 0) >= 0 ? [1, -1, 0] : [-1, 1, 0];
  for (const alter of preferred) {
    for (const letter of LETTERS) {
      if ((((NATURAL_PITCH_CLASS[letter]! + alter) % 12) + 12) % 12 === pitchClass) {
        return { letter, alter, octave: octaveFor(letter, alter) };
      }
    }
  }

  // Unreachable: the loop above covers all twelve pitch classes.
  return { letter: 'C', alter: 0, octave: 4 };
}

/** `C` is middle C, `c` is the octave above, and marks carry it further. */
function withOctave(spelled: Spelled): string {
  if (spelled.octave >= 5) {
    return spelled.letter.toLowerCase() + "'".repeat(spelled.octave - 5);
  }
  return spelled.letter + ','.repeat(Math.max(0, 4 - spelled.octave));
}

function accidental(alter: number): string {
  if (alter > 0) return '^';
  if (alter < 0) return '_';
  return '=';
}

/** `L:1/16` means a length of one prints as nothing at all. */
function lengthOf(units: number): string {
  return units === 1 ? '' : String(units);
}

/**
 * The score, as an ABC document.
 *
 * One voice and no chord symbols, which is the shape the YuE2 model card asks
 * for in a cover and the shape its own melody-only scores come back in.
 *
 * Notes are quantized to sixteenths of the tempo given. A note that runs past a
 * bar line is split and tied rather than left to overflow, because a bar that
 * does not add up is the thing most likely to make a parser give up on the
 * whole document.
 */
export function notesToAbc(notes: MidiNote[], options: AbcOptions): string {
  const { tempo, beatsPerBar, beatUnit, key } = options;
  const melody = skyline(notes);

  const unitSeconds = 60 / tempo / UNITS_PER_BEAT;
  const unitsPerBar = Math.max(1, Math.round(beatsPerBar * (16 / beatUnit)));

  const bars: string[][] = [];
  // Accidentals last to the end of their bar, so the state resets at each line.
  const barAlters = new Map<number, Record<string, number>>();
  let cursor = 0;

  const altersForBar = (bar: number): Record<string, number> => {
    let state = barAlters.get(bar);
    if (state === undefined) {
      state = signatureAlters(key);
      barAlters.set(bar, state);
    }
    return state;
  };

  const write = (units: number, render: (length: number, tied: boolean, bar: number) => string): void => {
    let left = units;
    while (left > 0) {
      const bar = Math.floor(cursor / unitsPerBar);
      const room = (bar + 1) * unitsPerBar - cursor;
      const take = Math.min(left, room);

      while (bars.length <= bar) bars.push([]);
      bars[bar]!.push(render(take, left > take, bar));

      cursor += take;
      left -= take;
    }
  };

  for (const note of melody) {
    const startUnit = Math.round(note.start / unitSeconds);
    const endUnit = Math.round(note.end / unitSeconds);
    const units = Math.max(1, endUnit - startUnit);

    if (startUnit > cursor) write(startUnit - cursor, (length) => `z${lengthOf(length)}`);

    const spelled = spell(note.pitch, key);
    write(units, (length, tied, bar) => {
      const state = altersForBar(bar);
      // Printed only when the bar is not already in this state, which is what
      // keeps a key signature doing its job instead of being restated on every
      // note.
      const mark = state[spelled.letter] === spelled.alter ? '' : accidental(spelled.alter);
      state[spelled.letter] = spelled.alter;
      return `${mark}${withOctave(spelled)}${lengthOf(length)}${tied ? '-' : ''}`;
    });
  }

  // A trailing part-bar is padded, for the same reason a note is tied across
  // one: a short last bar is a document that does not add up.
  if (bars.length > 0 && cursor % unitsPerBar !== 0) {
    write(unitsPerBar - (cursor % unitsPerBar), (length) => `z${lengthOf(length)}`);
  }

  const lines: string[] = [];
  for (let index = 0; index < bars.length; index += 4) {
    lines.push(`${bars.slice(index, index + 4).map((bar) => bar.join('')).join('|')}|`);
  }

  return [
    'X:1',
    `M:${beatsPerBar}/${beatUnit}  L:1/16  Q:1/4=${Math.round(tempo)}`,
    'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
    `K:${key}`,
    'V: Vocal',
    ...(lines.length > 0 ? lines : ['z16|']),
    '',
  ].join('\n');
}

/** Tempo and key guessed from the notes, with the meter assumed. */
export function inferOptions(notes: MidiNote[]): AbcOptions {
  return { tempo: inferTempo(notes), key: inferKey(notes), ...DEFAULT_METER };
}
