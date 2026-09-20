import { describe, expect, it } from 'vitest';
import type { StudioTask, TaskField } from '../../shared/types.ts';
import { chooseTask, hasRegion, remixTasks, REGION_FIELDS } from './remixTasks.ts';

function field(name: string): TaskField {
  return { name, label: name, kind: 'text', required: false };
}

function task(id: string, inputRoles: string[], fieldNames: string[] = []): StudioTask {
  return {
    guidedPrompt: true,
    id,
    label: id,
    shortLabel: id,
    summary: '',
    families: ['ace_step'],
    vocals: 'both',
    packageIds: [],
    inputRoles,
    fields: fieldNames.map(field),
  };
}

const REPAINT = task('remix.repaint', ['source'], ['regionStart', 'regionEnd', 'prompt']);
const COVER = task('remix.cover', ['source'], ['prompt', 'lyrics']);
const NOFSQ = task('remix.covernofsq', ['source'], ['prompt', 'lyrics']);
const GENERATE = task('generate.text2music', [], ['prompt']);

const TASKS: StudioTask[] = [GENERATE, REPAINT, COVER, NOFSQ];

describe('remixTasks', () => {
  it('offers the tasks that read a take and no others', () => {
    expect(remixTasks(TASKS).map((entry) => entry.id)).toEqual([
      'remix.repaint',
      'remix.cover',
      'remix.covernofsq',
    ]);
  });

  /** The registry's order is the order tools appear in everywhere else. */
  it('keeps the order it was given', () => {
    expect(remixTasks([COVER, REPAINT]).map((entry) => entry.id)).toEqual([
      'remix.cover',
      'remix.repaint',
    ]);
  });

  it('is empty for a build with nothing that reads a take', () => {
    expect(remixTasks([GENERATE])).toEqual([]);
  });
});

describe('hasRegion', () => {
  it('is true for a task carrying both ends of a region', () => {
    expect(hasRegion(REPAINT)).toBe(true);
  });

  it('is false for a task with no region fields', () => {
    expect(hasRegion(COVER)).toBe(false);
  });

  /**
   * Both ends or neither. Half a region would put the editor on screen with
   * nowhere to write one of the numbers it produces.
   */
  it('is false for a task carrying only one end', () => {
    expect(hasRegion(task('remix.half', ['source'], ['regionStart']))).toBe(false);
    expect(hasRegion(task('remix.other', ['source'], ['regionEnd']))).toBe(false);
  });

  it('reads the fields rather than the task id', () => {
    // A task named nothing like repaint still gets the editor if it asks for
    // a region, which is what stops this being a list of favoured ids.
    expect(hasRegion(task('edit.something', ['source'], ['regionStart', 'regionEnd']))).toBe(true);
  });
});

describe('chooseTask', () => {
  it('returns the task that was picked', () => {
    expect(chooseTask(TASKS, 'remix.cover')?.id).toBe('remix.cover');
  });

  it('falls back to the first offered when nothing is picked yet', () => {
    expect(chooseTask(TASKS, undefined)?.id).toBe('remix.repaint');
  });

  /**
   * A dropped route outliving a link to it is a real case: `remix.extract` was
   * planned, measured, and cut. Falling back beats rendering nothing.
   */
  it('falls back when the picked task is not in this build', () => {
    expect(chooseTask(TASKS, 'remix.extract')?.id).toBe('remix.repaint');
  });

  it('never returns a generation task, even when asked for one by name', () => {
    expect(chooseTask(TASKS, 'generate.text2music')?.id).toBe('remix.repaint');
  });

  it('returns nothing for a build with no remix task at all', () => {
    expect(chooseTask([GENERATE], undefined)).toBeUndefined();
  });
});

describe('REGION_FIELDS', () => {
  /** One definition, read by the form and by hasRegion. */
  it('names both ends of a region', () => {
    expect([...REGION_FIELDS].sort()).toEqual(['regionEnd', 'regionStart']);
  });
});
