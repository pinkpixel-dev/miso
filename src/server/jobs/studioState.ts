import type { StudioState, VocalMode } from '../../shared/types.ts';

/**
 * The trust boundary for the two things a job carries that no model ever sees:
 * the song title, and the guided builder's own state.
 *
 * Neither is validated against a task's fields, because neither is a parameter,
 * so neither passes through validateParams. That leaves this file as the only
 * thing between a POST body and a row, and the row is read back later and
 * rendered. Every string is therefore bounded, every list is bounded, and the
 * vocal mode is checked against the four values that exist.
 *
 * The limits are deliberately generous. They exist to stop a megabyte of JSON
 * being parked in a column that the UI parses on every poll, not to second
 * guess somebody who likes long genre names.
 */

const MAX_TITLE = 120;
const MAX_CHIPS = 24;
const MAX_CHIP = 60;
const MAX_FREE_TEXT = 400;
const MAX_PROMPT = 4_000;

const VOCAL_MODES: VocalMode[] = ['female', 'male', 'duet', 'instrumental'];

export type StudioResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Absent and empty mean the same thing here: the take is named after its prompt. */
export function parseTitle(raw: unknown): StudioResult<string | undefined> {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (typeof raw !== 'string') return { ok: false, error: 'The title must be text' };

  const title = raw.trim();
  if (title === '') return { ok: true, value: undefined };
  if (title.length > MAX_TITLE) {
    return { ok: false, error: `The title cannot be longer than ${MAX_TITLE} characters` };
  }
  return { ok: true, value: title };
}

/**
 * The prompt as the person wrote it, before the assistant expanded it.
 *
 * Dropped when it matches the prompt that actually ran, because a job holding
 * the same text in two columns would claim an enhancement that never happened,
 * and a lineage view reading it would show a take being derived from itself.
 */
export function parseOriginalPrompt(
  raw: unknown,
  sent: unknown,
): StudioResult<string | undefined> {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (typeof raw !== 'string') return { ok: false, error: 'The original prompt must be text' };

  const original = raw.trim();
  if (original === '') return { ok: true, value: undefined };
  if (original.length > MAX_PROMPT) {
    return { ok: false, error: `The original prompt cannot be longer than ${MAX_PROMPT} characters` };
  }
  if (typeof sent === 'string' && sent.trim() === original) return { ok: true, value: undefined };

  return { ok: true, value: original };
}

function parseChips(raw: unknown, label: string): StudioResult<string[]> {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: `${label} must be a list` };
  if (raw.length > MAX_CHIPS) {
    return { ok: false, error: `${label} cannot have more than ${MAX_CHIPS} entries` };
  }

  const chips: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') return { ok: false, error: `Every ${label} entry must be text` };
    const chip = entry.trim();
    if (chip === '') continue;
    if (chip.length > MAX_CHIP) {
      return { ok: false, error: `A ${label} entry cannot be longer than ${MAX_CHIP} characters` };
    }
    // Picking the same chip twice is a double click, not an instruction.
    if (!chips.includes(chip)) chips.push(chip);
  }

  return { ok: true, value: chips };
}

function parseFreeText(raw: unknown, label: string): StudioResult<string> {
  if (raw === undefined || raw === null) return { ok: true, value: '' };
  if (typeof raw !== 'string') return { ok: false, error: `${label} must be text` };

  const text = raw.trim();
  if (text.length > MAX_FREE_TEXT) {
    return { ok: false, error: `${label} cannot be longer than ${MAX_FREE_TEXT} characters` };
  }
  return { ok: true, value: text };
}

/**
 * Reads the builder state off a request body.
 *
 * An absent state is not an error. It means the job was written from the plain
 * form, which is a supported way to work rather than a degraded one.
 */
export function parseStudioState(raw: unknown): StudioResult<StudioState | undefined> {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'The studio state must be an object' };
  }

  const input = raw as Record<string, unknown>;

  const genre = parseChips(input.genre, 'genre');
  if (!genre.ok) return genre;

  const mood = parseChips(input.mood, 'mood');
  if (!mood.ok) return mood;

  const customStyle = parseFreeText(input.customStyle, 'The custom style');
  if (!customStyle.ok) return customStyle;

  const vocalStyle = parseFreeText(input.vocalStyle, 'The vocal style');
  if (!vocalStyle.ok) return vocalStyle;

  const mode = input.vocalMode;
  if (typeof mode !== 'string' || !VOCAL_MODES.includes(mode as VocalMode)) {
    return { ok: false, error: `The vocal mode must be one of ${VOCAL_MODES.join(', ')}` };
  }

  return {
    ok: true,
    value: {
      genre: genre.value,
      mood: mood.value,
      customStyle: customStyle.value,
      vocalStyle: vocalStyle.value,
      vocalMode: mode as VocalMode,
    },
  };
}
