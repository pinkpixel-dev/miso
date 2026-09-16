import { matchPath } from 'react-router-dom';

/**
 * Where the studio is, read from the path.
 *
 * These are pure functions over a pathname rather than hooks, for two reasons.
 * The shell and the studio provider both need the same answers and must not
 * disagree, and `matchPath` needs no Router around it, so the rules can be
 * tested directly instead of through a rendered tree.
 */

/** The open project. */
export const PROJECT_PATH = '/projects/:id';

/** The create form, which used to be the project route itself. */
export const CREATE_PATH = '/projects/:id/create';

/** The region editor, with or without a source chosen. */
export const REMIX_PATH = '/projects/:id/remix';

/** The app level screens, which are not scoped to a project. */
export const LIBRARY_PATH = '/library';
export const MODELS_PATH = '/models';
export const SETTINGS_PATH = '/settings';

/**
 * The project a path is inside, tool routes included.
 *
 * `end: false` is the whole point. A plain string pattern matches to the end,
 * so `/projects/abc/remix/xyz` did not match `/projects/:id` and the studio
 * fell back to the last project it remembered. That mostly looked fine, which
 * is worse than failing: opening a project, going to remix and reloading left
 * the studio with no project at all.
 */
export function projectIdFrom(pathname: string): string | undefined {
  return matchPath({ path: PROJECT_PATH, end: false }, pathname)?.params.id;
}

/**
 * Whether this path takes the whole width.
 *
 * The takes column is per project and sits beside the create form. Two kinds of
 * page drop it, for two different reasons.
 *
 * The project page and the remix page carry their own list of takes, so keeping
 * the column would put the same list on screen twice.
 *
 * The library, Models and Settings are app level and have nothing to do with
 * whichever project happens to be open, so a project's takes beside them
 * belong to something else. The library is the sharper case: it is every
 * project's takes, and one project's column next to that is the same list at
 * two scopes. What that costs is sight of a running generation while you
 * install a model: the dock still plays and the job still runs, so the progress
 * view goes rather than the work. Decided September 15, 2026.
 *
 * The project page is matched with `end: true` and the remix page is not, and
 * that difference is load bearing. A prefix match on the project would make
 * every nested page full width, which would take the takes column away from
 * the create form sitting one segment further down.
 */
export function wantsFullWidth(pathname: string): boolean {
  if (matchPath({ path: REMIX_PATH, end: false }, pathname) !== null) return true;
  if (matchPath({ path: LIBRARY_PATH, end: true }, pathname) !== null) return true;
  if (matchPath({ path: MODELS_PATH, end: true }, pathname) !== null) return true;
  if (matchPath({ path: SETTINGS_PATH, end: true }, pathname) !== null) return true;
  return matchPath({ path: PROJECT_PATH, end: true }, pathname) !== null;
}

/** Every take in Miso, whatever project it is in. */
export function libraryPath(): string {
  return LIBRARY_PATH;
}

/** The project itself. */
export function projectPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`;
}

/** The create form for a project. */
export function createPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/create`;
}

/** The remix route for a take, or for picking one. */
export function remixPath(projectId: string, assetId?: string): string {
  const base = `/projects/${encodeURIComponent(projectId)}/remix`;
  return assetId === undefined ? base : `${base}/${encodeURIComponent(assetId)}`;
}
