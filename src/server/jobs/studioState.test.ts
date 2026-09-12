import { describe, expect, it } from 'vitest';
import { parseOriginalPrompt, parseStudioState, parseTitle } from './studioState.ts';

describe('parseTitle', () => {
  it('treats an absent, empty, or blank title the same way', () => {
    expect(parseTitle(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseTitle('')).toEqual({ ok: true, value: undefined });
    expect(parseTitle('   ')).toEqual({ ok: true, value: undefined });
  });

  it('trims what somebody typed', () => {
    expect(parseTitle('  Midnight Drive  ')).toEqual({ ok: true, value: 'Midnight Drive' });
  });

  it('refuses a title longer than a track name', () => {
    expect(parseTitle('x'.repeat(121))).toMatchObject({ ok: false });
    expect(parseTitle('x'.repeat(120))).toMatchObject({ ok: true });
  });

  it('refuses a title that is not text', () => {
    expect(parseTitle(42)).toMatchObject({ ok: false });
  });
});

describe('parseStudioState', () => {
  const good = {
    genre: ['Synthwave'],
    mood: ['Dreamy'],
    customStyle: 'warm analogue tape',
    vocalStyle: 'airy',
    vocalMode: 'female',
  };

  it('reads a state the builder wrote', () => {
    expect(parseStudioState(good)).toEqual({ ok: true, value: good });
  });

  it('treats an absent state as a job written from the plain form', () => {
    expect(parseStudioState(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseStudioState(null)).toEqual({ ok: true, value: undefined });
  });

  it('fills in the lists and the free text that were left out', () => {
    const result = parseStudioState({ vocalMode: 'instrumental' });
    expect(result).toEqual({
      ok: true,
      value: { genre: [], mood: [], customStyle: '', vocalStyle: '', vocalMode: 'instrumental' },
    });
  });

  it('drops a chip picked twice', () => {
    const result = parseStudioState({ ...good, genre: ['Pop', 'Pop', ' Pop '] });
    expect(result.ok && result.value?.genre).toEqual(['Pop']);
  });

  it('refuses a vocal mode that is not one of the four', () => {
    expect(parseStudioState({ ...good, vocalMode: 'robot' })).toMatchObject({ ok: false });
    expect(parseStudioState({ ...good, vocalMode: undefined })).toMatchObject({ ok: false });
  });

  it('refuses anything that is not an object', () => {
    expect(parseStudioState('female')).toMatchObject({ ok: false });
    expect(parseStudioState([good])).toMatchObject({ ok: false });
  });

  it('bounds every string and every list', () => {
    expect(parseStudioState({ ...good, genre: Array(25).fill('Pop') })).toMatchObject({ ok: false });
    expect(parseStudioState({ ...good, genre: ['x'.repeat(61)] })).toMatchObject({ ok: false });
    expect(parseStudioState({ ...good, customStyle: 'x'.repeat(401) })).toMatchObject({ ok: false });
    expect(parseStudioState({ ...good, vocalStyle: 'x'.repeat(401) })).toMatchObject({ ok: false });
    expect(parseStudioState({ ...good, genre: [7] })).toMatchObject({ ok: false });
    expect(parseStudioState({ ...good, genre: 'Pop' })).toMatchObject({ ok: false });
  });
});

describe('parseOriginalPrompt', () => {
  it('keeps what the person wrote when an expansion of it ran', () => {
    expect(parseOriginalPrompt('synthwave', 'synthwave, dreamy, warm tape saturation')).toEqual({
      ok: true,
      value: 'synthwave',
    });
  });

  it('drops it when it is the same as the prompt that ran', () => {
    // Two columns holding the same text would claim an enhancement that never
    // happened, and a lineage view would show a take derived from itself.
    expect(parseOriginalPrompt('synthwave', 'synthwave')).toEqual({ ok: true, value: undefined });
    expect(parseOriginalPrompt('  synthwave  ', 'synthwave')).toEqual({ ok: true, value: undefined });
  });

  it('treats absent and empty the same way', () => {
    expect(parseOriginalPrompt(undefined, 'x')).toEqual({ ok: true, value: undefined });
    expect(parseOriginalPrompt('   ', 'x')).toEqual({ ok: true, value: undefined });
  });

  it('refuses one that is not text, and one too long to be a prompt', () => {
    expect(parseOriginalPrompt(7, 'x')).toMatchObject({ ok: false });
    expect(parseOriginalPrompt('x'.repeat(4001), 'y')).toMatchObject({ ok: false });
  });
});
