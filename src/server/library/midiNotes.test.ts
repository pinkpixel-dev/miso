import { describe, expect, it } from 'vitest';
import { notesDuration, parseMidiNotes } from './midiNotes.ts';

/** The shape MuScriptor really returns. See fixtures/README.md. */
function events(...rows: unknown[]): string {
  return JSON.stringify(rows);
}

describe('parseMidiNotes', () => {
  it('pairs a start with the end that points back at it', () => {
    const notes = parseMidiNotes(
      events(
        { type: 'start', pitch: 68, start_time: 0.67, index: 0, instrument: 'acoustic_piano' },
        { type: 'end', end_time: 1.36, start_event_index: 0 },
      ),
    );

    expect(notes).toEqual([{ pitch: 68, start: 0.67, end: 1.36, instrument: 'acoustic_piano' }]);
  });

  it('pairs by index rather than by order, because ends interleave', () => {
    // Two notes overlap and the second one ends first. Walking in step would
    // give the first note the second one's end time.
    const notes = parseMidiNotes(
      events(
        { type: 'start', pitch: 60, start_time: 0, index: 0, instrument: 'piano' },
        { type: 'start', pitch: 64, start_time: 0.1, index: 1, instrument: 'piano' },
        { type: 'end', end_time: 0.4, start_event_index: 1 },
        { type: 'end', end_time: 2, start_event_index: 0 },
      ),
    );

    expect(notes).toEqual([
      { pitch: 60, start: 0, end: 2, instrument: 'piano' },
      { pitch: 64, start: 0.1, end: 0.4, instrument: 'piano' },
    ]);
  });

  it('takes the lead-in silence back off every time', () => {
    const notes = parseMidiNotes(
      events(
        { type: 'start', pitch: 60, start_time: 1.5, index: 0, instrument: 'piano' },
        { type: 'end', end_time: 2.25, start_event_index: 0 },
      ),
      1,
    );

    expect(notes).toEqual([{ pitch: 60, start: 0.5, end: 1.25, instrument: 'piano' }]);
  });

  it('never places a note before the take starts', () => {
    // The model can put a note inside the padding. Removing the lead-in would
    // otherwise give it a negative time.
    const notes = parseMidiNotes(
      events(
        { type: 'start', pitch: 60, start_time: 0.2, index: 0, instrument: 'piano' },
        { type: 'end', end_time: 0.6, start_event_index: 0 },
      ),
      1,
    );

    expect(notes[0]?.start).toBe(0);
  });

  it('drops a start that never ends, and an end with no start', () => {
    const notes = parseMidiNotes(
      events(
        { type: 'start', pitch: 60, start_time: 0, index: 0, instrument: 'piano' },
        { type: 'end', end_time: 1, start_event_index: 99 },
      ),
    );

    expect(notes).toEqual([]);
  });

  it('returns nothing rather than throwing on text it cannot read', () => {
    // A transcription with unreadable events still has a MIDI file worth
    // keeping, so this path must not fail the job.
    expect(parseMidiNotes(undefined)).toEqual([]);
    expect(parseMidiNotes('')).toEqual([]);
    expect(parseMidiNotes('not json at all')).toEqual([]);
    expect(parseMidiNotes('{"type":"start"}')).toEqual([]);
    expect(parseMidiNotes(events({ type: 'start' }, 'a string', 7, null))).toEqual([]);
  });
});

describe('notesDuration', () => {
  it('is where the last note stops, not where the last one starts', () => {
    const notes = parseMidiNotes(
      events(
        { type: 'start', pitch: 60, start_time: 0, index: 0, instrument: 'p' },
        { type: 'start', pitch: 62, start_time: 1, index: 1, instrument: 'p' },
        { type: 'end', end_time: 5, start_event_index: 0 },
        { type: 'end', end_time: 1.5, start_event_index: 1 },
      ),
    );

    expect(notesDuration(notes)).toBe(5);
  });

  it('is undefined when nothing was transcribed', () => {
    expect(notesDuration([])).toBeUndefined();
  });
});
