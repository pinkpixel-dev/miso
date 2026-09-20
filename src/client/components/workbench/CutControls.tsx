import { Scissors, SplitSquareHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RegionControls } from '../RegionControls.tsx';
import { formatSeconds, type Region } from '../../lib/region.ts';
import { Button, Field } from '../ui.tsx';

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
 *
 * The cut point has a number box for the same reason the region does. Clicking
 * the waveform is the quick way and it needs a pointer, so it cannot be the
 * only way. The box is the control, and the cursor is the picture of it.
 */
export function CutControls({
  region,
  duration,
  cutPoint,
  busy,
  onRegion,
  onCutPoint,
  onTrim,
  onSplit,
}: {
  region: Region;
  duration: number;
  /** Where the cut would happen, in seconds. */
  cutPoint: number;
  busy: boolean;
  onRegion: (region: Region) => void;
  onCutPoint: (seconds: number) => void;
  onTrim: () => void;
  onSplit: () => void;
}) {
  const kept = region.end - region.start;
  const trimsNothing = region.start <= 0 && region.end >= duration;
  const splitAtEnd = cutPoint <= 0 || cutPoint >= duration;

  // Held as text while it is being typed, so a half finished number is not
  // rounded out from under the person typing it. The same pattern the region
  // boxes use, and for the same reason.
  const [draft, setDraft] = useState(() => cutPoint.toFixed(1));

  // A click on the waveform sets the point without going through this box, so
  // the box follows it.
  useEffect(() => {
    setDraft(cutPoint.toFixed(1));
  }, [cutPoint]);

  function commitCutPoint(raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      setDraft(cutPoint.toFixed(1));
      return;
    }
    onCutPoint(Math.max(0, Math.min(duration, value)));
  }

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

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-line pt-4">
        <Field
          label="Split at seconds"
          hint="Or click the waveform where you want the cut."
          type="number"
          inputMode="decimal"
          min={0}
          max={duration}
          step={0.1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commitCutPoint(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            commitCutPoint(event.currentTarget.value);
          }}
          className="w-32"
        />

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
            ? 'Choose a point inside the track to split it. Click the waveform, or type the seconds.'
            : `Cuts at ${formatSeconds(cutPoint)} and saves both halves. This one writes to the project straight away.`}
        </p>
      </div>
    </div>
  );
}
