import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { Button, cx } from './ui.tsx';

/**
 * A confirmation dialog for the things that cannot be undone, which right now
 * means deleting a package worth several gigabytes.
 *
 * Radix handles the focus trap, escape, and the ARIA wiring. What is left here
 * is the copy and the styling, and the copy is the part that matters: the title
 * says what will happen, not "Are you sure?".
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <RadixDialog.Content
          className={cx(
            'fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2',
            'rounded-lg border border-line bg-surface p-5 shadow-xl',
            'focus:outline-none',
          )}
        >
          <RadixDialog.Title className="text-base font-medium text-ink">{title}</RadixDialog.Title>
          <RadixDialog.Description asChild>
            <div className="mt-2 text-sm text-ink-muted">{body}</div>
          </RadixDialog.Description>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy}
              onClick={onConfirm}
              className={
                destructive
                  ? 'bg-bad text-canvas hover:bg-bad/90 active:bg-bad/80'
                  : undefined
              }
            >
              {confirmLabel}
            </Button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
