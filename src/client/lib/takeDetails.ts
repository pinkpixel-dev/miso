import type { Job } from '../../shared/types.ts';

/** Finds the job that produced an asset, including jobs cleared from the queue. */
export function findProducingJob(jobs: Job[], assetId: string): Job | undefined {
  return jobs.find((job) => job.outputAssetIds.includes(assetId));
}

/** Returns recorded text without coercing, trimming, or otherwise changing it. */
export function stringJobParam(job: Job, name: string): string | undefined {
  const value = job.params[name];
  return typeof value === 'string' ? value : undefined;
}
