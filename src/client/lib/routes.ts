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
 * The takes column is per project and sits beside the create form. Both pages
 * that drop it carry their own list of takes, so keeping the column would put
 * the same list on screen twice.
 *
 * The project page is matched with `end: true` and the remix page is not, and
 * that difference is load bearing. A prefix match on the project would make
 * every nested page full width, which would take the takes column away from
 * the create form sitting one segment further down.
 */
export function wantsFullWidth(pathname: string): boolean {
  if (matchPath({ path: REMIX_PATH, end: false }, pathname) !== null) return true;
  return matchPath({ path: PROJECT_PATH, end: true }, pathname) !== null;
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
