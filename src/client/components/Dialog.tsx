import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { Button, cx } from './ui.tsx';

/**
 * Radix handles the focus trap, escape, and the ARIA wiring for both dialogs
 * here. What is left is the copy and the styling, and the copy is the part that
 * matters: a title says what will happen, not "Are you sure?".
 */

/** A confirmation for something that cannot be undone. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  secondary,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /**
   * A third answer, beside the confirm and the cancel.
   *
   * For a question where declining is not the same as doing nothing. Importing
   * an mp3 is the case it was added for: convert it, import it untouched, or
   * cancel are three different outcomes, and cancel is the only one that leaves
   * nothing behind.
   */
  secondary?: { label: string; onSelect: () => void };
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
            {secondary ? (
              <Button variant="secondary" onClick={secondary.onSelect} disabled={busy}>
                {secondary.label}
              </Button>
            ) : null}
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

/**
 * A dialog that holds a form rather than a yes or no.
 *
 * The lyrics assistant uses it: describe the song, read what came back, then
 * decide. Cancel is always there and always safe, because nothing the assistant
 * writes is applied until somebody says so.
 */
export function FormDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmDisabled = false,
  busy = false,
  wide = false,
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  busy?: boolean;
  /** For the ones that show a lyric sheet, which needs the room. */
  wide?: boolean;
  children: ReactNode;
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
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            wide ? 'w-[min(44rem,calc(100vw-2rem))]' : 'w-[min(32rem,calc(100vw-2rem))]',
            'max-h-[calc(100dvh-2rem)] overflow-y-auto',
            'rounded-lg border border-line bg-surface p-5 shadow-xl',
            'focus:outline-none',
          )}
        >
          <RadixDialog.Title className="text-base font-medium text-ink">{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-2 text-sm text-ink-muted">
              {description}
            </RadixDialog.Description>
          ) : null}

          <div className="mt-4 flex flex-col gap-4">{children}</div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={busy} className="min-h-11">
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={confirmDisabled}
              onClick={onConfirm}
              className="min-h-11"
            >
              {confirmLabel}
            </Button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
