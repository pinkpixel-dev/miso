import type { RefObject } from 'react';
import type { Asset, LibraryTake } from '../../../shared/types.ts';
import type { DeckSideState } from '../player/useCompareDeck.ts';
import { TakePicker } from './TakePicker.tsx';
import { cx } from '../ui.tsx';

/**
 * One side of the comparison: what is picked, and what it looks like.
 *
 * Both waveforms are drawn, unlike the dock's compare where the silent take is
 * hidden. On a page the two takes are the content, and seeing that one is
 * longer or quieter than the other is half of what a comparison is for.
 *
 * The container element is always mounted, whether or not a take is picked.
 * Wavesurfer needs something real to attach to, and a container that comes and
 * goes with the take would change the height of the page on every pick.
 */
export function ComparePane({
  side,
  label,
  takes,
  labels,
  chosen,
  loaded,
  otherChosenId,
  onChoose,
  state,
  container,
  audible,
}: {
  /** Which side this is, said in words for anybody who cannot see the styling. */
  side: string;
  label: string;
  takes: LibraryTake[];
  labels: Map<string, string>;
  chosen: LibraryTake | undefined;
  /** The fetched take, which is what carries the waveform. */
  loaded: Asset | undefined;
  otherChosenId: string | undefined;
  onChoose: (take: LibraryTake) => void;
  state: DeckSideState;
  container: RefObject<HTMLDivElement | null>;
  audible: boolean;
}) {
  return (
    <section
      aria-label={`${side}: ${chosen?.label ?? 'nothing picked'}`}
      className={cx(
        'flex min-w-0 flex-col gap-3 rounded-lg border bg-surface p-4',
        'transition-colors duration-150',
        audible ? 'border-accent' : 'border-line',
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{chosen?.label ?? 'Pick a take'}</p>
          <p className="truncate text-xs text-ink-faint">
            {chosen ? chosen.projectName : 'Any take, from any project'}
          </p>
        </div>

        {/*
          Which side you can hear is said in a word and not only shown by the
          border, because a colour on its own is not a signal.
        */}
        <p
          className={cx(
            'shrink-0 rounded px-2 py-1 text-xs',
            audible ? 'bg-accent text-accent-ink font-medium' : 'text-ink-muted',
          )}
        >
          {audible ? 'Playing' : 'Silent'}
        </p>
      </div>

      <div className="min-w-0">
        <div ref={container} className="w-full" />
        {loaded === undefined || state.error !== undefined ? (
          <div className="flex h-12 items-center" aria-hidden="true">
            <div className="h-px w-full bg-line" />
          </div>
        ) : null}
      </div>

      {state.loading ? (
        <p aria-live="polite" className="text-xs text-ink-muted">
          Loading {chosen?.label}.
        </p>
      ) : null}

      {state.error ? (
        <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink">
          This take could not be loaded: {state.error} The other side is unaffected, so pick
          something else here or try Export to check the file itself.
        </p>
      ) : null}

      <TakePicker
        takes={takes}
        labels={labels}
        chosen={chosen}
        otherChosenId={otherChosenId}
        onChoose={onChoose}
        side={label}
      />
    </section>
  );
}
