import { findPackage, loadSpecs } from '../catalog/registry.ts';
import { cover, coverNoFsq, repaint, text2music } from './acestep.ts';
import { heartmula } from './heartmula.ts';
import { minimax } from './minimax.ts';
import { stableAudio } from './stableaudio.ts';
import type { TaskDefinition, TaskParams } from './types.ts';

/**
 * What Miso can ask audio.cpp to do.
 *
 * One entry per task, and adding a model to an existing task is a data change
 * rather than a new screen. The entries themselves live one module per family,
 * beside the notes about what that family's routes actually do, because those
 * notes are long and they are what stops a field being added back on the
 * strength of the manual alone.
 *
 * This module is the map, the validation, and the package helpers. Everything
 * the rest of the server imports still comes from here, so the split changed no
 * caller.
 */

export type { ParamField, ParamValue, TaskDefinition, TaskParams } from './types.ts';

/**
 * Order matters here. The project page lists its derived sections in registry
 * order, so this is also the order the tools appear in beside a take.
 */
const tasks = new Map<string, TaskDefinition>(
  [text2music, minimax, heartmula, stableAudio, repaint, cover, coverNoFsq].map((task) => [
    task.id,
    task,
  ]),
);

export function listTasks(): TaskDefinition[] {
  return [...tasks.values()];
}

export function findTask(id: string): TaskDefinition | undefined {
  return tasks.get(id);
}

export type ParamResult =
  | { ok: true; value: TaskParams }
  | { ok: false; error: string };

/**
 * Checks submitted params against a task's fields.
 *
 * Unknown keys are dropped rather than refused. A client a version ahead of the
 * service sends a field this build does not know, and dropping it generates a
 * slightly plainer track where refusing generates nothing at all.
 */
export function validateParams(task: TaskDefinition, raw: unknown): ParamResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'Parameters must be an object' };
  }

  const input = raw as Record<string, unknown>;
  const value: TaskParams = {};

  for (const field of task.fields) {
    const given = input[field.name];

    if (given === undefined || given === null || given === '') {
      if (field.required) return { ok: false, error: `${field.label} is required` };
      if (field.default !== undefined) value[field.name] = field.default;
      continue;
    }

    if (field.kind === 'number') {
      const parsed = typeof given === 'number' ? given : Number(given);
      if (!Number.isFinite(parsed)) {
        return { ok: false, error: `${field.label} must be a number` };
      }
      if (field.min !== undefined && parsed < field.min) {
        return { ok: false, error: `${field.label} cannot be below ${field.min}` };
      }
      if (field.max !== undefined && parsed > field.max) {
        return { ok: false, error: `${field.label} cannot be above ${field.max}` };
      }
      value[field.name] = parsed;
      continue;
    }

    if (typeof given !== 'string') {
      return { ok: false, error: `${field.label} must be text` };
    }
    value[field.name] = given;
  }

  // Only once every field is known good, so a cross-field message never talks
  // about a value that was never valid on its own.
  const across = task.validate?.(value);
  if (across !== undefined) return { ok: false, error: across };

  return { ok: true, value };
}

/** Whether a catalog package can run this task: a family match, then the task's own say. */
export function packageRunsTask(task: TaskDefinition, packageId: string): boolean {
  if (findPackage(packageId)?.spec.family !== task.family) return false;
  return task.acceptsPackage?.(packageId) ?? true;
}

/**
 * Every package this task can run on, by id.
 *
 * Sent to the browser so the studio's precision list holds the same packages
 * the service would accept, rather than the whole family and a rejection after
 * the fact.
 */
export function taskPackageIds(task: TaskDefinition): string[] {
  return loadSpecs()
    .filter((spec) => spec.family === task.family)
    .flatMap((spec) => spec.packages)
    .map((pkg) => pkg.id)
    .filter((id) => task.acceptsPackage?.(id) ?? true);
}
