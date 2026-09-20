import { useId, useRef, useState } from 'react';
import type { MidiArtifact, ScoreArtifact, TaskField } from '../../shared/types.ts';
import { TranscriptionScoreDialog } from './TranscriptionScoreDialog.tsx';
import { Button, TextArea } from './ui.tsx';

/** How many lines of a score are worth seeing before it scrolls. */
const ROWS = 8;

/**
 * An ABC score, pasted, loaded from a file, or taken from a take in this
 * project.
 *
 * Four ways in because a score arrives four ways. YuE2 writes one every time it
 * plans a song, and those are already stored, so the commonest case is reusing
 * one this project made: generate a song, then hand its score back with a
 * different style and hear the same tune arranged another way. A transcription
 * is the other way, and the one a cover needs: separate a song, transcribe the
 * vocals stem, and convert the notes to a melody. The file button is for a
 * score written somewhere else, and the box itself is for editing any of them,
 * which is the whole point of handing a plan back.
 *
 * It is one text field underneath all of that. The picker and the file button
 * write into the same box, so what gets sent is always what is on screen.
 */
export function ScoreField({
  field,
  value,
  onChange,
  scores,
  transcriptions,
}: {
  field: TaskField;
  value: string;
  onChange: (value: string) => void;
  /** Scores already in this project, offered in the picker. */
  scores: ScoreArtifact[];
  /** Transcriptions in this project, which convert to a melody on the way in. */
  transcriptions: MidiArtifact[];
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [converting, setConverting] = useState<MidiArtifact | undefined>();
  const pickerId = useId();

  async function load(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      const text = await file.text();
      if (text.trim() === '') {
        setFileError(`${file.name} is empty.`);
        return;
      }
      setFileError(undefined);
      onChange(text);
    } catch {
      setFileError(`Could not read ${file.name}.`);
    }
    // Cleared so choosing the same file twice in a row still fires a change,
    // which it otherwise would not after an edit in the box.
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <div className="flex flex-col gap-2">
      <TextArea
        label={field.label}
        rows={ROWS}
        hint={field.help}
        placeholder={'X:1\nM:4/4  L:1/16  Q:1/4=100\nV: Vocal clef=treble\nK:C'}
        className="font-mono text-xs"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />

      <div className="flex flex-wrap items-center gap-2">
        {scores.length > 0 || transcriptions.length > 0 ? (
          <label className="flex items-center gap-2">
            <span className="sr-only" id={pickerId}>
              Load a score from this project
            </span>
            <select
              aria-labelledby={pickerId}
              // Always empty. It is a way of loading the box, not a record of
              // what is in it: the text can be edited afterwards, and a select
              // still naming the score it came from would be saying something
              // untrue about what is about to be sent.
              value=""
              onChange={(event) => {
                const [kind, id] = event.target.value.split(':');
                if (kind === 'score') {
                  const picked = scores.find((score) => score.id === id);
                  if (picked) {
                    setFileError(undefined);
                    onChange(picked.abc);
                  }
                  return;
                }
                // A transcription is not a score yet. It goes through the
                // dialog, which is where the tempo and key it does not carry
                // get guessed and shown.
                if (kind === 'midi') {
                  const picked = transcriptions.find((entry) => entry.id === id);
                  if (picked) {
                    setFileError(undefined);
                    setConverting(picked);
                  }
                }
              }}
              className="min-h-9 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink transition-colors duration-150 hover:border-line-strong"
            >
              <option value="">Use a score from this project</option>
              {scores.length > 0 ? (
                <optgroup label="Scores">
                  {scores.map((score) => (
                    <option key={score.id} value={`score:${score.id}`}>
                      {score.label}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {transcriptions.length > 0 ? (
                <optgroup label="Transcriptions">
                  {transcriptions.map((entry) => (
                    <option key={entry.id} value={`midi:${entry.id}`}>
                      {entry.label}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>
        ) : null}

        <input
          ref={fileInput}
          type="file"
          accept=".abc,text/vnd.abc,text/plain"
          className="sr-only"
          onChange={(event) => void load(event.target.files?.[0])}
        />
        <Button type="button" onClick={() => fileInput.current?.click()}>
          Load a file
        </Button>

        {value.trim() !== '' ? (
          <Button
            type="button"
            onClick={() => {
              setFileError(undefined);
              onChange('');
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>

      {fileError ? (
        <p role="alert" className="text-sm text-bad">
          {fileError}
        </p>
      ) : null}

      <TranscriptionScoreDialog
        artifact={converting}
        onCancel={() => setConverting(undefined)}
        onConfirm={(abc) => {
          onChange(abc);
          setConverting(undefined);
        }}
      />
    </div>
  );
}
