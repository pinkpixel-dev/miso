import { describe, expect, it } from 'vitest';
import {
  comparePath,
  createPath,
  projectIdFrom,
  projectPath,
  SEPARATE_TASK_ID,
  remixPath,
  stemsPath,
  toolsPath,
  wantsFullWidth,
} from './routes.ts';

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

describe('toolsPath', () => {
  it('points at the workbench for a project', () => {
    expect(toolsPath('abc')).toBe('/projects/abc/tools');
  });

  it('carries a take when one is named', () => {
    expect(toolsPath('abc', 'take-1')).toBe('/projects/abc/tools?take=take-1');
  });

  it('encodes both, so an id with a slash in it cannot change the route', () => {
    expect(toolsPath('a/b', 'x y')).toBe('/projects/a%2Fb/tools?take=x%20y');
  });

  it('is inside its project, so the studio keeps the project open', () => {
    expect(projectIdFrom(toolsPath('abc'))).toBe('abc');
  });
});

describe('wantsFullWidth', () => {
  it('is true on the remix page, with or without a source', () => {
    expect(wantsFullWidth('/projects/abc/remix')).toBe(true);
    expect(wantsFullWidth('/projects/abc/remix/xyz')).toBe(true);
  });

  it('is true on the stems page, which carries several waveforms of its own', () => {
    expect(wantsFullWidth('/projects/abc/stems/job-1')).toBe(true);
  });

  it('is true on the workbench, which picks what it works on itself', () => {
    expect(wantsFullWidth('/projects/abc/tools')).toBe(true);
  });

  /**
   * The column beside the sound page listed generated songs, which is what
   * that page is not about, and neither of the things it makes could appear
   * in it. Both are now listed on the page itself.
   */
  it('is true on the sound page, which lists its own effects and transcriptions', () => {
    expect(wantsFullWidth('/projects/abc/sound')).toBe(true);
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
    expect(wantsFullWidth('/compare')).toBe(true);
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

  it('carries the job a form is seeded from, encoded', () => {
    expect(createPath('abc', 'job-1')).toBe('/projects/abc/create?from=job-1');
    expect(createPath('abc', 'a b&c')).toBe('/projects/abc/create?from=a%20b%26c');
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

describe('comparePath', () => {
  it('opens the page with nothing picked', () => {
    expect(comparePath()).toBe('/compare');
  });

  it('seeds one side, which is what a take links to', () => {
    expect(comparePath('asset-1')).toBe('/compare?a=asset-1');
  });

  it('seeds both, which is what the dock links to', () => {
    expect(comparePath('asset-1', 'asset-2')).toBe('/compare?a=asset-1&b=asset-2');
  });

  it('encodes an id that needs it', () => {
    expect(comparePath('a b&c')).toBe('/compare?a=a+b%26c');
  });

  it('stays full width with takes in the address', () => {
    // wantsFullWidth reads a pathname, so the query must not reach it.
    const path = comparePath('asset-1', 'asset-2');
    expect(wantsFullWidth(path.split('?')[0] ?? path)).toBe(true);
  });
});

describe('stemsPath', () => {
  it('addresses a stem set by the job that made it', () => {
    // A job is what holds a set of stems together: separation puts the same job
    // id on every output row, so naming one stem would mean finding its
    // siblings again on arrival.
    expect(stemsPath('abc', 'job-1')).toBe('/projects/abc/stems/job-1');
  });

  it('escapes both parts', () => {
    expect(stemsPath('a/b', 'j b')).toBe('/projects/a%2Fb/stems/j%20b');
  });

  it('round trips through projectIdFrom', () => {
    expect(projectIdFrom(stemsPath('abc', 'job-1'))).toBe('abc');
  });
});

describe('remixPath with a tool', () => {
  it('names the tool in the address', () => {
    expect(remixPath('abc', 'xyz', SEPARATE_TASK_ID)).toBe(
      '/projects/abc/remix/xyz?task=stems.separate',
    );
  });

  it('names a tool without naming a take', () => {
    // The project page links here before a take has been chosen.
    expect(remixPath('abc', undefined, SEPARATE_TASK_ID)).toBe(
      '/projects/abc/remix?task=stems.separate',
    );
  });

  it('leaves the plain paths alone', () => {
    expect(remixPath('abc')).toBe('/projects/abc/remix');
    expect(remixPath('abc', 'xyz')).toBe('/projects/abc/remix/xyz');
  });

  it('is still a full width route with a tool named', () => {
    expect(wantsFullWidth('/projects/abc/remix/xyz')).toBe(true);
  });
});
