import type { LibraryTake, StudioTask } from '../../shared/types.ts';

/**
 * What a library search matches.
 *
 * A pure function over the list the browser already holds, rather than a query
 * against the service. The whole library arrives in one response as metadata,
 * so filtering here answers on every keystroke without a request, and the rules
 * can be tested without a rendered tree. This is the same reasoning behind
 * `remixTasks.ts` and `takeGroups.ts`: there is no DOM test setup in this
 * project, so logic that matters lives in a module that needs none.
 *
 * Terms narrow. Every word in the query has to match somewhere on a take, so
 * "cover night" finds the cover in Night drive rather than everything that is
 * either. Where each word matches is not the same field, deliberately: the
 * tool, the project and the prompt are all things you half remember about a
 * take at once.
 */

/** The tool that made each take, by task id, for matching on its name. */
export function taskLabels(tasks: StudioTask[]): Map<string, string> {
  return new Map(tasks.map((task) => [task.id, task.shortLabel]));
}

/**
 * Everything on a take that a word can match.
 *
 * The tool name is resolved through the registry rather than stored on the
 * take, so a task renamed in the registry is renamed here too, and the library
 * never becomes a second place a task is named.
 */
function haystack(take: LibraryTake, labels: Map<string, string>): string {
  const tool = take.taskId === undefined ? undefined : labels.get(take.taskId);
  return [take.label, take.projectName, take.title, tool, take.prompt, take.lyrics]
    .filter((part): part is string => part !== undefined)
    .join('\n')
    .toLowerCase();
}

/**
 * The takes a query matches, in the order they came in.
 *
 * An empty query returns the list untouched rather than nothing, because the
 * library with no search is the library.
 */
export function searchTakes(
  takes: LibraryTake[],
  query: string,
  labels: Map<string, string>,
): LibraryTake[] {
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term !== '');
  if (terms.length === 0) return takes;

  return takes.filter((take) => {
    const text = haystack(take, labels);
    return terms.every((term) => text.includes(term));
  });
}
