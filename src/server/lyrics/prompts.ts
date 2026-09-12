import type { StudioState } from '../../shared/types.ts';

/**
 * What Miso asks the language model for, and how it reads the answer back.
 *
 * Both system prompts end by saying what not to include. Left to itself a chat
 * model explains its own work, and a paragraph of commentary pasted into a
 * lyrics box becomes a verse the singer tries to sing.
 */

export const LYRICS_SYSTEM = `You are an expert songwriter. Given a topic, genre, and mood, write original song lyrics.

Begin your answer with a single line in the form:
Title: <the song title>

Then write the lyrics, formatted with standard structural tags on their own lines, for example:
[Verse 1]
[Pre-Chorus]
[Chorus]
[Verse 2]
[Chorus]
[Bridge]
[Outro]

Keep rhythms singable, rhymes natural, and line lengths balanced. Output the title line and the lyrics only. Do not explain your choices, do not add commentary, and do not wrap the answer in code fences.`;

export const ENHANCE_SYSTEM = `You expand short music descriptions into prompts for a music generation model.

Rewrite what you are given as a single line of comma separated descriptors covering genre, instrumentation, production texture, tempo feel, and vocal character. Keep every element the person specified and add detail around it. Never contradict what they asked for, and never add lyrics, a title, or a song structure.

Output the one line only. Do not explain it, do not label it, and do not wrap it in quotes or code fences.`;

/** The description of the song, as the person set the builder up. */
export function describeStudio(state: StudioState | undefined, prompt: string): string {
  if (!state) return prompt;

  const lines: string[] = [`Current prompt: ${prompt}`];
  if (state.genre.length > 0) lines.push(`Genre: ${state.genre.join(', ')}`);
  if (state.mood.length > 0) lines.push(`Mood: ${state.mood.join(', ')}`);
  if (state.customStyle !== '') lines.push(`Style notes: ${state.customStyle}`);
  lines.push(
    state.vocalMode === 'instrumental'
      ? 'Vocals: none, this is an instrumental'
      : `Vocals: ${state.vocalMode}${state.vocalStyle === '' ? '' : `, ${state.vocalStyle}`}`,
  );

  return lines.join('\n');
}

/** A fence a model added despite being asked not to. */
function stripFences(text: string): string {
  const fenced = /^\s*```[a-z]*\n([\s\S]*?)\n?```\s*$/i.exec(text);
  return fenced?.[1] ?? text;
}

export interface WrittenLyrics {
  title?: string;
  lyrics: string;
}

/**
 * Splits the title line off the lyrics.
 *
 * A model that ignored the title instruction still wrote usable lyrics, so a
 * missing title is not an error. It means the title box is left alone.
 */
export function readLyrics(answer: string): WrittenLyrics {
  const text = stripFences(answer).trim();
  const [first, ...rest] = text.split('\n');

  const titled = /^\s*(?:title|song title)\s*[:\-]\s*(.+?)\s*$/i.exec(first ?? '');
  if (!titled) return { lyrics: text };

  // Quotes around a title are the model's punctuation, not part of the name.
  const title = (titled[1] ?? '').replace(/^["'`]|["'`]$/g, '').trim();
  const lyrics = rest.join('\n').trim();

  if (lyrics === '') return { lyrics: text };
  return { title: title === '' ? undefined : title, lyrics };
}

/** One line, however many the model actually sent. */
export function readPrompt(answer: string): string {
  return stripFences(answer)
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join(', ')
    .replace(/^["'`]|["'`]$/g, '')
    .trim();
}
