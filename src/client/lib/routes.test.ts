import { describe, expect, it } from 'vitest';
import { createPath, projectIdFrom, projectPath, remixPath, wantsFullWidth } from './routes.ts';

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
    expect(projectIdFrom('/library')).toBeUndefined();
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

  /**
   * Not for the reason the project and remix pages are full width, which is
   * that they carry their own list of takes. These are app level: a project's
   * takes standing beside them belong to something else entirely. Decided
   * September 15, 2026.
   */
  it('is true on the app level screens', () => {
    expect(wantsFullWidth('/library')).toBe(true);
    expect(wantsFullWidth('/models')).toBe(true);
    expect(wantsFullWidth('/settings')).toBe(true);
  });

  /**
   * Start keeps the column. A projects list with the last project's takes
   * beside it is two halves of the same thought, unlike installing a model.
   */
  it('is false on the start screen, which keeps the column', () => {
    expect(wantsFullWidth('/')).toBe(false);
  });

  /**
   * Both are matched to the end, the same way the project page is, so nothing
   * nested under them is swept in by accident if a route is added later.
   */
  it('is not fooled by a path that merely starts with one of them', () => {
    expect(wantsFullWidth('/models/something')).toBe(false);
    expect(wantsFullWidth('/settings/deep')).toBe(false);
  });

  it('is not fooled by a project whose id begins with remix', () => {
    expect(wantsFullWidth('/projects/remixes/create')).toBe(false);
  });
});

describe('projectPath', () => {
  it('addresses the project page and round trips through the readers', () => {
    expect(projectPath('abc')).toBe('/projects/abc');
    expect(projectIdFrom(projectPath('abc'))).toBe('abc');
    expect(wantsFullWidth(projectPath('abc'))).toBe(true);
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
