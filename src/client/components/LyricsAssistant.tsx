import { useState } from 'react';
import type { LyricsDraft, StudioState } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { FormDialog } from './Dialog.tsx';
import { TextArea } from './ui.tsx';

/**
 * Write lyrics from a description of the song.
 *
 * Two steps on purpose. The first asks what the song is about, the second shows
 * what came back and asks whether to use it. Nothing reaches the editor until
 * the second step is confirmed, because lyrics are typed by hand and replacing
 * them without asking is the one mistake this dialog exists to prevent.
 *
 * When the editor already has words in it, the confirm button says so.
 */
export function LyricsAssistant({
  open,
  studio,
  hasLyrics,
  onApply,
  onClose,
}: {
  open: boolean;
  studio?: StudioState;
  /** Whether the editor has something in it that applying would replace. */
  hasLyrics: boolean;
  onApply: (draft: LyricsDraft) => void;
  onClose: () => void;
}) {
  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState<LyricsDraft | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const close = () => {
    setDraft(undefined);
    setError(undefined);
    setBusy(false);
    onClose();
  };

  const write = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setDraft(await api.writeLyrics({ description: description.trim(), studio }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (draft) {
    return (
      <FormDialog
        open={open}
        wide
        title={draft.title ? `“${draft.title}”` : 'The lyrics that came back'}
        description={
          hasLyrics
            ? 'Using these replaces what is in the lyrics editor.'
            : 'Edit them here or after they land in the editor.'
        }
        confirmLabel={hasLyrics ? 'Replace the lyrics' : 'Use these lyrics'}
        confirmDisabled={draft.lyrics.trim() === ''}
        onConfirm={() => {
          onApply(draft);
          close();
        }}
        onCancel={close}
      >
        <TextArea
          label="Lyrics"
          rows={16}
          className="font-mono"
          value={draft.lyrics}
          onChange={(event) => setDraft({ ...draft, lyrics: event.target.value })}
        />
        <button
          type="button"
          onClick={() => void write()}
          disabled={busy}
          className="self-start rounded-md px-2 py-1.5 text-sm text-ink-muted underline underline-offset-4 hover:text-ink disabled:opacity-45"
        >
          {busy ? 'Writing another set' : 'Try again for a different set'}
        </button>
        {error ? (
          <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink">
            {error}
          </p>
        ) : null}
      </FormDialog>
    );
  }

  return (
    <FormDialog
      open={open}
      title="Write lyrics"
      description="Say what the song is about. The style and mood from the builder are sent with it."
      confirmLabel={busy ? 'Writing' : 'Write lyrics'}
      confirmDisabled={description.trim() === ''}
      busy={busy}
      onConfirm={() => void write()}
      onCancel={close}
    >
      <TextArea
        label="What is the song about?"
        rows={4}
        placeholder="driving home at 3am after a long shift, tired but not unhappy"
        hint="A sentence is enough. More detail gives you a closer first draft."
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      {error ? (
        <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink">
          {error}
        </p>
      ) : null}
    </FormDialog>
  );
}
