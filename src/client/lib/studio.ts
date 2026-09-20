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
 * Every generation family gets its own rule, because they do not read a prompt
 * the same way. ACE-Step wants a run of descriptors, MiniMax wants a production
 * caption, HeartMuLa wants a short summary with the detail in its tags, and
 * Stable Audio wants the instruments and the texture. The shapes come from
 * DOCS/specs/2026-09-12-suno-studio-design.md and from each family's own manual
 * under DOCS/audio.cpp/docs.
 *
 * Everything else the builder collects is a task parameter in its own right.
 * The tempo goes to bpm, the key to keyscale, the words to lyrics. They are not
 * compiled because they do not need to be, and a value that travels as itself
 * can be read back as itself. HeartMuLa's tags are the exception that proves
 * it: they carry what the other families put in the prompt, so the builder
 * writes them rather than asking for the same words a second time.
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

/** The families the builder knows how to write a prompt for. */
const GUIDED_FAMILIES = new Set(['ace_step', 'minimax_music3', 'heartmula', 'stable_audio', 'yue2']);

/** Whether this model family has compilation rules, and so a guided mode. */
export function supportsGuided(family: string): boolean {
  return GUIDED_FAMILIES.has(family);
}

/** What a family can do with a voice, as its task in the registry declares it. */
export type VocalSupport = 'both' | 'required' | 'never';

/**
 * The vocal mode actually in force, once the family has had its say.
 *
 * A family that cannot sing is instrumental whatever the toggle says, and one
 * that cannot do an instrumental falls back to the mode the builder opens on.
 * The builder locks its control to this value rather than hiding it, so
 * somebody who wonders where the vocals went can read the answer. See
 * DOCS/MEMORY.md.
 */
export function effectiveVocalMode(state: StudioState, vocals: VocalSupport): VocalMode {
  if (vocals === 'never') return 'instrumental';
  if (vocals === 'required' && state.vocalMode === 'instrumental') return EMPTY_STUDIO.vocalMode;
  return state.vocalMode;
}

/** A compiled builder: the prompt, and any task params the builder writes itself. */
export interface Compiled {
  prompt: string;
  /** Keyed by registry field name. Only HeartMuLa's tags land here today. */
  params: Record<string, string>;
}

/**
 * Turns builder state into the prompt its family reads, and anything else that
 * family needs written for it.
 *
 * An empty builder compiles to an empty string whatever the family, which the
 * form treats as a missing prompt rather than as a prompt for nothing. Nothing
 * is lowercased on the way out: a band name or a proper noun is capitalised on
 * purpose, and flattening it would be rewriting somebody's words.
 */
export function compile(
  state: StudioState,
  family: string,
  vocals: VocalSupport = 'both',
): Compiled {
  const style = state.style.trim();
  const mood = state.mood.trim();
  const voice = state.vocalStyle.trim();
  const mode = effectiveVocalMode(state, vocals);

  // Nothing about the music itself means there is no prompt yet. The vocal mode
  // has a value from the moment the form opens, and "female vocals" on its own
  // describes a voice with no song under it, which is not what anybody meant by
  // leaving the rest blank.
  if (style === '' && mood === '') return { prompt: '', params: {} };

  switch (family) {
    case 'minimax_music3':
      return { prompt: minimaxCaption(style, mood, voice, mode), params: {} };
    case 'heartmula':
      return {
        prompt: heartmulaSummary(style, mood),
        params: { tags: heartmulaTags(style, mood, voice, mode) },
      };
    case 'stable_audio':
      return { prompt: stableAudioSentence(style, mood), params: {} };
    case 'yue2':
      return { prompt: yue2Style(style, mood, voice, mode), params: {} };
    default:
      return { prompt: aceStepDescriptors(style, mood, voice, mode), params: {} };
  }
}

/** The prompt on its own, for the preview and for anything that sends nothing else. */
export function compilePrompt(
  state: StudioState,
  family = 'ace_step',
  vocals: VocalSupport = 'both',
): string {
  return compile(state, family, vocals).prompt;
}

/**
 * "a" or "an", agreeing with the word that follows.
 *
 * The families that want a sentence open with an article, and the word after it
 * is whatever somebody typed in the mood box. "A ambient song" is the kind of
 * thing that reads as broken in a prompt shown back to the person who wrote it.
 */
function article(next: string, capital = false): string {
  // The sound decides this, not the letter. "Euphoric" and "unique" open on a
  // "you" and take "a", while "upbeat" and "urban" do not and take "an".
  const youSound = /^(eu|u[^aeiou][aeiou])/i.test(next);
  const vowel = /^[aeiou]/i.test(next) && !youSound;

  if (capital) return vowel ? 'An' : 'A';
  return vowel ? 'an' : 'a';
}

/** The voice, as a phrase, or an empty string when nobody is singing. */
function voicePhrase(voice: string, mode: VocalMode): string {
  if (mode === 'instrumental') return '';
  return [voice, VOCAL_PHRASES[mode]].filter((part) => part !== '').join(' ');
}

/**
 * ACE-Step reads a run of descriptors rather than a sentence, the way its own
 * documented example does ("cinematic synth pop with clear vocals"), so the
 * parts are joined with commas in the order a person would say them: what kind
 * of music, how it feels, what it sounds like, and who is singing.
 */
/**
 * YuE2 wants a comma-separated style prompt that opens with the language.
 *
 * Close to ACE-Step's shape and not the same: every example upstream begins
 * with the language of the lyrics, and leaving it off is how you get a song
 * sung in the wrong one. English is assumed because the model ships English and
 * Chinese and the builder has no language control, so somebody wanting Mandarin
 * types it into the style box in custom mode.
 *
 * The production phrase is on the end for the same reason MiniMax has one: a
 * bare list of descriptors with no recording quality in it tends to come back
 * sounding like a demo.
 */
function yue2Style(style: string, mood: string, voice: string, mode: VocalMode): string {
  const described = ['English', style, mood].filter((part) => part !== '');
  described.push(mode === 'instrumental' ? VOCAL_PHRASES[mode] : voicePhrase(voice, mode));
  described.push('polished studio production');
  return described.join(', ');
}

function aceStepDescriptors(style: string, mood: string, voice: string, mode: VocalMode): string {
  const described = [style, mood].filter((part) => part !== '');
  described.push(mode === 'instrumental' ? VOCAL_PHRASES[mode] : voicePhrase(voice, mode));
  return described.join(', ');
}

/**
 * MiniMax wants a production caption: a sentence about the recording as much as
 * about the song, which is how its own documented example reads.
 */
function minimaxCaption(style: string, mood: string, voice: string, mode: VocalMode): string {
  const described = [mood, style].filter((part) => part !== '').join(' ');
  const opening = described === '' ? 'A song' : `${article(described, true)} ${described} song`;

  if (mode === 'instrumental') {
    return `${opening}, instrumental with no vocals, recorded with polished studio production.`;
  }
  return `${opening} featuring ${voicePhrase(voice, mode)}, recorded with polished studio production.`;
}

/** HeartMuLa's prompt is a short summary. The detail goes in the tags. */
function heartmulaSummary(style: string, mood: string): string {
  const described = [mood, style].filter((part) => part !== '').join(' ');
  return described === '' ? 'a song' : `${article(described)} ${described} song`;
}

/**
 * HeartMuLa's tags are comma separated descriptors, which its manual marks
 * required and lowercases into tag tokens itself. The words therefore go across
 * as they were typed rather than as a sentence.
 */
function heartmulaTags(style: string, mood: string, voice: string, mode: VocalMode): string {
  const tags = [style, mood].filter((part) => part !== '');
  tags.push(mode === 'instrumental' ? 'instrumental' : voicePhrase(voice, mode));
  return tags.join(', ');
}

/**
 * Stable Audio takes a description of the sound. It never sings, so the vocal
 * mode has nothing to add and the sentence stays about the instruments.
 */
function stableAudioSentence(style: string, mood: string): string {
  return [style, mood, 'instrumental, no vocals'].filter((part) => part !== '').join(', ');
}

/** Instrumental means the lyrics box is off, not that its contents are thrown away. */
export function wantsLyrics(state: StudioState, vocals: VocalSupport = 'both'): boolean {
  return effectiveVocalMode(state, vocals) !== 'instrumental';
}
