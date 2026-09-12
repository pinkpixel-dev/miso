import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
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

export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="border-b border-line px-5 py-4">
        <h2 className="text-base text-ink">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </header>
      <div className="px-5 py-5">{children}</div>
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

export function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-line bg-canvas px-3.5 py-3 font-mono text-xs leading-relaxed text-ink-muted">
      <code>{children}</code>
    </pre>
  );
}
