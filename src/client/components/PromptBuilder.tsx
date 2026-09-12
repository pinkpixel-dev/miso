import { useRef, useState } from 'react';
import type { StudioState, StudioTask, TaskField } from '../../shared/types.ts';
import { GENRES, KEYS, MOODS, VOCAL_MODES, compilePrompt, wantsLyrics } from '../lib/studio.ts';
import { LyricsEditor } from './LyricsEditor.tsx';
import { Button, ChipGroup, Field, SegmentedControl, cx } from './ui.tsx';

/**
 * The guided prompt builder.
 *
 * Two kinds of control sit side by side here and they behave differently. The
 * chips and the vocal toggle feed the compiler, which writes the prompt; the
 * tempo, the key, and the lyrics are task parameters and go straight through
 * under their own names. Which is which is decided by the compiler, not by this
 * file, so a parameter arriving in the registry later shows up in the advanced
 * drawer rather than silently going missing.
 *
 * The compiled prompt is shown, not hidden. A builder that generated a sentence
 * nobody could read would be a black box with chips on it, and the first thing
 * anyone wants to know is what was actually sent.
 */

/** Two seconds without a tap ends the measurement and starts a new one. */
const TAP_RESET_MS = 2_000;
const TAPS_KEPT = 8;

function TempoControl({
  field,
  value,
  onChange,
}: {
  field: TaskField;
  value: string;
  onChange: (value: string) => void;
}) {
  const taps = useRef<number[]>([]);
  const [tapped, setTapped] = useState<number | undefined>();

  const min = field.min ?? 40;
  const max = field.max ?? 220;
  const current = Number(value);
  const slider = Number.isFinite(current) && value !== '' ? current : Math.round((min + max) / 2);

  const tap = () => {
    const now = performance.now();
    const last = taps.current[taps.current.length - 1];
    if (last === undefined || now - last > TAP_RESET_MS) taps.current = [];
    taps.current = [...taps.current, now].slice(-TAPS_KEPT);

    // Two taps make one interval, which is the fewest that means anything.
    if (taps.current.length < 2) {
      setTapped(undefined);
      return;
    }

    const first = taps.current[0] ?? now;
    const spread = now - first;
    const bpm = Math.round((60_000 * (taps.current.length - 1)) / spread);
    const clamped = Math.min(max, Math.max(min, bpm));

    setTapped(taps.current.length);
    onChange(String(clamped));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-28 flex-1">
          <Field
            label={field.label}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={field.step}
            placeholder="Auto"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
        <Button type="button" onClick={tap} className="min-h-11">
          Tap tempo
        </Button>
        {value === '' ? null : (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => {
              taps.current = [];
              setTapped(undefined);
              onChange('');
            }}
          >
            Clear
          </Button>
        )}
      </div>

      <input
        type="range"
        aria-label={`${field.label} slider`}
        min={min}
        max={max}
        step={field.step ?? 1}
        value={slider}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full cursor-pointer accent-accent"
      />

      <p className="text-sm text-ink-faint">
        {tapped !== undefined && tapped >= 2
          ? `Measured from ${tapped} taps. Keep tapping to settle it.`
          : value === ''
            ? 'Leave this empty and the model picks a tempo to suit the prompt.'
            : `${value} beats per minute. Tap the button in time to measure one instead.`}
      </p>
    </div>
  );
}

function KeyControl({
  field,
  value,
  onChange,
}: {
  field: TaskField;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{field.label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink transition-colors duration-150 hover:border-line-strong"
      >
        <option value="">Auto, let the model choose</option>
        {KEYS.map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
      </select>
      {field.help ? <span className="text-sm text-ink-faint">{field.help}</span> : null}
    </label>
  );
}

export function PromptBuilder({
  task,
  builder,
  onBuilder,
  values,
  onValue,
}: {
  task: StudioTask;
  builder: StudioState;
  onBuilder: (next: StudioState) => void;
  values: Record<string, string>;
  onValue: (name: string, value: string) => void;
}) {
  const field = (name: string) => task.fields.find((entry) => entry.name === name);

  const toggle = (key: 'genre' | 'mood', option: string) => {
    const current = builder[key];
    onBuilder({
      ...builder,
      [key]: current.includes(option)
        ? current.filter((entry) => entry !== option)
        : [...current, option],
    });
  };

  const prompt = compilePrompt(builder);
  const lyricsField = field('lyrics');
  const bpmField = field('bpm');
  const keyField = field('keyscale');
  const instrumental = !wantsLyrics(builder);

  return (
    <div className="flex flex-col gap-6">
      <ChipGroup
        label="Style"
        options={GENRES}
        selected={builder.genre}
        onToggle={(option) => toggle('genre', option)}
      />

      <Field
        label="Anything else about the style"
        placeholder="warm analogue tape, brushed drums"
        hint="Typed exactly as you write it, added to the prompt after the chips."
        value={builder.customStyle}
        onChange={(event) => onBuilder({ ...builder, customStyle: event.target.value })}
      />

      <ChipGroup
        label="Mood"
        options={MOODS}
        selected={builder.mood}
        onToggle={(option) => toggle('mood', option)}
      />

      <SegmentedControl
        label="Vocals"
        name="vocal-mode"
        options={VOCAL_MODES}
        value={builder.vocalMode}
        onChange={(value) => onBuilder({ ...builder, vocalMode: value })}
      />

      {instrumental ? null : (
        <Field
          label="Voice"
          placeholder="raspy, airy, soulful"
          hint="Words for the singer rather than the song."
          value={builder.vocalStyle}
          onChange={(event) => onBuilder({ ...builder, vocalStyle: event.target.value })}
        />
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {bpmField ? (
          <TempoControl
            field={bpmField}
            value={values[bpmField.name] ?? ''}
            onChange={(next) => onValue(bpmField.name, next)}
          />
        ) : null}
        {keyField ? (
          <KeyControl
            field={keyField}
            value={values[keyField.name] ?? ''}
            onChange={(next) => onValue(keyField.name, next)}
          />
        ) : null}
      </div>

      {lyricsField ? (
        <LyricsEditor
          label={lyricsField.label}
          hint={
            instrumental
              ? 'Not used while the vocals are set to instrumental. Nothing you have written is lost.'
              : 'Section tags tell the model where the chorus is.'
          }
          disabled={instrumental}
          value={values[lyricsField.name] ?? ''}
          onChange={(next) => onValue(lyricsField.name, next)}
        />
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">The prompt this builds</span>
        <p
          aria-live="polite"
          className={cx(
            'rounded-md border border-line bg-canvas px-3.5 py-3 font-mono text-xs leading-relaxed',
            prompt === '' ? 'text-ink-faint' : 'text-ink-muted',
          )}
        >
          {prompt === '' ? 'Pick a style or a mood and the prompt appears here.' : prompt}
        </p>
      </div>
    </div>
  );
}
