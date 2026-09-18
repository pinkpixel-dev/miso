import { Search, X } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import type { LibraryTake } from '../../../shared/types.ts';
import { searchTakes } from '../../lib/librarySearch.ts';
import { IconButton, cx } from '../ui.tsx';

/**
 * Choosing one take out of every take in Miso.
 *
 * Search is `searchTakes`, the same function behind the library page. Two ideas
 * of what a search matches would be two things to keep in step, and somebody
 * who found a take by typing part of its prompt in the library expects the same
 * words to find it here.
 *
 * The list is a plain listbox of buttons rather than a combobox. There is no
 * free text to commit, only takes to choose from, and a native list is a thing
 * every screen reader and every keyboard already knows how to walk.
 */

/** How many matches are shown before the list asks for a narrower search. */
const SHOWN = 40;

export function TakePicker({
  takes,
  labels,
  chosen,
  otherChosenId,
  onChoose,
  side,
}: {
  takes: LibraryTake[];
  /** Task ids to their names, for searching by the tool that made a take. */
  labels: Map<string, string>;
  chosen: LibraryTake | undefined;
  /** The take on the other side, which cannot be picked twice. */
  otherChosenId: string | undefined;
  onChoose: (take: LibraryTake) => void;
  /** Named in the label, so two pickers on one page are told apart. */
  side: string;
}) {
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const id = useId();

  const results = useMemo(() => searchTakes(takes, query, labels), [takes, query, labels]);
  const shown = results.slice(0, SHOWN);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <label htmlFor={`${id}-search`} className="text-sm font-medium text-ink">
        {side}
      </label>

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint"
        />
        <input
          id={`${id}-search`}
          ref={search}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, project, title, prompt, lyrics, or tool"
          aria-describedby={`${id}-count`}
          className={cx(
            'w-full rounded-md border border-line bg-canvas py-2 pr-10 pl-9 text-sm text-ink',
            'placeholder:text-ink-faint',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
          )}
        />
        {query === '' ? null : (
          <div className="absolute top-1/2 right-1 -translate-y-1/2">
            <IconButton
              label="Clear the search"
              icon={X}
              onClick={() => {
                setQuery('');
                search.current?.focus();
              }}
            />
          </div>
        )}
      </div>

      <p id={`${id}-count`} aria-live="polite" className="text-xs text-ink-faint">
        {results.length === 0
          ? 'Nothing matches that.'
          : results.length > SHOWN
            ? `${results.length} takes match. Showing the first ${SHOWN}.`
            : `${results.length === 1 ? '1 take' : `${results.length} takes`}.`}
      </p>

      <ul
        // A fixed height rather than one that grows, so picking on one side
        // never moves the other side's picker down the page.
        className="h-48 min-h-0 overflow-y-auto rounded-md border border-line bg-canvas"
      >
        {shown.map((take) => {
          const isChosen = take.assetId === chosen?.assetId;
          const onOtherSide = take.assetId === otherChosenId;

          return (
            <li key={take.assetId}>
              <button
                type="button"
                disabled={onOtherSide}
                aria-current={isChosen ? 'true' : undefined}
                onClick={() => onChoose(take)}
                className={cx(
                  'flex min-h-11 w-full flex-col items-start gap-0.5 px-3 py-2 text-left',
                  'transition-colors duration-150',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                  onOtherSide
                    ? 'cursor-not-allowed opacity-50'
                    : isChosen
                      ? 'bg-raised'
                      : 'hover:bg-raised',
                )}
              >
                <span className="flex w-full min-w-0 items-center gap-2">
                  <span className="truncate text-sm text-ink">{take.label}</span>
                  {isChosen ? (
                    <span className="shrink-0 text-xs text-accent">Picked</span>
                  ) : onOtherSide ? (
                    <span className="shrink-0 text-xs text-ink-faint">On the other side</span>
                  ) : null}
                </span>
                <span className="truncate text-xs text-ink-faint">{take.projectName}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
