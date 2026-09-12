import { describe, expect, it } from 'vitest';
import type { StudioState } from '../../shared/types.ts';
import { EMPTY_STUDIO, compilePrompt, supportsGuided, wantsLyrics } from './studio.ts';

function state(patch: Partial<StudioState>): StudioState {
  return { ...EMPTY_STUDIO, ...patch };
}

describe('compilePrompt', () => {
  it('reads as the kind of music, how it feels, then who is singing', () => {
    const prompt = compilePrompt(
      state({ genre: ['Synthwave'], mood: ['Dreamy'], vocalStyle: 'airy', vocalMode: 'female' }),
    );

    expect(prompt).toBe('synthwave, dreamy, airy female vocals');
  });

  it('lowercases the chips and leaves typed words exactly as typed', () => {
    const prompt = compilePrompt(
      state({ genre: ['Lo-Fi'], customStyle: 'in the style of Chopin', vocalMode: 'instrumental' }),
    );

    expect(prompt).toBe('lo-fi, in the style of Chopin, instrumental, no vocals');
  });

  it('says there are no vocals rather than saying nothing about them', () => {
    expect(compilePrompt(state({ genre: ['Ambient'], vocalMode: 'instrumental' }))).toBe(
      'ambient, instrumental, no vocals',
    );
  });

  it('names both voices for a duet', () => {
    expect(compilePrompt(state({ genre: ['Folk'], vocalMode: 'duet' }))).toBe(
      'folk, male and female duet vocals',
    );
  });

  it('compiles nothing from a builder nobody has touched', () => {
    // The vocal mode has a value from the moment the form opens, and a prompt
    // reading "female vocals" describes a voice with no song under it.
    expect(compilePrompt(EMPTY_STUDIO)).toBe('');
    expect(compilePrompt(state({ vocalStyle: 'raspy' }))).toBe('');
  });

  it('ignores a chip or a style that is only whitespace', () => {
    expect(compilePrompt(state({ genre: ['Pop', '  '], customStyle: '   ' }))).toBe(
      'pop, female vocals',
    );
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
