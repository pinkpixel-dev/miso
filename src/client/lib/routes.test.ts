import { describe, expect, it } from 'vitest';
import { createPath, projectIdFrom, remixPath, wantsFullWidth } from './routes.ts';

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
    expect(projectIdFrom('/projects/abc/create')).toBe('abc');
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

  it('is true on the project page, which carries its own list of takes', () => {
    expect(wantsFullWidth('/projects/abc')).toBe(true);
  });

  /**
   * The reason the project is matched to the end. A prefix match here would
   * take the takes column away from the create form one segment further down,
   * which is the column that form writes into.
   */
  it('is false on the create page, where the takes column belongs', () => {
    expect(wantsFullWidth('/projects/abc/create')).toBe(false);
  });

  it('is false away from a project entirely', () => {
    expect(wantsFullWidth('/')).toBe(false);
    expect(wantsFullWidth('/models')).toBe(false);
    expect(wantsFullWidth('/settings')).toBe(false);
  });

  it('is not fooled by a project whose id begins with remix', () => {
    expect(wantsFullWidth('/projects/remixes/create')).toBe(false);
  });
});

describe('createPath', () => {
  it('addresses the create form and round trips through the readers', () => {
    expect(createPath('abc')).toBe('/projects/abc/create');
    expect(projectIdFrom(createPath('abc'))).toBe('abc');
    expect(wantsFullWidth(createPath('abc'))).toBe(false);
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
