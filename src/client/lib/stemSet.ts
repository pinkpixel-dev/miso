import type { Asset, Job } from '../../shared/types.ts';
import { descendantsOf } from './lineage.ts';

/**
 * What belongs in a separation's deck: its own stems, plus anything converted
 * from them.
 *
 * A separation writes its stems under one job id, which is what makes a set a
 * set. A voice conversion reads one of those stems and writes its result under
 * its own job, so the set's output list cannot see it. Without this the
 * converted vocal exists in the library and is not in the one place it is
 * useful, which is beside the instrumental it has to be sung over.
 *
 * Pure and tested on its own, for the reason `lineage.ts` and `takeGroups.ts`
 * are: this project has no DOM test setup, so a rule that lives inside the page
 * cannot be tested at all.
 */

export interface StemEntry {
  asset: Asset;
  /**
   * The stem this was converted from, when it is not one of the separation's
   * own outputs.
   *
   * Carries the asset rather than a flag so the deck can say what it was made
   * from without looking it up a second time.
   */
  convertedFrom: Asset | undefined;
}

/**
 * The separation's stems in the order it wrote them, each followed by what was
 * made from it.
 *
 * A conversion sits directly under its source rather than at the end, because
 * the two are the thing being compared: mute one, listen to the other.
 *
 * One level deep. A conversion of a conversion is not listed under the
 * conversion it came from, which nothing can produce a reason for yet.
 *
 * Only stems are picked up. A mix made from this set is also a descendant of
 * every stem in it, and a mix of a mix is not what this page is for.
 */
export function stemSet(job: Job | undefined, assets: Asset[], jobs: Job[]): StemEntry[] {
  if (!job) return [];

  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const entries: StemEntry[] = [];
  const seen = new Set<string>();

  for (const id of job.outputAssetIds) {
    const asset = byId.get(id);
    if (!asset || seen.has(id)) continue;

    seen.add(id);
    entries.push({ asset, convertedFrom: undefined });

    for (const step of descendantsOf(id, assets, jobs)) {
      if (step.asset === undefined || step.asset.kind !== 'stem' || seen.has(step.assetId)) continue;
      seen.add(step.assetId);
      entries.push({ asset: step.asset, convertedFrom: asset });
    }
  }

  return entries;
}
