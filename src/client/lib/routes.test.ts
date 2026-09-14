import { describe, expect, it } from 'vitest';
import { projectIdFrom, remixPath, wantsFullWidth } from './routes.ts';

describe('projectIdFrom', () => {
  it('reads the project off its own route', () => {
    expect(projectIdFrom('/projects/abc')).toBe('abc');
  });

  /**
   * The regression this exists for. A string pattern matches to the end, so a
   * nested tool path resolved to nothing and the studio quietly fell back to
   * the last project it had seen. Reloading on the remix page then left it with
   * no project at all.
   */
  it('still reads the project from a nested tool path', () => {
    expect(projectIdFrom('/projects/abc/remix')).toBe('abc');
    expect(projectIdFrom('/projects/abc/remix/xyz')).toBe('abc');
  });

  it('finds no project outside a project route', () => {
    expect(projectIdFrom('/')).toBeUndefined();
    expect(projectIdFrom('/models')).toBeUndefined();
    expect(projectIdFrom('/settings')).toBeUndefined();
  });
});

describe('wantsFullWidth', () => {
  it('is true on the remix page, with or without a source', () => {
    expect(wantsFullWidth('/projects/abc/remix')).toBe(true);
    expect(wantsFullWidth('/projects/abc/remix/xyz')).toBe(true);
  });

  it('is false everywhere the takes column belongs', () => {
    expect(wantsFullWidth('/projects/abc')).toBe(false);
    expect(wantsFullWidth('/')).toBe(false);
    expect(wantsFullWidth('/models')).toBe(false);
    expect(wantsFullWidth('/settings')).toBe(false);
  });

  it('is not fooled by a project whose id begins with remix', () => {
    expect(wantsFullWidth('/projects/remixes')).toBe(false);
  });
});

describe('remixPath', () => {
  it('addresses the picker and a chosen take', () => {
    expect(remixPath('abc')).toBe('/projects/abc/remix');
    expect(remixPath('abc', 'xyz')).toBe('/projects/abc/remix/xyz');
  });

  it('round trips through the readers', () => {
    const path = remixPath('abc', 'xyz');
    expect(projectIdFrom(path)).toBe('abc');
    expect(wantsFullWidth(path)).toBe(true);
  });
});
