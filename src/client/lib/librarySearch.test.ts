import { describe, expect, it } from 'vitest';
import type { LibraryTake, StudioTask } from '../../shared/types.ts';
import { searchTakes, taskLabels } from './librarySearch.ts';

function take(overrides: Partial<LibraryTake> & { label: string }): LibraryTake {
  return {
    assetId: overrides.label,
    projectId: 'p1',
    projectName: 'Night drive',
    kind: 'generated',
    format: 'wav',
    bytes: 1000,
    createdAt: '2026-09-15 10:00:00',
    hasPeaks: true,
    ...overrides,
  };
}

const labels = taskLabels([
  { id: 'remix.cover', shortLabel: 'Covers' } as StudioTask,
  { id: 'generate.text2music', shortLabel: 'Generated songs' } as StudioTask,
]);

const library = [
  take({ label: 'Take 1', taskId: 'generate.text2music', title: 'Undertow', prompt: 'slow shoegaze' }),
  take({ label: 'Take 2', taskId: 'remix.cover', lyrics: 'headlights on the coast road' }),
  take({ label: 'Imported song', projectId: 'p2', projectName: 'Demos' }),
];

describe('searchTakes', () => {
  it('returns the list untouched when nothing is typed', () => {
    expect(searchTakes(library, '', labels)).toEqual(library);
    expect(searchTakes(library, '   ', labels)).toEqual(library);
  });

  it('matches the take name', () => {
    expect(searchTakes(library, 'imported', labels).map((t) => t.label)).toEqual(['Imported song']);
  });

  it('matches the project name', () => {
    expect(searchTakes(library, 'demos', labels).map((t) => t.label)).toEqual(['Imported song']);
  });

  it('matches the song title', () => {
    expect(searchTakes(library, 'undertow', labels).map((t) => t.label)).toEqual(['Take 1']);
  });

  it('matches the prompt', () => {
    expect(searchTakes(library, 'shoegaze', labels).map((t) => t.label)).toEqual(['Take 1']);
  });

  it('matches the lyrics', () => {
    expect(searchTakes(library, 'coast road', labels).map((t) => t.label)).toEqual(['Take 2']);
  });

  it('matches the tool that made it, by its short label', () => {
    expect(searchTakes(library, 'covers', labels).map((t) => t.label)).toEqual(['Take 2']);
  });

  it('narrows on every term rather than widening', () => {
    expect(searchTakes(library, 'take shoegaze', labels).map((t) => t.label)).toEqual(['Take 1']);
    expect(searchTakes(library, 'take nothing', labels)).toEqual([]);
  });

  it('ignores case on both sides', () => {
    expect(searchTakes(library, 'SHOEGAZE', labels).map((t) => t.label)).toEqual(['Take 1']);
  });

  it('keeps the order it was given', () => {
    expect(searchTakes(library, 'take', labels).map((t) => t.label)).toEqual(['Take 1', 'Take 2']);
  });

  it('survives a task id the registry no longer has', () => {
    const orphan = [take({ label: 'Old', taskId: 'remix.gone' })];
    expect(searchTakes(orphan, 'old', labels).map((t) => t.label)).toEqual(['Old']);
    expect(searchTakes(orphan, 'gone', labels)).toEqual([]);
  });
});
