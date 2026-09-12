import { describe, expect, it } from 'vitest';
import type { StudioState } from '../../shared/types.ts';
import { describeStudio, readLyrics, readPrompt } from './prompts.ts';

const state: StudioState = {
  style: 'synthwave, warm analogue tape',
  mood: 'dreamy',
  vocalStyle: 'airy',
  vocalMode: 'female',
};

describe('readLyrics', () => {
  it('splits the title line off the sheet', () => {
    const answer = 'Title: Midnight Drive\n\n[Verse 1]\nThe road is long';
    expect(readLyrics(answer)).toEqual({
      title: 'Midnight Drive',
      lyrics: '[Verse 1]\nThe road is long',
    });
  });

  it('drops quotes the model put round the title', () => {
    expect(readLyrics('Title: "Midnight Drive"\n[Verse]\nline').title).toBe('Midnight Drive');
  });

  it('keeps the lyrics when the model ignored the title instruction', () => {
    const answer = '[Verse 1]\nThe road is long';
    expect(readLyrics(answer)).toEqual({ lyrics: answer });
  });

  it('keeps everything when a title line is all there is', () => {
    // A sheet of nothing but a title is a failed answer, not a titled song, and
    // handing back empty lyrics would silently wipe the editor.
    expect(readLyrics('Title: Midnight Drive')).toEqual({ lyrics: 'Title: Midnight Drive' });
  });

  it('strips a code fence the model added anyway', () => {
    const answer = '```\nTitle: Midnight Drive\n[Verse]\nline\n```';
    expect(readLyrics(answer)).toEqual({ title: 'Midnight Drive', lyrics: '[Verse]\nline' });
  });
});

describe('readPrompt', () => {
  it('folds a multi line answer back onto one line', () => {
    expect(readPrompt('synthwave, dreamy\nwarm tape saturation')).toBe(
      'synthwave, dreamy, warm tape saturation',
    );
  });

  it('strips a fence and the quotes round the whole thing', () => {
    expect(readPrompt('```text\n"synthwave, dreamy"\n```')).toBe('synthwave, dreamy');
  });

  it('answers with nothing when the model said nothing', () => {
    expect(readPrompt('   \n  ')).toBe('');
  });
});

describe('describeStudio', () => {
  it('lays out what the builder was set to', () => {
    const described = describeStudio(state, 'synthwave, dreamy, airy female vocals');

    expect(described).toContain('Current prompt: synthwave, dreamy, airy female vocals');
    expect(described).toContain('Style: synthwave, warm analogue tape');
    expect(described).toContain('Mood: dreamy');
    expect(described).toContain('Vocals: female, airy');
  });

  it('says there are no vocals rather than leaving the line out', () => {
    expect(describeStudio({ ...state, vocalMode: 'instrumental' }, 'x')).toContain(
      'Vocals: none, this is an instrumental',
    );
  });

  it('sends the prompt alone when the plain form wrote it', () => {
    expect(describeStudio(undefined, 'synth pop')).toBe('synth pop');
  });
});
