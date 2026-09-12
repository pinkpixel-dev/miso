import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cx } from '../ui.tsx';

/**
 * One labelled group in the nav rail.
 *
 * This is a separate component from Disclosure because the two want opposite
 * things. Disclosure is an inline "show me more" inside a panel, sized to its
 * own text. A rail section is a full width heading with a persistent label,
 * open by default, and it has to disappear entirely when the rail is collapsed
 * to icons.
 */
export function RailSection({
  title,
  collapsed,
  children,
  defaultOpen = true,
}: {
  title: string;
  /** When the rail is icon width there is no room for a heading or a toggle. */
  collapsed: boolean;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (collapsed) {
    return (
      <div role="group" aria-label={title} className="flex flex-col items-center gap-1">
        {children}
      </div>
    );
  }

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger
        className={cx(
          'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5',
          'text-xs font-medium uppercase tracking-wide text-ink-faint',
          'transition-colors duration-150 hover:bg-raised hover:text-ink-muted',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        )}
      >
        <ChevronDown
          aria-hidden="true"
          className={cx('h-3.5 w-3.5 transition-transform duration-150', open ? '' : '-rotate-90')}
        />
        {title}
      </Collapsible.Trigger>
      <Collapsible.Content className="pt-1">
        <div className="flex flex-col gap-0.5">{children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
