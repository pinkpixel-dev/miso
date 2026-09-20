import { describe, expect, it } from 'vitest';
import type { MidiNote } from '../../shared/types.ts';
import { noteFrequency, notesFrom, previewDuration, typicalPolyphony, voiceGain } from './midiPreview.ts';

function note(pitch: number, start: number, end: number): MidiNote {
  return { pitch, start, end, instrument: 'piano' };
}

describe('noteFrequency', () => {
  it('puts A4 at 440 and octaves where they belong', () => {
    expect(noteFrequency(69)).toBe(440);
    expect(noteFrequency(81)).toBeCloseTo(880, 6);
    expect(noteFrequency(57)).toBeCloseTo(220, 6);
  });

  it('puts middle C near 261.63', () => {
    expect(noteFrequency(60)).toBeCloseTo(261.626, 3);
  });
});

describe('typicalPolyphony', () => {
  it('counts notes that overlap, not notes in a row', () => {
    expect(typicalPolyphony([note(60, 0, 1), note(62, 1, 2), note(64, 2, 3)])).toBe(1);
    expect(typicalPolyphony([note(60, 0, 3), note(64, 0, 3), note(67, 0, 3)])).toBe(3);
  });

  it('counts a note starting exactly as another ends, which is the quiet way round', () => {
    expect(typicalPolyphony([note(60, 0, 1), note(62, 1, 2)])).toBe(1);
  });

  it('ignores a spike too short to hear, which is the bug it exists for', () => {
    // A minute of a plain two note texture, then the stutter MuScriptor can
    // end a long take on: hundreds of duplicate hits on one instant. The old
    // maximum answered 502 here and put the whole minute at -38 dBFS.
    const music = [note(60, 0, 60), note(64, 0, 60)];
    const stutter = Array.from({ length: 500 }, () => note(35, 59.9, 59.91));

    expect(typicalPolyphony([...music, ...stutter])).toBe(2);
  });

  it('still hears a passage that is genuinely dense for long enough', () => {
    const sparse = [note(60, 0, 10)];
    const dense = Array.from({ length: 8 }, (_, step) => note(60 + step, 2, 9));

    expect(typicalPolyphony([...sparse, ...dense])).toBe(9);
  });

  it('weighs a count by how long it lasts, not by how many notes carry it', () => {
    // Two voices for nine seconds, six for one. The quantile follows the time.
    const held = [note(60, 0, 10), note(64, 0, 10)];
    const brief = Array.from({ length: 4 }, (_, step) => note(70 + step, 9, 10));

    expect(typicalPolyphony([...held, ...brief], 0.5)).toBe(2);
  });

  it('answers one when every note is instantaneous, rather than nothing', () => {
    expect(typicalPolyphony([note(60, 1, 1), note(64, 2, 2)])).toBe(1);
  });

  it('is zero for nothing', () => {
    expect(typicalPolyphony([])).toBe(0);
  });
});

describe('voiceGain', () => {
  it('backs off as more voices pile up, without going silent', () => {
    expect(voiceGain(1)).toBeCloseTo(0.5, 6);
    expect(voiceGain(4)).toBeCloseTo(0.25, 6);
    expect(voiceGain(16)).toBeCloseTo(0.125, 6);
  });

  it('never divides by zero on an empty transcription', () => {
    expect(voiceGain(0)).toBeCloseTo(0.5, 6);
  });
});

describe('previewDuration', () => {
  it('is where the last note stops, not where the last one starts', () => {
    expect(previewDuration([note(60, 0, 9), note(62, 5, 6)])).toBe(9);
    expect(previewDuration([])).toBe(0);
  });
});

describe('notesFrom', () => {
  it('drops what has finished and rebases what is left', () => {
    expect(notesFrom([note(60, 0, 1), note(62, 2, 3)], 1.5)).toEqual([
      { pitch: 62, start: 0.5, end: 1.5, instrument: 'piano' },
    ]);
  });

  it('keeps a note already sounding, starting it immediately', () => {
    expect(notesFrom([note(60, 0, 4)], 2)).toEqual([
      { pitch: 60, start: 0, end: 2, instrument: 'piano' },
    ]);
  });
});
