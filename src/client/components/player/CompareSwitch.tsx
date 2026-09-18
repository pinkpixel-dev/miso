import { cx } from '../ui.tsx';

/**
 * The two way switch that says which of two takes you can hear.
 *
 * One button that swaps, rather than two that select. There are only ever two
 * sides, so a press always means the other one, and a single control keeps the
 * focus where it was after a flip.
 *
 * Takes are named by their own labels rather than A and B. A label is the thing
 * somebody recognises, and "A" tells you nothing about which take is playing.
 *
 * Both halves reserve the same space whether or not they are live, so flipping
 * does not move whatever sits next to the switch.
 */
export function CompareSwitch({
  leftLabel,
  rightLabel,
  live,
  onFlip,
  disabled,
  shortcut,
}: {
  leftLabel: string;
  rightLabel: string;
  live: 'left' | 'right';
  onFlip: () => void;
  disabled?: boolean;
  /** Named in the accessible label when a key does this too. */
  shortcut?: string;
}) {
  const liveLabel = live === 'left' ? leftLabel : rightLabel;
  const otherLabel = live === 'left' ? rightLabel : leftLabel;

  return (
    <button
      type="button"
      onClick={onFlip}
      disabled={disabled}
      aria-label={`Playing ${liveLabel}. Switch to ${otherLabel}${
        shortcut ? `, or press ${shortcut}` : ''
      }`}
      className={cx(
        'flex min-h-11 min-w-0 items-center gap-1 rounded-md border border-line bg-raised p-1',
        'transition-colors duration-150 hover:border-line-strong',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line',
      )}
    >
      <Side label={leftLabel} live={live === 'left'} />
      <Side label={rightLabel} live={live === 'right'} />
    </button>
  );
}

/**
 * One half of the switch.
 *
 * The live side carries the word "playing" for a screen reader and for anybody
 * who cannot tell the two backgrounds apart.
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
