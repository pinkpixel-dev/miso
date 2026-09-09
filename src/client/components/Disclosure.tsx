import * as Collapsible from '@radix-ui/react-collapsible';
import { useState, type ReactNode } from 'react';

/**
 * The expander that holds a family's other precisions.
 *
 * The trigger is a real button with an expanded state, so a screen reader
 * announces it and the keyboard reaches it. The label says how many variants
 * are inside rather than just "More".
 */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-ink-muted transition-colors duration-150 hover:bg-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-raised/70">
        <span aria-hidden="true" className="font-mono text-xs">
          {open ? '−' : '+'}
        </span>
        {summary}
      </Collapsible.Trigger>
      <Collapsible.Content className="pt-3">{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}
