import { describe, expect, it } from 'vitest';
import type { MidiNote } from '../../shared/types.ts';
import { inferKey, inferOptions, inferTempo, notesToAbc, skyline } from './notesToAbc.ts';

function note(pitch: number, start: number, end: number): MidiNote {
  return { pitch, start, end, instrument: 'voice' };
}

/** A melody as [pitch, beats] pairs, laid end to end at a given beat length. */
function melody(pairs: [number, number][], beatSeconds = 0.5): MidiNote[] {
  let at = 0;
  return pairs.map(([pitch, beats]) => {
    const made = note(pitch, at, at + beats * beatSeconds);
    at += beats * beatSeconds;
    return made;
  });
}

const TWINKLE: [number, number][] = [
  [60, 1], [60, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2],
  [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 2],
];

/** The body lines, without the header. */
function body(abc: string): string {
  return abc.split('\n').filter((line) => /^[A-Ga-gz^_=]/.test(line)).join('\n');
}

describe('turning a transcription into a melody', () => {
  it('writes Twinkle Twinkle as the score that was probed by hand', () => {
    // This is the headline test. The melody handed to YuE2 on 2026-09-20 was
    // written by hand as c4c4g4g4|a4a4g8|f4f4e4e4|d4d4c8, and the take sang
    // Twinkle Twinkle. Deriving the same structure from note events is what
    // says this converter produces something the model actually reads. The
    // case here is an octave lower, because the notes are built at C4.
    const abc = notesToAbc(melody(TWINKLE), inferOptions(melody(TWINKLE)));

    expect(body(abc)).toBe('C4C4G4G4|A4A4G8|F4F4E4E4|D4D4C8|');
    expect(abc).toContain('M:4/4  L:1/16  Q:1/4=120');
    expect(abc).toContain('K:C');
    // One voice and no chord symbols, which is what the model card asks for.
    // Chord symbols are quoted strings in the body, so the body is what gets
    // checked: the voice header carries quotes of its own and always will.
    expect(abc).toContain('V: Vocal');
    expect(body(abc)).not.toContain('"');
  });
});

describe('skyline', () => {
  it('keeps a repeated note as two notes', () => {
    // The bug this test exists for: merging adjacent slices at one pitch
    // turned C C into a single long C and deleted half of Twinkle Twinkle.
    const line = skyline([note(60, 0, 0.5), note(60, 0.5, 1)]);

    expect(line).toHaveLength(2);
    expect(line.map((entry) => [entry.start, entry.end])).toEqual([
      [0, 0.5],
      [0.5, 1],
    ]);
  });

  it('keeps the higher note where two overlap', () => {
    const line = skyline([note(60, 0, 1), note(72, 0, 1)]);

    expect(line).toHaveLength(1);
    expect(line[0]?.pitch).toBe(72);
  });

  it('cuts a lower note where a higher one covers part of it', () => {
    const line = skyline([note(60, 0, 2), note(72, 1, 2)]);

    expect(line.map((entry) => entry.pitch)).toEqual([60, 72]);
    expect(line[0]?.end).toBe(1);
  });

  it('joins the slices of one note back together', () => {
    // A note cut into pieces by others starting and stopping under it is still
    // one note, unlike the repeat above.
    const line = skyline([note(72, 0, 3), note(60, 1, 2)]);

    expect(line).toHaveLength(1);
    expect(line[0]).toMatchObject({ pitch: 72, start: 0, end: 3 });
  });

  it('answers with nothing for nothing', () => {
    expect(skyline([])).toEqual([]);
  });
});

describe('inferTempo', () => {
  it('reads a beat of half a second as 120', () => {
    expect(inferTempo(melody(TWINKLE))).toBe(120);
  });

  it('folds a very fast reading down into range', () => {
    // Sixteen notes at 0.125 s each is 480 beats a minute read literally.
    // Halved twice it is 120, which is the same music written sensibly.
    const fast = melody(Array.from({ length: 16 }, () => [60, 1] as [number, number]), 0.125);

    expect(inferTempo(fast)).toBe(120);
  });

  it('ignores a held note rather than letting it drag the answer', () => {
    // The median is what makes this work. One four second gap among twelve
    // half second ones would pull a mean a long way.
    const withHold = melody(
      [[60, 1], [62, 1], [64, 1], [65, 8], [67, 1], [69, 1], [71, 1], [72, 1]],
    );

    expect(inferTempo(withHold)).toBe(120);
  });

  it('falls back to 120 when there is nothing to measure', () => {
    expect(inferTempo([])).toBe(120);
    expect(inferTempo([note(60, 0, 1)])).toBe(120);
  });
});

describe('inferKey', () => {
  it('reads a C major scale as C', () => {
    expect(inferKey(melody([[60, 1], [62, 1], [64, 1], [65, 1], [67, 1], [69, 1], [71, 1], [72, 2]]))).toBe('C');
  });

  it('reads a key with sharps in it', () => {
    // D major, leaning on its own tonic and dominant so the profile has
    // something to correlate against.
    const tune = melody([[62, 2], [66, 1], [69, 2], [66, 1], [62, 2], [61, 1], [62, 4]]);

    expect(inferKey(tune)).toBe('D');
  });

  it('weights by how long a note sounds, not how often it appears', () => {
    // Three long notes spelling a C major triad against five short ones from
    // outside it. By count the strangers win five to three. By duration the
    // triad wins by two orders of magnitude, and the triad is the answer.
    const tune = [
      note(60, 0, 4),
      note(64, 4, 8),
      note(67, 8, 12),
      note(61, 12, 12.05),
      note(63, 12.05, 12.1),
      note(66, 12.1, 12.15),
      note(68, 12.15, 12.2),
      note(70, 12.2, 12.25),
    ];

    expect(inferKey(tune)).toBe('C');
  });

  it('falls back to C for nothing', () => {
    expect(inferKey([])).toBe('C');
  });
});

describe('the ABC document', () => {
  const plain = { tempo: 120, beatsPerBar: 4, beatUnit: 4, key: 'C' };

  it('writes a rest where the melody is silent', () => {
    // Half a second at 120 is a quarter note, which is four sixteenths.
    const abc = notesToAbc([note(60, 1, 1.5)], plain);

    expect(body(abc)).toBe('z8C4z4|');
  });

  it('ties a note across a bar line instead of overflowing the bar', () => {
    // A bar that does not add up is the likeliest way to make a parser give up
    // on the whole document.
    const abc = notesToAbc([note(60, 1.5, 2.5)], plain);

    expect(body(abc)).toBe('z12C4-|C4z12|');
  });

  it('pads the last bar so the document adds up', () => {
    const abc = notesToAbc([note(60, 0, 0.25)], plain);

    expect(body(abc)).toBe('C2z14|');
  });

  it('marks octaves above and below middle C', () => {
    const abc = notesToAbc([note(48, 0, 0.5), note(60, 0.5, 1), note(72, 1, 1.5), note(84, 1.5, 2)], plain);

    expect(body(abc)).toBe("C,4C4c4c'4|");
  });

  it('leaves a note the key already sharpens unmarked', () => {
    // F sharp in G major is written F, because the key signature is doing the
    // work. Restating it on every note is what a converter that ignores the
    // key produces.
    const abc = notesToAbc([note(66, 0, 0.5)], { ...plain, key: 'G' });

    expect(body(abc)).toBe('F4z12|');
    expect(abc).toContain('K:G');
  });

  it('marks a note the key does not cover', () => {
    const abc = notesToAbc([note(61, 0, 0.5)], plain);

    expect(body(abc)).toBe('^C4z12|');
  });

  it('marks an accidental once per bar, then cancels it in the next', () => {
    // An accidental lasts to the end of its bar, so the second C sharp needs no
    // mark and the natural C in the next bar needs none either.
    const abc = notesToAbc(
      [note(61, 0, 0.5), note(61, 0.5, 1), note(60, 2, 2.5)],
      plain,
    );

    expect(body(abc)).toBe('^C4C4z8|C4z12|');
  });

  it('honours a meter that is not four four', () => {
    const abc = notesToAbc(melody([[60, 1], [62, 1], [64, 1], [65, 1], [67, 1], [69, 1]]), {
      ...plain,
      beatsPerBar: 3,
    });

    expect(abc).toContain('M:3/4');
    expect(body(abc)).toBe('C4D4E4|F4G4A4|');
  });

  it('writes a valid empty document rather than a broken one', () => {
    const abc = notesToAbc([], plain);

    expect(abc).toContain('X:1');
    expect(body(abc)).toBe('z16|');
  });
});
