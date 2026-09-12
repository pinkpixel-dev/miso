import type { StudioState, VocalMode } from '../../shared/types.ts';

/**
 * The prompt compiler.
 *
 * The guided builder collects a few boxes and a toggle. The model wants a
 * sentence.
 * This is the only place that turns one into the other, and it runs in the
 * browser so the words can be shown before anything is queued: the builder puts
 * the compiled prompt on screen, and what is read there is exactly what the
 * service receives.
 *
 * Only ACE-Step is compiled today, because it is the only family with a task in
 * the registry. MiniMax Music 3, HeartMuLa, and Stable Audio each want a
 * differently shaped prompt, and their rules are written up in
 * DOCS/specs/2026-09-12-suno-studio-design.md ready for the phase that gives
 * them a route to run on. Writing them now would mean four rule sets where only
 * one can be run against anything.
 *
 * Everything else the builder collects is a task parameter in its own right.
 * The tempo goes to bpm, the key to keyscale, the words to lyrics. They are not
 * compiled because they do not need to be, and a value that travels as itself
 * can be read back as itself.
 */

/** Every major and minor key, in the wording ACE-Step's keyscale option takes. */
export const KEYS = [
  'C major',
  'G major',
  'D major',
  'A major',
  'E major',
  'B major',
  'F major',
  'B flat major',
  'E flat major',
  'A flat major',
  'A minor',
  'E minor',
  'B minor',
  'F sharp minor',
  'C sharp minor',
  'D minor',
  'G minor',
  'C minor',
  'F minor',
  'B flat minor',
];

/**
 * The vocal modes the builder offers.
 *
 * Duet is deliberately absent. The models Miso runs do not separate two voices
 * well enough to be worth offering, and a toggle that asks for something the
 * model cannot do reads as a broken feature rather than an honest limit. It
 * stays in VocalMode and in the phrases below because jobs written before this
 * still hold it, and those rows have to keep opening.
 */
export const VOCAL_MODES: { value: VocalMode; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'instrumental', label: 'Instrumental' },
];

/** The phrase each vocal mode contributes to the prompt. */
const VOCAL_PHRASES: Record<VocalMode, string> = {
  female: 'female vocals',
  male: 'male vocals',
  // Only reachable from a job written while the builder still offered duet.
  duet: 'male and female duet vocals',
  instrumental: 'instrumental, no vocals',
};

export const EMPTY_STUDIO: StudioState = {
  style: '',
  mood: '',
  vocalMode: 'female',
  vocalStyle: '',
};

/** Whether this model family has compilation rules, and so a guided mode. */
export function supportsGuided(family: string): boolean {
  return family === 'ace_step';
}

/**
 * Turns builder state into an ACE-Step prompt.
 *
 * ACE-Step reads its prompt as a run of descriptors rather than a sentence, the
 * way its own documented example does ("cinematic synth pop with clear
 * vocals"), so the parts are joined with commas and left in the order a person
 * would say them: what kind of music, how it feels, what it sounds like, who is
 * singing. An empty builder compiles to an empty string, which the form treats
 * as a missing prompt rather than a prompt for nothing.
 */
export function compilePrompt(state: StudioState): string {
  // Nothing is lowercased any more. The chips were title case for the sake of
  // the buttons and were flattened on the way out. A box has no such excuse: a
  // band name or a proper noun is capitalised on purpose, and quietly
  // flattening it would be rewriting somebody's words.
  const described = [state.style, state.mood]
    .map((part) => part.trim())
    .filter((part) => part !== '');

  // Nothing about the music itself means there is no prompt yet. The vocal mode
  // has a value from the moment the form opens, and "female vocals" on its own
  // describes a voice with no song under it, which is not what anybody meant by
  // leaving the rest blank.
  if (described.length === 0) return '';

  const style = state.vocalStyle.trim();
  const phrase = VOCAL_PHRASES[state.vocalMode];
  described.push(
    state.vocalMode === 'instrumental' || style === '' ? phrase : `${style} ${phrase}`,
  );

  return described.join(', ');
}

/** Instrumental means the lyrics box is off, not that its contents are thrown away. */
export function wantsLyrics(state: StudioState): boolean {
  return state.vocalMode !== 'instrumental';
}
