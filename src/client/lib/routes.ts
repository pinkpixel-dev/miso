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

/** One separation's stems, keyed by the job that made them. */
export const STEMS_PATH = '/projects/:id/stems/:jobId';

/**
 * The audio workbench, which is the one tool page with no model behind it.
 *
 * Project scoped like the other tool routes, because what it saves has to land
 * in a project, but it is deliberately not under `remix`. Everything on that
 * page queues a job and waits on a GPU. Nothing here does.
 */
export const TOOLS_PATH = '/projects/:id/tools';

/** The app level screens, which are not scoped to a project. */
export const LIBRARY_PATH = '/library';
export const COMPARE_PATH = '/compare';
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
 * the column would put the same list on screen twice. The workbench is the same
 * case: it picks what to work on itself, and it needs the width for a waveform
 * you are placing a boundary on to the tenth of a second.
 *
 * The library, Compare, Models and Settings are app level and have nothing to do with
 * whichever project happens to be open, so a project's takes beside them
 * belong to something else. Compare is the same case as the library twice
 * over, since its two takes can be from two different projects. The library is
 * the sharper case: it is every
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
  if (matchPath({ path: STEMS_PATH, end: true }, pathname) !== null) return true;
  if (matchPath({ path: TOOLS_PATH, end: true }, pathname) !== null) return true;
  if (matchPath({ path: LIBRARY_PATH, end: true }, pathname) !== null) return true;
  if (matchPath({ path: COMPARE_PATH, end: true }, pathname) !== null) return true;
  if (matchPath({ path: MODELS_PATH, end: true }, pathname) !== null) return true;
  if (matchPath({ path: SETTINGS_PATH, end: true }, pathname) !== null) return true;
  return matchPath({ path: PROJECT_PATH, end: true }, pathname) !== null;
}

/** Every take in Miso, whatever project it is in. */
export function libraryPath(): string {
  return LIBRARY_PATH;
}

/**
 * Two takes heard against each other.
 *
 * Asset ids alone, with no project, because the page resolves them against the
 * library and a library row already carries the project it lives in. A link
 * naming a take that has since been deleted opens the page with that side
 * empty rather than failing.
 */
export function comparePath(a?: string, b?: string): string {
  const params = new URLSearchParams();
  if (a !== undefined) params.set('a', a);
  if (b !== undefined) params.set('b', b);
  const query = params.toString();
  return query === '' ? COMPARE_PATH : `${COMPARE_PATH}?${query}`;
}

/** The project itself. */
export function projectPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`;
}

/**
 * The create form for a project, optionally seeded by a past job.
 *
 * The job id goes in the address rather than in router state so that it
 * survives a reload, can be linked to, and says on screen what the form was
 * filled in from. The form ignores an id that does not name a job in this
 * project, so a stale link opens an ordinary empty form instead of breaking.
 */
export function createPath(projectId: string, fromJobId?: string): string {
  const base = `/projects/${encodeURIComponent(projectId)}/create`;
  return fromJobId === undefined ? base : `${base}?from=${encodeURIComponent(fromJobId)}`;
}

/**
 * The stems one separation produced.
 *
 * The job id rather than an asset id, because a job is what holds a set of
 * stems together: separation writes one asset per named output and puts the
 * same job id on every row. Naming one stem would mean finding its siblings
 * again on the way in.
 */
export function stemsPath(projectId: string, jobId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/stems/${encodeURIComponent(jobId)}`;
}

/**
 * The workbench, optionally opened on a take that is already in the project.
 *
 * The take is in the address for the same reason it is on the remix route: a
 * take's own detail panel can link straight here with it loaded, and the
 * address then says what is being edited. Without one the page asks for
 * something to work on, and a file dropped from disk never gets an id at all
 * until it is saved.
 */
export function toolsPath(projectId: string, assetId?: string): string {
  const base = `/projects/${encodeURIComponent(projectId)}/tools`;
  return assetId === undefined ? base : `${base}?take=${encodeURIComponent(assetId)}`;
}

/**
 * The remix route for a take, or for picking one, optionally on a named tool.
 *
 * The tool goes in the address for the same reason the source does: so it can
 * be linked to. One page carries every task that works from a take, which is
 * right when you are deciding what to do with one and wrong when you already
 * know. Splitting a take into stems is not a remix of it in any ordinary sense,
 * and burying it in a picker labelled Remix is how it stayed unfindable.
 *
 * An id this build no longer has falls back through `chooseTask` to the first
 * tool offered, which is what already happens to a dropped route.
 */
export function remixPath(projectId: string, assetId?: string, taskId?: string): string {
  const base = `/projects/${encodeURIComponent(projectId)}/remix`;
  const path = assetId === undefined ? base : `${base}/${encodeURIComponent(assetId)}`;
  return taskId === undefined ? path : `${path}?task=${encodeURIComponent(taskId)}`;
}

/** The id of the separation task, which several places link straight to. */
export const SEPARATE_TASK_ID = 'stems.separate';
