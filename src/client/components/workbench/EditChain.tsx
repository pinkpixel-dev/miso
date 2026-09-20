import { Undo2, X } from 'lucide-react';
import { describeEdit, type Edit } from '../../lib/edits.ts';
import { Button } from '../ui.tsx';

/**
 * What has been done to the audio, in the order it was done.
 *
 * The list is the page's memory, not a decoration. Rendering means applying
 * exactly these entries to the untouched source, so what is written here is
 * what you are hearing, and undo is this list one item shorter.
 *
 * Order is shown because order changes the result. A normalize before a fade
 * and a normalize after one are different audio, and without the sequence on
 * screen there is no way to tell which one is in force.
 */
export function EditChain({
  edits,
  onUndo,
  onClear,
}: {
  edits: Edit[];
  onUndo: () => void;
  onClear: () => void;
}) {
  return (
    <section aria-labelledby="edit-chain-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="edit-chain-heading" className="text-sm font-medium text-ink">
          Applied edits
        </h3>

        {edits.length === 0 ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={onUndo} className="min-h-11">
              <Undo2 aria-hidden="true" className="h-4 w-4 shrink-0" />
              Undo the last one
            </Button>
            <Button variant="ghost" onClick={onClear} className="min-h-11">
              <X aria-hidden="true" className="h-4 w-4 shrink-0" />
              Start again
            </Button>
          </div>
        )}
      </div>

      {edits.length === 0 ? (
        <p className="text-sm text-ink-faint">
          Nothing yet. This is the file exactly as it came in, and saving now would convert it and
          change nothing else.
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {edits.map((edit, index) => (
            // The index is the identity here. Two identical fades are two
            // separate entries and reordering never happens, so position is
            // what an entry is.
            <li
              key={`${edit.kind}-${index}`}
              className="flex items-baseline gap-3 rounded-md bg-raised/60 px-3 py-2"
            >
              <span className="shrink-0 font-mono text-xs text-ink-faint">{index + 1}</span>
              <span className="text-sm text-ink">{describeEdit(edit)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
