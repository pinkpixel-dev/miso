import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { LucideIcon } from 'lucide-react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  TextareaHTMLAttributes,
} from 'react';

/**
 * The handful of primitives Miso needs so far.
 *
 * These are hand written rather than pulled from shadcn/ui. Phase 2 added the
 * dialog and the disclosure the same way shadcn does, by keeping the component
 * source here on top of the Radix primitives, because the shadcn CLI wants the
 * path aliases phase 1 removed. See Dialog.tsx and Disclosure.tsx.
 *
 * Every interactive element here has default, hover, focus-visible, active, and
 * disabled states. That is not polish, it is the baseline.
 */

export function cx(...parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * A label that appears on hover and on keyboard focus.
 *
 * Radix is used rather than the native title attribute because title only
 * appears for a mouse, waits about a second, and cannot be styled. The studio
 * layout leans on icon-only controls, so the label has to reach a keyboard too.
 * This is never the only accessible name: the button underneath still carries
 * one, and this repeats it visibly.
 */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          sideOffset={6}
          className="z-50 rounded-md border border-line bg-raised px-2.5 py-1.5 text-xs text-ink shadow-lg"
        >
          {label}
          <RadixTooltip.Arrow className="fill-line" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  /** Both the accessible name and the tooltip text. Never optional. */
  label: string;
  icon: LucideIcon;
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Larger hit area for the dock transport, which is the one people aim at. */
  size?: 'md' | 'lg';
};

/**
 * An icon with a name attached.
 *
 * The label is a required prop rather than an optional one because an icon
 * button without an accessible name is invisible to a screen reader, and this
 * layout has a lot of them. Making it required means that cannot be forgotten.
 */
export function IconButton({
  label,
  icon: Icon,
  variant = 'ghost',
  size = 'md',
  className,
  ...rest
}: IconButtonProps) {
  const variants = {
    primary: 'bg-accent text-accent-ink hover:bg-accent/90 active:bg-accent/80',
    secondary:
      'bg-raised text-ink border border-line hover:border-line-strong hover:bg-raised/70 active:bg-raised',
    ghost: 'text-ink-muted hover:bg-raised hover:text-ink active:bg-raised/70',
  } as const;

  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        className={cx(
          'inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-150',
          'disabled:cursor-not-allowed disabled:opacity-45',
          size === 'lg' ? 'h-11 w-11' : 'h-9 w-9',
          variants[variant],
          className,
        )}
        {...rest}
      >
        <Icon aria-hidden="true" className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} />
      </button>
    </Tooltip>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  busy?: boolean;
};

export function Button({ variant = 'secondary', busy, className, children, ...rest }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-3.5 py-2 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45';

  const variants = {
    primary: 'bg-accent text-accent-ink hover:bg-accent/90 active:bg-accent/80',
    secondary:
      'bg-raised text-ink border border-line hover:border-line-strong hover:bg-raised/70 active:bg-raised',
    ghost: 'text-ink-muted hover:bg-raised hover:text-ink active:bg-raised/70',
  } as const;

  return (
    <button
      className={cx(base, variants[variant], className)}
      disabled={busy || rest.disabled}
      aria-busy={busy || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string;
};

export function Field({ label, hint, error, id, className, ...rest }: FieldProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={cx(
          'w-full rounded-md border bg-canvas px-3 py-2 text-sm text-ink transition-colors duration-150',
          'placeholder:text-ink-faint hover:border-line-strong',
          error ? 'border-bad' : 'border-line',
          'disabled:cursor-not-allowed disabled:opacity-45',
          className,
        )}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  /** React 19 passes this through as an ordinary prop. The lyrics editor needs
   * it to put the caret after a section tag it just inserted. */
  ref?: Ref<HTMLTextAreaElement>;
};

/** Field's longer sibling, for a prompt or a verse. Same states, same markup rules. */
export function TextArea({ label, hint, error, id, className, ...rest }: TextAreaProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        id={inputId}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={cx(
          'w-full rounded-md border bg-canvas px-3 py-2 text-sm leading-relaxed text-ink transition-colors duration-150',
          'placeholder:text-ink-faint hover:border-line-strong',
          error ? 'border-bad' : 'border-line',
          'disabled:cursor-not-allowed disabled:opacity-45',
          className,
        )}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A titled container.
 *
 * The header and body metrics are deliberately the same as BuilderCard's. The
 * two used to run on different padding and rounding scales, which put the queue
 * and the prompt cards on screen together looking like parts of two different
 * applications.
 */
export function Panel({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  /** Controls for the panel itself, sitting in its header rather than its body. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="flex items-center gap-2 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium text-ink">{title}</h2>
          {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </header>
      <div className="border-t border-line px-4 py-4">{children}</div>
    </section>
  );
}

/** A short label with a status colour. Never colour alone: the text carries the meaning. */
export function Pill({ tone, children }: { tone: 'good' | 'bad' | 'warn' | 'neutral'; children: ReactNode }) {
  const tones = {
    good: 'border-good/40 text-good',
    bad: 'border-bad/40 text-bad',
    warn: 'border-warn/40 text-warn',
    neutral: 'border-line text-ink-muted',
  } as const;

  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-xs',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * One choice out of a few, laid out as a row.
 *
 * These are real radio inputs with the box hidden, which is what makes the
 * arrow keys move between them and the group announce itself as a group. A row
 * of buttons pretending to be radios would need all of that written by hand and
 * would get some of it wrong.
 */
export function SegmentedControl<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
  hint,
  size = 'md',
  labelHidden = false,
}: {
  label: string;
  name: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  hint?: string;
  /**
   * Small is the toolbar version: one pill holding both halves, sized to sit in
   * a row of controls rather than in the flow of a form.
   */
  size?: 'md' | 'sm';
  /** Keeps the accessible name and drops the visible one, for a toolbar. */
  labelHidden?: boolean;
}) {
  const small = size === 'sm';

  return (
    <fieldset className="flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend
        className={cx('p-0 text-sm font-medium text-ink', labelHidden ? 'sr-only' : 'mb-2')}
      >
        {label}
      </legend>
      <div
        className={cx(
          'flex flex-wrap',
          small ? 'gap-0.5 rounded-md border border-line bg-surface p-1' : 'gap-2',
        )}
      >
        {options.map((option) => {
          const on = option.value === value;
          return (
            <label
              key={option.value}
              className={cx(
                'inline-flex cursor-pointer items-center justify-center rounded-md border transition-colors duration-150',
                'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                small ? 'min-h-8 px-3 text-xs' : 'min-h-11 px-4 text-sm',
                on
                  ? 'border-accent bg-accent text-accent-ink'
                  : small
                    ? 'border-transparent text-ink-muted hover:text-ink active:bg-raised'
                    : 'border-line bg-raised text-ink-muted hover:border-line-strong hover:text-ink active:bg-raised/70',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={on}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      {hint ? <p className="text-sm text-ink-faint">{hint}</p> : null}
    </fieldset>
  );
}

export function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-line bg-canvas px-3.5 py-3 font-mono text-xs leading-relaxed text-ink-muted">
      <code>{children}</code>
    </pre>
  );
}
