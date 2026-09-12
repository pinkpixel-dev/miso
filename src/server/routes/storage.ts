import { Hono } from 'hono';
import type { StorageUsage } from '../../shared/types.ts';
import { db } from '../db/index.ts';
import { listProjects } from '../db/projects.ts';

/**
 * What Miso is holding, per project and in total.
 *
 * This reuses the rollups listProjects already computes rather than walking the
 * projects directory. The byte count on a row was taken from the upload stream
 * that wrote the file, so the two agree, and a sum over a small table beats a
 * recursive stat over gigabytes.
 */
export const storageRoutes = new Hono();

storageRoutes.get('/storage', (c) => {
  const projects = listProjects(db());
  const totalBytes = projects.reduce((total, project) => total + project.bytes, 0);

  return c.json<StorageUsage>({ totalBytes, projects });
});
