import { describe, expect, it } from 'vitest';
import type { StudioState } from '../../shared/types.ts';
import {
  EMPTY_STUDIO,
  compile,
  compilePrompt,
  effectiveVocalMode,
  supportsGuided,
  vocalModesFor,
  wantsLyrics,
} from './studio.ts';

function state(patch: Partial<StudioState>): StudioState {
  return { ...EMPTY_STUDIO, ...patch };
}

describe('compilePrompt', () => {
  it('reads as the kind of music, how it feels, then who is singing', () => {
    const prompt = compilePrompt(
      state({ style: 'synthwave', mood: 'dreamy', vocalStyle: 'airy', vocalMode: 'female' }),
    );

    expect(prompt).toBe('synthwave, dreamy, airy female vocals');
  });

  it('leaves every word exactly as it was typed', () => {
    // The chips were lowercased on the way out because they were title case for
    // the buttons. Boxes have no such excuse, and flattening a proper noun
    // would be rewriting somebody's words.
    const prompt = compilePrompt(
      state({ style: 'Lo-Fi, in the style of Chopin', vocalMode: 'instrumental' }),
    );

    expect(prompt).toBe('Lo-Fi, in the style of Chopin, instrumental, no vocals');
  });

  it('keeps the style box and the mood box in the order they appear', () => {
    expect(compilePrompt(state({ style: 'house', mood: 'euphoric', vocalMode: 'male' }))).toBe(
      'house, euphoric, male vocals',
    );
  });

  it('says there are no vocals rather than saying nothing about them', () => {
    expect(compilePrompt(state({ style: 'ambient', vocalMode: 'instrumental' }))).toBe(
      'ambient, instrumental, no vocals',
    );
  });

  it('still compiles a duet stored by an older job', () => {
    // The builder no longer offers duet, because the models cannot hold two
    // voices apart. Rows written while it did are still in the database and
    // still have to compile to the prompt that produced their take.
    expect(compilePrompt(state({ style: 'folk', vocalMode: 'duet' }))).toBe(
      'folk, male and female duet vocals',
    );
  });

  it('compiles nothing from a builder nobody has touched', () => {
    // The vocal mode has a value from the moment the form opens, and a prompt
    // reading "female vocals" describes a voice with no song under it.
    expect(compilePrompt(EMPTY_STUDIO)).toBe('');
    expect(compilePrompt(state({ vocalStyle: 'raspy' }))).toBe('');
  });

  it('ignores a box holding only whitespace', () => {
    expect(compilePrompt(state({ style: 'pop', mood: '   ' }))).toBe('pop, female vocals');
  });
});

describe('wantsLyrics', () => {
  it('is false only for an instrumental', () => {
    expect(wantsLyrics(state({ vocalMode: 'instrumental' }))).toBe(false);
    expect(wantsLyrics(state({ vocalMode: 'duet' }))).toBe(true);
  });
});

describe('supportsGuided', () => {
  it('covers every generation family, and nothing else', () => {
    expect(supportsGuided('ace_step')).toBe(true);
    expect(supportsGuided('minimax_music3')).toBe(true);
    expect(supportsGuided('heartmula')).toBe(true);
    expect(supportsGuided('stable_audio')).toBe(true);
    expect(supportsGuided('yue2')).toBe(true);
    expect(supportsGuided('htdemucs')).toBe(false);
  });
});

describe('effectiveVocalMode', () => {
  it('forces an instrumental on a family that cannot sing', () => {
    expect(effectiveVocalMode(state({ vocalMode: 'female' }), 'never')).toBe('instrumental');
  });

  it('forces a voice on a family that cannot do an instrumental', () => {
    expect(effectiveVocalMode(state({ vocalMode: 'instrumental' }), 'required')).toBe('female');
    // A voice that was already chosen is left alone rather than reset.
    expect(effectiveVocalMode(state({ vocalMode: 'male' }), 'required')).toBe('male');
  });

  it('leaves the choice alone when the family does both', () => {
    expect(effectiveVocalMode(state({ vocalMode: 'instrumental' }), 'both')).toBe('instrumental');
  });
});

describe('compile, per family', () => {
  const song = state({ style: 'synthwave', mood: 'dreamy', vocalStyle: 'airy', vocalMode: 'female' });

  it('writes ACE-Step a run of descriptors', () => {
    expect(compile(song, 'ace_step').prompt).toBe('synthwave, dreamy, airy female vocals');
  });

  it('writes MiniMax a production caption', () => {
    expect(compile(song, 'minimax_music3').prompt).toBe(
      'A dreamy synthwave song featuring airy female vocals, recorded with polished studio production.',
    );
  });

  it('writes HeartMuLa a short summary and puts the detail in its tags', () => {
    const compiled = compile(song, 'heartmula');

    expect(compiled.prompt).toBe('a dreamy synthwave song');
    expect(compiled.params.tags).toBe('synthwave, dreamy, airy female vocals');
  });

  it('opens a YuE2 style with the language', () => {
    // Every upstream example begins with the language of the lyrics, and
    // leaving it off is how a song comes back sung in the wrong one.
    expect(compile(song, 'yue2').prompt).toBe(
      'English, synthwave, dreamy, airy female vocals, polished studio production',
    );
  });

  it('writes a YuE2 instrumental without a voice', () => {
    const quiet = state({ style: 'synthwave', mood: 'dreamy', vocalMode: 'instrumental' });
    expect(compile(quiet, 'yue2').prompt).toBe(
      'English, synthwave, dreamy, instrumental, no vocals, polished studio production',
    );
  });

  it('never writes a voice into a Stable Audio prompt', () => {
    // The family cannot sing, so the vocal mode has nothing to add however the
    // builder was left. See DOCS/MEMORY.md.
    expect(compile(song, 'stable_audio', 'never').prompt).toBe(
      'synthwave, dreamy, instrumental, no vocals',
    );
  });

  it('says there are no vocals rather than saying nothing, in every family', () => {
    const quiet = state({ style: 'ambient', vocalMode: 'instrumental' });

    expect(compile(quiet, 'ace_step').prompt).toBe('ambient, instrumental, no vocals');
    expect(compile(quiet, 'minimax_music3').prompt).toBe(
      'An ambient song, instrumental with no vocals, recorded with polished studio production.',
    );
    expect(compile(quiet, 'heartmula').params.tags).toBe('ambient, instrumental');
  });

  it('agrees the article with the word that follows it', () => {
    // "A ambient song" reads as broken in a prompt shown back to the person who
    // wrote it, and both sentence families open with an article.
    const vowel = state({ style: 'guitars', mood: 'ambient', vocalMode: 'instrumental' });

    expect(compile(vowel, 'minimax_music3').prompt).toBe(
      'An ambient guitars song, instrumental with no vocals, recorded with polished studio production.',
    );
    expect(compile(vowel, 'heartmula').prompt).toBe('an ambient guitars song');
  });

  it('goes by the sound rather than the letter', () => {
    // "Euphoric" and "unique" open on a "you", so they take "a". "Upbeat" does
    // not, so it keeps "an".
    const euphoric = state({ style: 'house', mood: 'euphoric' });
    const upbeat = state({ style: 'house', mood: 'upbeat' });

    expect(compile(euphoric, 'heartmula').prompt).toBe('a euphoric house song');
    expect(compile(upbeat, 'heartmula').prompt).toBe('an upbeat house song');
  });

  it('compiles nothing from a builder nobody has touched, whatever the family', () => {
    for (const family of ['ace_step', 'minimax_music3', 'heartmula', 'stable_audio']) {
      expect(compile(EMPTY_STUDIO, family).prompt).toBe('');
      expect(compile(EMPTY_STUDIO, family).params).toEqual({});
    }
  });
});

describe('vocalModesFor', () => {
  it('drops Instrumental for a family that always sings', () => {
    // Reported on 2026-09-20: the control was disabled outright for these, so
    // Female and Male went with it and there was no way to choose a voice.
    expect(vocalModesFor('required').map((mode) => mode.value)).toEqual(['female', 'male']);
  });

  it('leaves only Instrumental for a family that cannot sing', () => {
    expect(vocalModesFor('never').map((mode) => mode.value)).toEqual(['instrumental']);
  });

  it('offers everything to a family that does both', () => {
    expect(vocalModesFor('both').map((mode) => mode.value)).toEqual([
      'female',
      'male',
      'instrumental',
    ]);
  });

  it('always offers something to choose, so the control is never empty', () => {
    for (const support of ['both', 'required', 'never'] as const) {
      expect(vocalModesFor(support).length).toBeGreaterThan(0);
    }
  });
});
