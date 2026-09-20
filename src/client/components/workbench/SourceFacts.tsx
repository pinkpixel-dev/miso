import type { WorkbenchSource } from '../../lib/useWorkbench.ts';
import { formatSeconds } from '../../lib/region.ts';

/**
 * What the file actually is, as opposed to what its name suggests.
 *
 * This is here because the sample rate is the thing people get wrong and the
 * thing separation refuses over. A 48 kHz file named like a CD rip is the
 * ordinary case, and the only way to find out today is to queue a job and read
 * the error it comes back with.
 */

function channelsLabel(count: number): string {
  if (count === 1) return 'Mono';
  if (count === 2) return 'Stereo';
  return `${count} channels`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="truncate text-sm text-ink">{value}</dd>
    </div>
  );
}

export function SourceFacts({ source }: { source: WorkbenchSource }) {
  const format = [source.container, source.codec]
    .filter((part) => part !== undefined && part !== '')
    .join(', ');

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <Fact label="Length" value={formatSeconds(source.durationSeconds)} />
        <Fact label="Sample rate" value={`${(source.sampleRate / 1000).toFixed(1)} kHz`} />
        <Fact label="Channels" value={channelsLabel(source.channels.length)} />
        <Fact label="Format" value={format === '' ? 'Read by the browser' : format} />
      </dl>

      {source.resampledOnDecode ? (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink">
          This browser would not decode the file at its own sample rate, so it converted it to{' '}
          {(source.sampleRate / 1000).toFixed(1)} kHz on the way in. The audio is fine. It has just
          been through one more conversion than it needed.
        </p>
      ) : null}
    </div>
  );
}
