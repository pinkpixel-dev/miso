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
/** One descriptor box holds what a row of chips plus a free text box used to. */
const MAX_DESCRIPTOR = 600;
/** Only reached by a job written before the boxes replaced the chips. */
const MAX_LEGACY_CHIPS = 24;
const MAX_FREE_TEXT = 400;
const MAX_PROMPT = 4_000;

/**
 * Every vocal mode a row can hold, which is one more than the builder offers.
 *
 * `duet` is no longer a choice on the form, but rows written while it was one
 * are read back through here, so refusing it now would make those jobs fail to
 * parse on the read path and lose the record of how their take was made.
 */
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

/**
 * One descriptor box, from either shape it can arrive in.
 *
 * The builder collected chips until 2026-09-12, so genre and mood were lists.
 * They are text boxes now and arrive as strings. A list is joined rather than
 * refused, because the rows it wrote are still in the database and still open
 * in the builder. That is the only reason this function knows about arrays, and
 * nothing writes one any more.
 */
function parseDescriptor(raw: unknown, label: string): StudioResult<string> {
  if (raw === undefined || raw === null) return { ok: true, value: '' };

  let text: string;

  if (Array.isArray(raw)) {
    if (raw.length > MAX_LEGACY_CHIPS) {
      return { ok: false, error: `${label} cannot have more than ${MAX_LEGACY_CHIPS} entries` };
    }

    const parts: string[] = [];
    for (const entry of raw) {
      if (typeof entry !== 'string') {
        return { ok: false, error: `Every ${label} entry must be text` };
      }
      const part = entry.trim();
      // The same chip twice was a double click, not an instruction.
      if (part !== '' && !parts.includes(part)) parts.push(part);
    }
    text = parts.join(', ');
  } else if (typeof raw === 'string') {
    text = raw.trim();
  } else {
    return { ok: false, error: `${label} must be text` };
  }

  if (text.length > MAX_DESCRIPTOR) {
    return { ok: false, error: `${label} cannot be longer than ${MAX_DESCRIPTOR} characters` };
  }
  return { ok: true, value: text };
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
 * Reads the builder state, both off a request body and back off a stored row.
 *
 * An absent state is not an error. It means the job was written from the plain
 * form, which is a supported way to work rather than a degraded one.
 *
 * Running on the read path as well is what lets the shape change without a data
 * migration. A row written by the chip builder holds lists and a customStyle
 * where the builder now wants one string, and `toJob` sends it through here so
 * the rest of the app only ever sees the current shape.
 */
export function parseStudioState(raw: unknown): StudioResult<StudioState | undefined> {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'The studio state must be an object' };
  }

  const input = raw as Record<string, unknown>;

  // `style` is the box. `genre` is what the chip builder wrote and
  // `customStyle` is the free text box that sat under it, so both fold into
  // style in the order they appeared on screen.
  const style = parseDescriptor(input.style ?? input.genre, 'The style');
  if (!style.ok) return style;

  const legacyCustom = parseDescriptor(input.customStyle, 'The custom style');
  if (!legacyCustom.ok) return legacyCustom;

  const combined = [style.value, legacyCustom.value].filter((part) => part !== '').join(', ');
  if (combined.length > MAX_DESCRIPTOR) {
    return { ok: false, error: `The style cannot be longer than ${MAX_DESCRIPTOR} characters` };
  }

  const mood = parseDescriptor(input.mood, 'The mood');
  if (!mood.ok) return mood;

  const vocalStyle = parseFreeText(input.vocalStyle, 'The vocal style');
  if (!vocalStyle.ok) return vocalStyle;

  const mode = input.vocalMode;
  if (typeof mode !== 'string' || !VOCAL_MODES.includes(mode as VocalMode)) {
    return { ok: false, error: `The vocal mode must be one of ${VOCAL_MODES.join(', ')}` };
  }

  return {
    ok: true,
    value: {
      style: combined,
      mood: mood.value,
      vocalStyle: vocalStyle.value,
      vocalMode: mode as VocalMode,
    },
  };
}
