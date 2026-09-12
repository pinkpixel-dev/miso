import { describe, expect, it } from 'vitest';
import type { StudioState } from '../../shared/types.ts';
import { EMPTY_STUDIO, compilePrompt, supportsGuided, wantsLyrics } from './studio.ts';

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
  it('covers the one family with compilation rules so far', () => {
    expect(supportsGuided('ace_step')).toBe(true);
    expect(supportsGuided('stable_audio')).toBe(false);
  });
});
