import { describe, expect, it, vi } from 'vitest';
import type { Project } from '../../shared/types.ts';
import { publishProjectUpdate, subscribeToProjectUpdates } from './projectUpdates.ts';

const project: Project = {
  id: 'project-1',
  name: 'Renamed project',
  createdAt: '2026-09-12 12:00:00',
  updatedAt: '2026-09-12 12:01:00',
  assetCount: 2,
  bytes: 1024,
};

describe('project updates', () => {
  it('publishes a renamed project to active subscribers only', () => {
    const active = vi.fn();
    const removed = vi.fn();
    const unsubscribeActive = subscribeToProjectUpdates(active);
    const unsubscribeRemoved = subscribeToProjectUpdates(removed);

    unsubscribeRemoved();
    publishProjectUpdate(project);

    expect(active).toHaveBeenCalledOnce();
    expect(active).toHaveBeenCalledWith(project);
    expect(removed).not.toHaveBeenCalled();

    unsubscribeActive();
  });
});
