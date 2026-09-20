import { Scissors, SplitSquareHorizontal } from 'lucide-react';
import { RegionControls } from '../RegionControls.tsx';
import { formatSeconds, type Region } from '../../lib/region.ts';
import { Button } from '../ui.tsx';

/**
 * Keeping part of a track, or cutting it in two.
 *
 * Two operations that both take a position and do very different things with
 * it, kept together because they are the same decision seen from either side.
 * Trim keeps what is inside the region and is an edit like any other, so it can
 * be undone. Split writes two takes and touches the service, so it cannot.
 *
 * That difference is why the split button says what it will do rather than
 * naming the operation. A button that quietly writes two rows into a project
 * should say so before it is pressed.
 */
export function CutControls({
  region,
  duration,
  playhead,
  busy,
  onRegion,
  onTrim,
  onSplit,
}: {
  region: Region;
  duration: number;
  /** Where the play head is, which is where a split cuts. */
  playhead: number;
  busy: boolean;
  onRegion: (region: Region) => void;
  onTrim: () => void;
  onSplit: () => void;
}) {
  const kept = region.end - region.start;
  const trimsNothing = region.start <= 0 && region.end >= duration;
  const splitAtEnd = playhead <= 0 || playhead >= duration;

  return (
    <div className="flex flex-col gap-4">
      <RegionControls region={region} duration={duration} onRegion={onRegion} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          variant="secondary"
          disabled={busy || trimsNothing || kept <= 0}
          onClick={onTrim}
          className="min-h-11"
        >
          <Scissors aria-hidden="true" className="h-4 w-4 shrink-0" />
          Keep only the region
        </Button>

        <p className="text-sm text-ink-muted">
          {trimsNothing
            ? 'The region covers the whole track, so there is nothing to trim away.'
            : `Throws away everything outside ${formatSeconds(region.start)} to ${formatSeconds(region.end)}.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
        <Button
          variant="secondary"
          disabled={busy || splitAtEnd}
          onClick={onSplit}
          className="min-h-11"
        >
          <SplitSquareHorizontal aria-hidden="true" className="h-4 w-4 shrink-0" />
          Split here into two takes
        </Button>

        <p className="text-sm text-ink-muted">
          {splitAtEnd
            ? 'Move the play head into the track to split it. Click the waveform to place it.'
            : `Cuts at ${formatSeconds(playhead)} and saves both halves. This one writes to the project straight away.`}
        </p>
      </div>
    </div>
  );
}
