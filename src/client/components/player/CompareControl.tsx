import { Columns2, Maximize2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ComparePair } from './useComparePair.ts';
import { comparePath } from '../../lib/routes.ts';
import { Button, Tooltip, cx } from '../ui.tsx';
import { CompareSwitch } from './CompareSwitch.tsx';

/**
 * The switch between a take and the take it was made from.
 *
 * Unarmed it is one button, because until somebody asks for a comparison there
 * is nothing to switch between and loading a second take costs a second stream.
 *
 * Armed it is the two way switch, which is shared with the compare page and
 * lives in CompareSwitch, plus the way out of the comparison. Letting go is
 * the dock's own idea: on the page both takes were picked on purpose, and here
 * one of them was only offered.
 */
export function CompareControl({
  compare,
  currentLabel,
  otherLabel,
  currentId,
  otherId,
}: {
  compare: ComparePair;
  currentLabel: string;
  otherLabel: string;
  /** The two takes, so the pair can be opened on the compare page as it is. */
  currentId: string;
  otherId: string;
}) {
  if (!compare.armed) {
    return (
      <Tooltip label={`Compare against ${otherLabel}`}>
        <Button variant="ghost" onClick={compare.arm} className="shrink-0">
          <Columns2 aria-hidden="true" className="h-4 w-4 shrink-0" />
          Compare
        </Button>
      </Tooltip>
    );
  }

  if (compare.loading) {
    return (
      <Button variant="ghost" disabled busy className="shrink-0">
        Loading {otherLabel}
      </Button>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <CompareSwitch
        leftLabel={otherLabel}
        rightLabel={currentLabel}
        live={compare.side === 'current' ? 'right' : 'left'}
        onFlip={compare.flip}
      />

      {/*
        The way out of the dock and onto the page, carrying the pair that is
        already armed. This is what somebody reaching for a third take wants,
        and the dock cannot offer one: it only knows the take it is holding and
        the take that one was made from.
      */}
      <Tooltip label="Open these two on the compare page">
        <Link
          to={comparePath(currentId, otherId)}
          aria-label={`Compare ${currentLabel} and ${otherLabel} on the compare page`}
          className={cx(
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
            'text-ink-muted transition-colors duration-150 hover:bg-raised hover:text-ink',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          )}
        >
          <Maximize2 aria-hidden="true" className="h-4 w-4" />
        </Link>
      </Tooltip>

      <Tooltip label="Stop comparing and let the other take go">
        <Button variant="ghost" onClick={compare.disarm} className="shrink-0">
          Done
        </Button>
      </Tooltip>
    </div>
  );
}
