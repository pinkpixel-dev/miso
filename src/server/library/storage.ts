import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { AssetFormat } from '../../shared/types.ts';
import { dataDir } from '../config.ts';

/**
 * Where asset files live, and the only module that knows the layout.
 *
 * A directory per project, files named by asset id:
 *
 *   $MISO_DATA_DIR/projects/<projectId>/<assetId>.<format>
 *
 * Deleting a project is one directory removal, and copying one out is one
 * directory copy. The path is derived rather than stored on the row, so the
 * database and the disk cannot disagree about where a file is.
 */

const TEMP_PREFIX = '.tmp-';

function projectsRoot(): string {
  return join(dataDir, 'projects');
}

export function projectDir(projectId: string): string {
  return join(projectsRoot(), projectId);
}

export function assetPath(projectId: string, assetId: string, format: AssetFormat): string {
  return join(projectDir(projectId), `${assetId}.${format}`);
}

/**
 * Where a transcription's MIDI file lives.
 *
 * The same directory as the project's audio, named by the artifact's own id.
 * Artifact ids and asset ids are both UUIDs from the same generator, so they
 * cannot collide, and removing the project still takes everything with it in
 * one directory removal.
 */
export function midiPath(projectId: string, artifactId: string): string {
  return join(projectDir(projectId), `${artifactId}.mid`);
}

export async function removeMidi(projectId: string, artifactId: string): Promise<void> {
  await unlinkIfPresent(midiPath(projectId, artifactId));
}

/** A name no finished asset can ever have, because asset ids are UUIDs. */
export function tempPath(projectId: string): string {
  return join(projectDir(projectId), `${TEMP_PREFIX}${randomUUID()}`);
}

export async function ensureProjectDir(projectId: string): Promise<string> {
  const dir = projectDir(projectId);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Unlinking a file that is already gone is success, not failure. */
async function unlinkIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function removeAsset(
  projectId: string,
  assetId: string,
  format: AssetFormat,
): Promise<void> {
  await unlinkIfPresent(assetPath(projectId, assetId, format));
}

export async function removeTemp(path: string): Promise<void> {
  await unlinkIfPresent(path);
}

export async function removeProjectDir(projectId: string): Promise<void> {
  await rm(projectDir(projectId), { recursive: true, force: true });
}

/**
 * Deletes every in-flight upload left behind by a previous process.
 *
 * A temp file is abandoned by definition once the process writing it is gone,
 * so this needs no age heuristic. Returns how many went, for the startup log.
 */
export async function sweepTempFiles(): Promise<number> {
  let projects: string[];
  try {
    projects = await readdir(projectsRoot());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }

  let removed = 0;
  for (const projectId of projects) {
    let entries: string[];
    try {
      entries = await readdir(projectDir(projectId));
    } catch {
      // Not a directory, or vanished under us. Nothing to sweep either way.
      continue;
    }

    for (const entry of entries) {
      if (!entry.startsWith(TEMP_PREFIX)) continue;
      await unlinkIfPresent(join(projectDir(projectId), entry));
      removed += 1;
    }
  }

  return removed;
}
