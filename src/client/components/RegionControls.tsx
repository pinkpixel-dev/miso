import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  COARSE_NUDGE_SECONDS,
  NUDGE_SECONDS,
  clampRegion,
  moveBoundary,
  type Region,
} from '../../lib/region.ts';

/**
 * The region as two numbers you can type and step.
 *
 * This is the keyboard path and the accessible name for the region, not a
 * fallback for the waveform. A highlighted rectangle cannot be reached by tab,
 * read by a screen reader, or set to exactly 32.4 seconds, so the boxes are the
 * real control and the rectangle is the picture of it.
 *
 * Arrow keys move a boundary by a tenth of a second, and by a second with shift
 * held. The browser's own arrow handling on a number input would step by the
 * `step` attribute and would not clamp against the other boundary, so the keys
 * are handled here instead.
 */

/** A boundary being typed, kept as text so a half-typed number is not fought. */
type Draft = { start: string; end: string };

function draftOf(region: Region): Draft {
  return { start: region.start.toFixed(1), end: region.end.toFixed(1) };
}

export function RegionControls({
  region,
  duration,
  onRegion,
}: {
  region: Region;
  duration: number;
  onRegion: (region: Region) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(region));

  // A drag moves the region without going through these boxes, so they follow
  // it. Typing is not interrupted, because a draft only exists while a box has
  // focus and this runs on the committed value.
  useEffect(() => {
    setDraft(draftOf(region));
  }, [region.start, region.end]);

  function commit(side: 'start' | 'end', raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setDraft(draftOf(region));
      return;
    }

    const next = side === 'start' ? { ...region, start: parsed } : { ...region, end: parsed };
    onRegion(clampRegion(next, duration));
  }

  function onKey(side: 'start' | 'end', event: KeyboardEvent<HTMLInputElement>) {
    const direction = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
    if (direction === 0) return;

    // Taken over from the browser so the step matches the other boundary's
    // limit rather than the input's own step attribute.
    event.preventDefault();
    const step = event.shiftKey ? COARSE_NUDGE_SECONDS : NUDGE_SECONDS;
    onRegion(moveBoundary(region, side, direction * step, duration));
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-ink">Region</legend>
      <p id="region-hint" className="text-sm text-ink-faint">
        Drag on the waveform, or type the seconds here. Up and down arrows move a tenth of a
        second, and a whole second with shift held.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        {(['start', 'end'] as const).map((side) => (
          <div key={side} className="flex flex-col gap-1.5">
            <label htmlFor={`region-${side}`} className="text-sm font-medium text-ink">
              {side === 'start' ? 'Start' : 'End'} in seconds
            </label>
            <input
              id={`region-${side}`}
              type="number"
              inputMode="decimal"
              min={0}
              max={duration}
              step={NUDGE_SECONDS}
              aria-describedby="region-hint"
              value={draft[side]}
              onChange={(event) => setDraft({ ...draft, [side]: event.target.value })}
              onBlur={(event) => commit(side, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commit(side, event.currentTarget.value);
                  return;
                }
                onKey(side, event);
              }}
              className="w-32 rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink transition-colors duration-150 hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}
