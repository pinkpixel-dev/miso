import { describe, expect, it } from 'vitest';
import type { MidiNote } from '../../shared/types.ts';
import { maxPolyphony, noteFrequency, notesFrom, previewDuration, voiceGain } from './midiPreview.ts';

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

describe('maxPolyphony', () => {
  it('counts notes that overlap, not notes in a row', () => {
    expect(maxPolyphony([note(60, 0, 1), note(62, 1, 2), note(64, 2, 3)])).toBe(1);
    expect(maxPolyphony([note(60, 0, 3), note(64, 1, 3), note(67, 2, 3)])).toBe(3);
  });

  it('counts a note starting exactly as another ends, which is the quiet way round', () => {
    expect(maxPolyphony([note(60, 0, 1), note(62, 1, 2)])).toBe(1);
  });

  it('is zero for nothing', () => {
    expect(maxPolyphony([])).toBe(0);
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
