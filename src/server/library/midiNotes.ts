import type { MidiNote } from '../../shared/types.ts';

/**
 * MuScriptor's note events, turned into notes.
 *
 * The model answers with a flat event list rather than notes, as a JSON string
 * in the response's `text` field. Recorded from the running container on
 * 2026-09-19:
 *
 *   {"type":"start","pitch":68,"start_time":0.67,"index":0,"instrument":"acoustic_piano"}
 *   {"type":"end","end_time":1.36,"start_event_index":0}
 *
 * A start carries its own `index`, and the end that closes it points back at
 * that index through `start_event_index`. The two are not adjacent and do not
 * arrive in order, so pairing them means holding the open starts in a map
 * rather than walking in step.
 *
 * `leadInSeconds` is the silence Miso put in front of the source so the model
 * would not drop a note at t=0. It comes back off every time here, once, so
 * that nothing downstream has to know the padding happened.
 */

interface StartEvent {
  pitch: number;
  start: number;
  instrument: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberAt(row: Record<string, unknown>, key: string): number | undefined {
  const value = row[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Returns the notes, in the order they start.
 *
 * Returns nothing for text that is absent, is not JSON, or is JSON that is not
 * an event list. A transcription whose events cannot be read still has a MIDI
 * file worth keeping, so this never throws: the caller stores an artifact with
 * no preview rather than failing the job.
 */
export function parseMidiNotes(text: string | undefined, leadInSeconds = 0): MidiNote[] {
  if (text === undefined || text.trim() === '') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const open = new Map<number, StartEvent>();
  const notes: MidiNote[] = [];

  for (const entry of parsed) {
    if (!isRecord(entry)) continue;

    if (entry.type === 'start') {
      const index = numberAt(entry, 'index');
      const pitch = numberAt(entry, 'pitch');
      const start = numberAt(entry, 'start_time');
      if (index === undefined || pitch === undefined || start === undefined) continue;

      open.set(index, {
        pitch,
        start,
        instrument: typeof entry.instrument === 'string' ? entry.instrument : '',
      });
      continue;
    }

    if (entry.type !== 'end') continue;

    const index = numberAt(entry, 'start_event_index');
    const end = numberAt(entry, 'end_time');
    if (index === undefined || end === undefined) continue;

    const started = open.get(index);
    if (started === undefined) continue;
    open.delete(index);

    notes.push({
      pitch: started.pitch,
      // Clamped at zero because the lead-in is removed here and a note the
      // model placed inside the padding would otherwise start before the take.
      start: Math.max(0, started.start - leadInSeconds),
      end: Math.max(0, end - leadInSeconds),
      instrument: started.instrument,
    });
  }

  return notes.sort((left, right) => left.start - right.start || left.pitch - right.pitch);
}

/** Where the last note stops, which is the length worth showing. */
export function notesDuration(notes: MidiNote[]): number | undefined {
  if (notes.length === 0) return undefined;
  return notes.reduce((longest, note) => Math.max(longest, note.end), 0);
}
