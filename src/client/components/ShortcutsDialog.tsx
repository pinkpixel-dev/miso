import * as RadixDialog from '@radix-ui/react-dialog';
import { SHORTCUTS } from '../lib/shortcuts.ts';
import { Button } from './ui.tsx';

/**
 * The shortcut list, built from the same table the handlers read.
 *
 * Its own dialog rather than `FormDialog`, which always offers a cancel and a
 * confirm. There is nothing to confirm here: the only thing to do with a list
 * is finish reading it.
 *
 * Each row says where the shortcut applies, because two of them do not work
 * everywhere and a list that implied they did would send people pressing F on
 * the wrong screen and concluding the shortcuts are broken.
 */
export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <RadixDialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-line bg-surface p-5 shadow-xl focus:outline-none"
        >
          <RadixDialog.Title className="text-base font-medium text-ink">
            Keyboard shortcuts
          </RadixDialog.Title>
          <RadixDialog.Description className="mt-2 text-sm text-ink-muted">
            Nothing here fires while you are typing, apart from generate, which is meant to.
          </RadixDialog.Description>

          <ul className="mt-4 flex flex-col">
            {SHORTCUTS.map((shortcut) => (
              <li
                key={shortcut.id}
                className="flex items-baseline justify-between gap-4 border-t border-line py-2.5 first:border-t-0"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink">{shortcut.label}</p>
                  <p className="mt-0.5 text-sm text-ink-faint">{shortcut.where}</p>
                </div>
                <kbd className="shrink-0 rounded border border-line bg-raised px-2 py-1 font-mono text-xs text-ink-muted">
                  {shortcut.keys}
                </kbd>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex justify-end">
            <Button variant="primary" onClick={onClose} className="min-h-11">
              Close
            </Button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
