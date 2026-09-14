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
 * Whether this path is a tool that takes the whole width.
 *
 * The takes column is per project and sits beside the create form. A remix page
 * carries its own source list, so showing both would be the same list twice.
 */
export function wantsFullWidth(pathname: string): boolean {
  return matchPath({ path: REMIX_PATH, end: false }, pathname) !== null;
}

/** The remix route for a take, or for picking one. */
export function remixPath(projectId: string, assetId?: string): string {
  const base = `/projects/${encodeURIComponent(projectId)}/remix`;
  return assetId === undefined ? base : `${base}/${encodeURIComponent(assetId)}`;
}
