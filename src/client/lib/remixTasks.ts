import type { StudioTask } from '../../shared/types.ts';

/**
 * Which remix task the page is driving, and what that task needs on screen.
 *
 * These are pure rules rather than logic inside the route, for the same reason
 * `routes.ts` and `takeGroups.ts` are. This project has no DOM test setup, so a
 * rule living in a component cannot be tested without adding jsdom and a
 * testing library for one assertion. Kept here, the decisions that shape the
 * remix page are covered by ordinary tests.
 */

/**
 * The fields the region editor draws.
 *
 * The form must not draw boxes for these, and a task that does not have them
 * needs no editor at all. Defined once and read from both places, because two
 * copies of this set is how a form ends up drawing a control the editor already
 * owns.
 */
export const REGION_FIELDS: ReadonlySet<string> = new Set(['regionStart', 'regionEnd']);

/**
 * Every task that works from an existing take, in the order the registry lists
 * them.
 *
 * `inputRoles` is the same field that keeps these off the create form, so the
 * two pages split one list between them and a route added to the registry turns
 * up here with no change to this file.
 *
 * A task can name another page with `surface`, and transcription does. It reads
 * a take like everything here, but it turns one into a MIDI file rather than
 * into another take, which makes it analysis rather than a remix. That
 * overrides the September 14 decision that one page carries every task working
 * from a take, and the reversal is in DOCS/MEMORY.md.
 */
export function remixTasks(tasks: StudioTask[]): StudioTask[] {
  return tasks.filter((task) => task.inputRoles.includes('source') && task.surface === undefined);
}

/**
 * The roles this task reads past the source, in the order it lists them.
 *
 * The source is the take the page opened on, so it is never picked. Anything
 * else is, and until Vevo2 arrived on 2026-09-20 nothing had a second role at
 * all. Read off `inputRoles` rather than off the task id, so a route that adds
 * a third one draws a third picker without touching this file.
 */
export function extraInputRoles(task: StudioTask): string[] {
  return task.inputRoles.filter((role) => role !== 'source');
}

/**
 * Whether this task wants the waveform and the region controls.
 *
 * Read off the fields rather than off the task id, so a route added later is
 * asked what it takes instead of being matched by name. Repaint is the only one
 * today; inpainting would have been the second, and it was dropped when Stable
 * Audio's mask turned out to do nothing.
 */
export function hasRegion(task: StudioTask): boolean {
  const names = new Set(task.fields.map((field) => field.name));
  for (const required of REGION_FIELDS) {
    if (!names.has(required)) return false;
  }
  return true;
}

/**
 * The task the page should drive, given whatever was last picked.
 *
 * Falls back to the first offered rather than to a named id. The registry's
 * order is the order tools are offered everywhere else, and hardcoding a
 * favourite here is exactly how this page came to know only about repaint.
 *
 * A picked id that this build no longer has falls back the same way, which is
 * what happens when a route is dropped between releases while a link to it
 * still exists. Returns undefined only when the build has no remix task at all.
 */
export function chooseTask(
  tasks: StudioTask[],
  picked: string | undefined,
): StudioTask | undefined {
  const offered = remixTasks(tasks);
  return offered.find((task) => task.id === picked) ?? offered[0];
}
