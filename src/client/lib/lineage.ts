import type { Asset, Job, StudioTask } from '../../shared/types.ts';

/**
 * Where a take came from, and what came out of it.
 *
 * Every fact this needs is already in the browser. An asset names the job that
 * made it, a job names the assets it read, and the project's whole job history
 * is already loaded as `allJobs`. So the graph can be walked without a new
 * endpoint, the same way `takeGroups.ts` decides how a take was made without
 * one.
 *
 * Pure, and tested on its own, for the reason `routes.ts` and `takeGroups.ts`
 * are: more than one view will want the same answer and they must not disagree.
 * Today the take detail panel is the only caller. A lineage page later is a
 * second view over these functions rather than a second walk.
 */

/** One take in a chain, and what it was to the step below it. */
export interface LineageStep {
  assetId: string;
  /**
   * The take itself, when it is in the project on screen.
   *
   * Undefined for a take this browser cannot see, which today means one in
   * another project. A step keeps its id either way, so a chain stays the right
   * length instead of quietly losing a link.
   */
  asset: Asset | undefined;
  /** What this take was to the job that read it, for example `source`. */
  role: string;
  /** The job that made this take, when one did. Imported takes have none. */
  job: Job | undefined;
}

/** Which job produced which take, built once rather than scanned per lookup. */
function producersOf(jobs: Job[]): Map<string, Job> {
  const byAsset = new Map<string, Job>();
  for (const job of jobs) {
    for (const assetId of job.outputAssetIds) byAsset.set(assetId, job);
  }
  return byAsset;
}

/**
 * Everything a take was made from, nearest first.
 *
 * Breadth first rather than a single line, because a job is allowed more than
 * one input. Nothing in Miso reads two takes today, so every chain this returns
 * is currently a line, but a walk that followed only the first input would have
 * to be rewritten the first time something does.
 *
 * A take reachable by two paths appears once, at the first depth it is found.
 * The seen set is also what stops a cycle: jobs are always created after the
 * takes they read, so the graph cannot loop, and a database that says otherwise
 * should give a short answer rather than hang the browser.
 */
export function ancestorsOf(assetId: string, assets: Asset[], jobs: Job[]): LineageStep[] {
  const producers = producersOf(jobs);
  const byId = new Map(assets.map((asset) => [asset.id, asset]));

  const steps: LineageStep[] = [];
  const seen = new Set<string>([assetId]);
  let frontier = [assetId];

  while (frontier.length > 0) {
    const next: string[] = [];

    for (const id of frontier) {
      for (const input of producers.get(id)?.inputs ?? []) {
        if (seen.has(input.assetId)) continue;
        seen.add(input.assetId);
        steps.push({
          assetId: input.assetId,
          asset: byId.get(input.assetId),
          role: input.role,
          job: producers.get(input.assetId),
        });
        next.push(input.assetId);
      }
    }

    frontier = next;
  }

  return steps;
}

/**
 * The takes made directly from this one.
 *
 * One level only. A descendant's own descendants are one click away on its own
 * panel, so listing the whole subtree here would put the same information on
 * screen twice and make a long list out of a short question.
 *
 * The role carried is the role this take had in the job that read it, which is
 * what makes the row say how it was used rather than only that it was.
 */
export function descendantsOf(assetId: string, assets: Asset[], jobs: Job[]): LineageStep[] {
  const producers = producersOf(jobs);
  const byId = new Map(assets.map((asset) => [asset.id, asset]));

  const steps: LineageStep[] = [];
  const seen = new Set<string>();

  for (const job of jobs) {
    const input = job.inputs.find((entry) => entry.assetId === assetId);
    if (!input) continue;

    for (const producedId of job.outputAssetIds) {
      if (seen.has(producedId)) continue;
      seen.add(producedId);
      steps.push({
        assetId: producedId,
        asset: byId.get(producedId),
        role: input.role,
        job: producers.get(producedId),
      });
    }
  }

  return steps;
}

/**
 * Whether this take's source is gone rather than never having existed.
 *
 * `asset_lineage` rows are removed with the asset they point at, so deleting a
 * take erases the record that anything was made from it. The job that read it
 * then reports no inputs, which is exactly what a job that reads nothing
 * reports.
 *
 * The task tells them apart. `inputRoles` is non-empty only for a task that
 * takes audio, so a job whose task takes audio and whose inputs are empty had a
 * source and lost it. Without this the panel would show a repaint as though it
 * had been generated from nothing.
 */
export function sourceWasDeleted(job: Job | undefined, tasks: StudioTask[]): boolean {
  if (!job || job.inputs.length > 0) return false;
  const task = tasks.find((entry) => entry.id === job.taskId);
  return task !== undefined && task.inputRoles.length > 0;
}
