import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cx } from './ui.tsx';

/**
 * One section of the create column, with its actions in its own header.
 *
 * The header is where the buttons went. A button sitting in the flow of a form
 * reads as a step you are meant to take; the same button in a section header
 * reads as something you can do to that section, which is what these are. It
 * also keeps the form itself down to boxes, which is the point of the redesign.
 *
 * Open state is remembered per card. Somebody who never writes lyrics should
 * not have to close that card every session.
 */

const KEY_PREFIX = 'miso.card.';

function readOpen(id: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(`${KEY_PREFIX}${id}`);
    return stored === null ? fallback : stored === '1';
  } catch {
    // Private windows and blocked site data both throw. A card that forgets is
    // fine; a card that crashes the form is not.
    return fallback;
  }
}

export function BuilderCard({
  id,
  title,
  actions,
  children,
  defaultOpen = true,
}: {
  /** Stable key for remembering whether this card is open. */
  id: string;
  title: string;
  /** Icon buttons for this section. Outside the trigger, so they do not toggle it. */
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen));

  function change(next: boolean) {
    setOpen(next);
    try {
      localStorage.setItem(`${KEY_PREFIX}${id}`, next ? '1' : '0');
    } catch {
      // Not remembering is not worth failing over.
    }
  }

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={change}
      className="rounded-lg border border-line bg-surface"
    >
      <div className="flex items-center gap-2 px-4 py-2.5">
        <Collapsible.Trigger
          className={cx(
            'flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left',
            'transition-colors duration-150 hover:text-ink',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          )}
        >
          <ChevronDown
            aria-hidden="true"
            className={cx(
              'h-4 w-4 shrink-0 text-ink-faint transition-transform duration-150',
              open ? '' : '-rotate-90',
            )}
          />
          <span className="truncate text-sm font-medium text-ink">{title}</span>
        </Collapsible.Trigger>

        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>

      <Collapsible.Content>
        <div className="border-t border-line px-4 py-4">{children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
