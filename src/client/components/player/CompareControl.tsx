import { Columns2 } from 'lucide-react';
import type { ComparePair } from './useComparePair.ts';
import { Button, Tooltip, cx } from '../ui.tsx';

/**
 * The switch between a take and the take it was made from.
 *
 * Unarmed it is one button, because until somebody asks for a comparison there
 * is nothing to switch between and loading a second take costs a second stream.
 *
 * Armed it is a two way switch naming both takes. Their own labels rather than
 * A and B: a label is the thing somebody recognises, and "A" tells you nothing
 * about which take you are hearing. Which side is live is said in a word as
 * well as shown, because style on its own is not a signal.
 *
 * The switch keeps the same width whichever side is live, so flipping does not
 * move the transport next to it.
 */
export function CompareControl({
  compare,
  currentLabel,
  otherLabel,
}: {
  compare: ComparePair;
  currentLabel: string;
  otherLabel: string;
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

  const live = compare.side === 'current' ? currentLabel : otherLabel;

  return (
    <div className="flex min-w-0 items-center gap-2">
      {/*
        One button that swaps, rather than two that select. There are only ever
        two sides, so a press always means the other one, and a single control
        keeps the focus where it was after a flip.
      */}
      <button
        type="button"
        onClick={compare.flip}
        aria-label={`Playing ${live}. Switch to ${
          compare.side === 'current' ? otherLabel : currentLabel
        }`}
        className={cx(
          'flex min-h-11 min-w-0 items-center gap-1 rounded-md border border-line bg-raised p-1',
          'transition-colors duration-150 hover:border-line-strong',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        )}
      >
        <Side label={otherLabel} live={compare.side === 'other'} />
        <Side label={currentLabel} live={compare.side === 'current'} />
      </button>

      <Tooltip label="Stop comparing and let the other take go">
        <Button variant="ghost" onClick={compare.disarm} className="shrink-0">
          Done
        </Button>
      </Tooltip>
    </div>
  );
}

/**
 * One half of the switch.
 *
 * The live side carries the word "playing" for a screen reader and for anybody
 * who cannot tell the two backgrounds apart. Both halves reserve the same space
 * whether or not they are live.
 */
function Side({ label, live }: { label: string; live: boolean }) {
  return (
    <span
      className={cx(
        'max-w-[9rem] truncate rounded px-2 py-1 text-xs transition-colors duration-150',
        live ? 'bg-accent text-accent-ink font-medium' : 'text-ink-muted',
      )}
    >
      {label}
      {live ? <span className="sr-only"> (playing)</span> : null}
    </span>
  );
}
