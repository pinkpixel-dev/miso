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
    style: 'synthwave, warm analogue tape',
    mood: 'dreamy',
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

  it('fills in the boxes that were left out', () => {
    expect(parseStudioState({ vocalMode: 'instrumental' })).toEqual({
      ok: true,
      value: { style: '', mood: '', vocalStyle: '', vocalMode: 'instrumental' },
    });
  });

  it('refuses a vocal mode that is not one of the four', () => {
    expect(parseStudioState({ ...good, vocalMode: 'robot' })).toMatchObject({ ok: false });
    expect(parseStudioState({ ...good, vocalMode: undefined })).toMatchObject({ ok: false });
  });

  it('refuses anything that is not an object', () => {
    expect(parseStudioState('female')).toMatchObject({ ok: false });
    expect(parseStudioState([good])).toMatchObject({ ok: false });
  });

  it('bounds every box', () => {
    expect(parseStudioState({ ...good, style: 'x'.repeat(601) })).toMatchObject({ ok: false });
    expect(parseStudioState({ ...good, mood: 'x'.repeat(601) })).toMatchObject({ ok: false });
    expect(parseStudioState({ ...good, vocalStyle: 'x'.repeat(401) })).toMatchObject({ ok: false });
    expect(parseStudioState({ ...good, style: 7 })).toMatchObject({ ok: false });
  });
});

/**
 * The builder collected chips until 2026-09-12. Jobs it wrote are still in the
 * database and are still opened by the builder and by the take detail panel, so
 * the parser reads both shapes and answers in the current one.
 */
describe('parseStudioState on a row the chip builder wrote', () => {
  const legacy = {
    genre: ['Synthwave', 'Lo-Fi'],
    mood: ['Dreamy', 'Melancholic'],
    customStyle: 'warm analogue tape',
    vocalStyle: 'airy',
    vocalMode: 'female',
  };

  it('joins the chip lists into the boxes that replaced them', () => {
    const result = parseStudioState(legacy);
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.value).toEqual({
      style: 'Synthwave, Lo-Fi, warm analogue tape',
      mood: 'Dreamy, Melancholic',
      vocalStyle: 'airy',
      vocalMode: 'female',
    });
  });

  it('folds the old free text box onto the end of the style', () => {
    const result = parseStudioState({ genre: [], customStyle: 'brushed drums', vocalMode: 'male' });
    expect(result.ok && result.value?.style).toBe('brushed drums');
  });

  it('drops a chip that was picked twice', () => {
    const result = parseStudioState({ ...legacy, genre: ['Pop', 'Pop', ' Pop '] });
    expect(result.ok && result.value?.style).toBe('Pop, warm analogue tape');
  });

  it('still refuses a list that is too long or holds something that is not text', () => {
    expect(parseStudioState({ ...legacy, genre: Array(25).fill('Pop') })).toMatchObject({
      ok: false,
    });
    expect(parseStudioState({ ...legacy, genre: [7] })).toMatchObject({ ok: false });
  });

  it('prefers the new box when a row somehow carries both', () => {
    const result = parseStudioState({ ...legacy, style: 'house' });
    expect(result.ok && result.value?.style).toBe('house, warm analogue tape');
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
