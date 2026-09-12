import { useState } from 'react';
import type { PromptSuggestion } from '../../shared/types.ts';
import { FormDialog } from './Dialog.tsx';
import { TextArea } from './ui.tsx';

/**
 * A richer prompt, shown beside the one it came from.
 *
 * It is a suggestion the whole way through. Both prompts are on screen, the
 * suggestion is editable before it is taken, and refusing it leaves the form
 * exactly as it was. Asking twice on the same form gives two different answers,
 * which is the cheapest second take on an idea there is, so trying again is a
 * button rather than a reopen.
 */
export function PromptSuggestionDialog({
  open,
  suggestion,
  busy,
  error,
  onRetry,
  onAccept,
  onClose,
}: {
  open: boolean;
  suggestion: PromptSuggestion | undefined;
  busy: boolean;
  error?: string;
  onRetry: () => void;
  onAccept: (prompt: string) => void;
  onClose: () => void;
}) {
  const [edited, setEdited] = useState<string | undefined>();
  const text = edited ?? suggestion?.suggestion ?? '';

  const close = () => {
    setEdited(undefined);
    onClose();
  };

  return (
    <FormDialog
      open={open}
      wide
      title="A richer prompt"
      description="Nothing changes until you take it. Your own prompt is kept either way, and the take records both."
      confirmLabel="Use this prompt"
      confirmDisabled={text.trim() === '' || busy}
      onConfirm={() => {
        onAccept(text.trim());
        close();
      }}
      onCancel={close}
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">What you wrote</span>
        <p className="rounded-md border border-line bg-canvas px-3.5 py-3 font-mono text-xs leading-relaxed text-ink-faint">
          {suggestion?.original ?? ''}
        </p>
      </div>

      <TextArea
        label="What came back"
        rows={6}
        className="font-mono"
        hint="Edit it here if it went too far in one direction."
        value={text}
        onChange={(event) => setEdited(event.target.value)}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setEdited(undefined);
          onRetry();
        }}
        className="self-start rounded-md px-2 py-1.5 text-sm text-ink-muted underline underline-offset-4 hover:text-ink disabled:opacity-45"
      >
        {busy ? 'Asking again' : 'Ask again for a different take'}
      </button>

      {error ? (
        <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink">
          {error}
        </p>
      ) : null}
    </FormDialog>
  );
}
