import { describe, expect, it } from 'vitest';
import type { StudioTask } from '../../shared/types.ts';
import { missingRequiredRole, roleInputs } from './InputRoleFields.tsx';

function task(
  id: string,
  inputRoles: string[],
  optionalInputRoles?: string[],
): StudioTask {
  return {
    guidedPrompt: true,
    id,
    label: id,
    shortLabel: id,
    summary: '',
    families: ['vevo2'],
    vocals: 'required',
    packageIds: [],
    inputRoles,
    optionalInputRoles,
    fields: [],
  };
}

const SING = task('generate.sing', ['voiceRef', 'prosodyRef'], ['prosodyRef']);
const CONVERT = task('voice.vevo2', ['source', 'voiceRef']);
const REPAINT = task('remix.repaint', ['source']);

describe('missingRequiredRole', () => {
  it('holds the button while a required track is unchosen', () => {
    expect(missingRequiredRole(CONVERT, {})).toBe(true);
    expect(missingRequiredRole(CONVERT, { voiceRef: 'a1' })).toBe(false);
  });

  it('lets an optional track stay empty', () => {
    // Leaving the melody out is how the sing task asks for the route that
    // writes its own, so blocking on it would make that route unreachable.
    expect(missingRequiredRole(SING, { voiceRef: 'a1' })).toBe(false);
    expect(missingRequiredRole(SING, {})).toBe(true);
  });

  it('never blocks a task that only reads a source', () => {
    // The source is the take the page opened on. It is not picked here.
    expect(missingRequiredRole(REPAINT, {})).toBe(false);
  });
});

describe('roleInputs', () => {
  it('drops the roles that were left empty', () => {
    expect(roleInputs(SING, { voiceRef: 'a1', prosodyRef: '' })).toEqual([
      { assetId: 'a1', role: 'voiceRef' },
    ]);
  });

  it('keeps both when both were chosen, in the order the task asked', () => {
    expect(roleInputs(SING, { voiceRef: 'a1', prosodyRef: 'a2' })).toEqual([
      { assetId: 'a1', role: 'voiceRef' },
      { assetId: 'a2', role: 'prosodyRef' },
    ]);
  });

  it('never sends the source, which the page adds itself', () => {
    expect(roleInputs(CONVERT, { voiceRef: 'a1', source: 'a9' })).toEqual([
      { assetId: 'a1', role: 'voiceRef' },
    ]);
  });
});
