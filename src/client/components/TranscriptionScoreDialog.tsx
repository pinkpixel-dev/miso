import { useEffect, useId, useMemo, useState } from 'react';
import type { MidiArtifact } from '../../shared/types.ts';
import { inferOptions, keyNames, notesToAbc } from '../lib/notesToAbc.ts';
import { FormDialog } from './Dialog.tsx';
import { Field } from './ui.tsx';

/** The meters worth offering. Anything else can be edited in the score itself. */
const METERS = [
  { label: '4/4', beatsPerBar: 4, beatUnit: 4 },
  { label: '3/4', beatsPerBar: 3, beatUnit: 4 },
  { label: '2/4', beatsPerBar: 2, beatUnit: 4 },
  { label: '6/8', beatsPerBar: 6, beatUnit: 8 },
];

/**
 * Turning a transcription into a score, with the guesses on screen.
 *
 * A transcription is pitches and times in seconds. A score needs a tempo, a
 * meter and a key, and MuScriptor supplies none of them, so Miso works two out
 * and assumes the third. This is where that happens in the open.
 *
 * Showing the guess is the whole point. A tempo read at half speed still writes
 * a correct sequence of pitches, so a cover built on it sounds like the right
 * tune played wrong, which is a much harder thing to diagnose after the fact
 * than a number that was visibly 60 when it should have been 120. The score
 * redraws as the numbers change, so the check costs a glance.
 */
export function TranscriptionScoreDialog({
  artifact,
  onConfirm,
  onCancel,
}: {
  /** The transcription being converted, or undefined when the dialog is shut. */
  artifact: MidiArtifact | undefined;
  onConfirm: (abc: string) => void;
  onCancel: () => void;
}) {
  const [tempo, setTempo] = useState(120);
  const [meter, setMeter] = useState(METERS[0]!.label);
  const [key, setKey] = useState('C');
  const meterId = useId();
  const keyId = useId();
  const previewId = useId();

  /*
    Re-guessed whenever a different transcription is opened, and not on every
    render. Keying on the id rather than the object matters because the notes
    arrive in a fresh array each time the list is refetched, which would
    otherwise throw away an edit while somebody was still looking at it.
  */
  useEffect(() => {
    if (artifact === undefined) return;
    const guess = inferOptions(artifact.notes);
    setTempo(guess.tempo);
    setKey(guess.key);
    setMeter(METERS[0]!.label);
  }, [artifact?.id]);

  const chosen = METERS.find((entry) => entry.label === meter) ?? METERS[0]!;

  const abc = useMemo(() => {
    if (artifact === undefined) return '';
    return notesToAbc(artifact.notes, {
      tempo,
      beatsPerBar: chosen.beatsPerBar,
      beatUnit: chosen.beatUnit,
      key,
    });
  }, [artifact, tempo, chosen.beatsPerBar, chosen.beatUnit, key]);

  return (
    <FormDialog
      open={artifact !== undefined}
      wide
      title="Use a transcription as a score"
      description={
        artifact === undefined
          ? undefined
          : `${artifact.label}, ${artifact.noteCount} notes. The tempo and key are worked out from the notes, so check them against the song before you use this.`
      }
      confirmLabel="Use this score"
      confirmDisabled={abc.trim() === ''}
      onConfirm={() => onConfirm(abc)}
      onCancel={onCancel}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Tempo"
          type="number"
          inputMode="numeric"
          min={20}
          max={300}
          step={1}
          hint="Quarter notes per minute."
          value={String(tempo)}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next) && next > 0) setTempo(next);
          }}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor={meterId} className="text-sm font-medium text-ink">
            Meter
          </label>
          <select
            id={meterId}
            value={meter}
            onChange={(event) => setMeter(event.target.value)}
            className="min-h-9 w-full rounded-md border border-line bg-canvas px-2.5 py-1.5 text-sm text-ink transition-colors duration-150 hover:border-line-strong"
          >
            {METERS.map((entry) => (
              <option key={entry.label} value={entry.label}>
                {entry.label}
              </option>
            ))}
          </select>
          <p className="text-sm text-ink-faint">Assumed, not worked out.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={keyId} className="text-sm font-medium text-ink">
            Key
          </label>
          <select
            id={keyId}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            className="min-h-9 w-full rounded-md border border-line bg-canvas px-2.5 py-1.5 text-sm text-ink transition-colors duration-150 hover:border-line-strong"
          >
            {keyNames().map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <p className="text-sm text-ink-faint">Changes the spelling, not the pitches.</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={previewId} className="text-sm font-medium text-ink">
          Score
        </span>
        <pre
          aria-labelledby={previewId}
          tabIndex={0}
          className="max-h-56 overflow-auto rounded-md border border-line bg-canvas px-3 py-2 font-mono text-xs leading-relaxed text-ink"
        >
          {abc}
        </pre>
        <p className="text-sm text-ink-faint">
          One voice, no chords, which is what a cover wants. You can edit it in the score box
          afterwards.
        </p>
      </div>
    </FormDialog>
  );
}
