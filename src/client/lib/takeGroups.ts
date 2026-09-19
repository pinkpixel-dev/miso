import type { Asset, Job, StudioTask } from '../../shared/types.ts';

/**
 * Takes grouped by how they were made.
 *
 * Every fact this needs is already in the browser. `StudioTask.inputRoles` says
 * whether a task reads audio, the jobs list holds every job in the project
 * including ones cleared from the queue, and a job names the task that ran. So
 * a take that came out of a repaint can be told from one that was generated
 * from nothing without a new endpoint, a new column, or a migration.
 *
 * This is a pure function over those three lists rather than a hook, for the
 * same reason `routes.ts` is: the project page and the takes column both need
 * the same answer and must not disagree, and a pure module can be tested
 * without a rendered tree.
 *
 * Sections are flat. A repaint of a repaint sits beside every other repaint
 * with nothing saying where it came from, because that is a tree and this is a
 * list. The lineage view is what answers it.
 */

/** One heading on the project page, with the takes under it. */
export interface TakeSection {
  /** Stable across renders, for a React key. */
  key: string;
  label: string;
  takes: Asset[];
}

/**
 * Where a take came from.
 *
 * `rank` orders the sections against each other: what you made first, then
 * what you made out of something else, then what you brought in, then the
 * pieces a separator produced, and last the takes whose task this build no
 * longer has.
 */
type Origin =
  | { rank: 0; key: 'generated'; label: string }
  | { rank: 1; key: string; label: string; taskOrder: number }
  | { rank: 2; key: 'imported'; label: string }
  | { rank: 3; key: 'stems'; label: string }
  | { rank: 4; key: 'mixes'; label: string }
  | { rank: 5; key: 'unknown'; label: string };

const GENERATED: Origin = { rank: 0, key: 'generated', label: 'Generated songs' };
const IMPORTED: Origin = { rank: 2, key: 'imported', label: 'Imported audio' };
const STEMS: Origin = { rank: 3, key: 'stems', label: 'Stems' };
const MIXES: Origin = { rank: 4, key: 'mixes', label: 'Mixes' };
const UNKNOWN: Origin = { rank: 5, key: 'unknown', label: 'Other takes' };

/** Which job produced which take, built once instead of scanned per take. */
function producersOf(jobs: Job[]): Map<string, Job> {
  const byAsset = new Map<string, Job>();
  for (const job of jobs) {
    for (const assetId of job.outputAssetIds) byAsset.set(assetId, job);
  }
  return byAsset;
}

function originOf(
  asset: Asset,
  producers: Map<string, Job>,
  tasks: Map<string, { task: StudioTask; order: number }>,
): Origin {
  // A stem is a stem whatever produced it. Checked first so a separator's
  // outputs stay together rather than splitting across the tool sections.
  if (asset.kind === 'stem') return STEMS;

  // A mix likewise, and for the sharper reason: it is a whole track, so under
  // the generated heading it would look like something a model wrote. Telling
  // those apart is most of why somebody recombines stems in the first place.
  if (asset.kind === 'mix') return MIXES;

  const job = producers.get(asset.id);
  if (job === undefined) return IMPORTED;

  // A take can outlive the task that made it: the registry is code and the
  // project is data. It still belongs on the page, so it gets a plain heading
  // rather than disappearing.
  const found = tasks.get(job.taskId);
  if (found === undefined) return UNKNOWN;

  // The real split. A task that reads no audio generated its output from
  // nothing, which is what makes it a song rather than something made out of
  // another take. Reading this off inputRoles rather than off the shape of the
  // task id means a route added later lands in the right place on its own.
  if (found.task.inputRoles.length === 0) return GENERATED;

  // shortLabel rather than label, because this is a heading. `label` is the
  // instruction a tool is offered under, "Repaint a section", which tells the
  // reader to do something when it is only naming the takes underneath it.
  return { rank: 1, key: found.task.id, label: found.task.shortLabel, taskOrder: found.order };
}

/** Newest first, matching the takes column. Ties keep the order they arrived in. */
function newestFirst(takes: Asset[]): Asset[] {
  return [...takes].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/**
 * Every take in the project, grouped and ordered for the project page.
 *
 * Empty sections are never returned, so a project with no imports has no
 * Imported heading standing over nothing.
 */
export function groupTakes(assets: Asset[], jobs: Job[], tasks: StudioTask[]): TakeSection[] {
  const producers = producersOf(jobs);
  const byId = new Map(tasks.map((task, order) => [task.id, { task, order }]));

  const sections = new Map<string, { origin: Origin; takes: Asset[] }>();

  for (const asset of assets) {
    const origin = originOf(asset, producers, byId);
    const existing = sections.get(origin.key);
    if (existing === undefined) {
      sections.set(origin.key, { origin, takes: [asset] });
    } else {
      existing.takes.push(asset);
    }
  }

  return [...sections.values()]
    .sort((left, right) => {
      if (left.origin.rank !== right.origin.rank) return left.origin.rank - right.origin.rank;
      // Within the derived sections, follow the order the registry lists its
      // tasks in, so the page matches how tasks are offered everywhere else.
      const leftOrder = left.origin.rank === 1 ? left.origin.taskOrder : 0;
      const rightOrder = right.origin.rank === 1 ? right.origin.taskOrder : 0;
      return leftOrder - rightOrder;
    })
    .map(({ origin, takes }) => ({ key: origin.key, label: origin.label, takes: newestFirst(takes) }));
}

/**
 * The takes the create page's column shows.
 *
 * Generated songs only. Imports and anything made out of another take live on
 * the project page, so the column beside the form holds what the form put
 * there. Both pages read this rule from here rather than each deciding for
 * themselves, which is the disagreement `routes.ts` exists to prevent.
 */
export function generatedTakes(assets: Asset[], jobs: Job[], tasks: StudioTask[]): Asset[] {
  const producers = producersOf(jobs);
  const byId = new Map(tasks.map((task, order) => [task.id, { task, order }]));
  return assets.filter((asset) => originOf(asset, producers, byId).rank === 0);
}
