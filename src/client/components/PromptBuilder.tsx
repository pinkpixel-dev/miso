import { Eraser, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import type { LyricsDraft, StudioState, StudioTask, TaskField } from '../../shared/types.ts';
import { KEYS, VOCAL_MODES, compilePrompt, effectiveVocalMode, wantsLyrics } from '../lib/studio.ts';
import { BuilderCard } from './BuilderCard.tsx';
import { LyricsAssistant } from './LyricsAssistant.tsx';
import { LyricsEditor } from './LyricsEditor.tsx';
import { SavedPrompts } from './SavedPrompts.tsx';
import { Button, Field, IconButton, SegmentedControl, cx } from './ui.tsx';

/**
 * The guided prompt builder.
 *
 * Every descriptor is a box. It used to be rows of genre and mood chips, which
 * looked helpful and quietly decided what kind of music existed: anything not
 * on the list needed a second box underneath to say it in. One box says it all
 * in the same place, and the compiler stopped lowercasing as a result, because
 * there is no longer a title-case button label to undo.
 *
 * Two kinds of control still sit side by side and behave differently. The style
 * boxes and the vocal toggle feed the compiler, which writes the prompt; the
 * tempo, the key, and the lyrics are task parameters and go straight through
 * under their own names. Which is which is decided by the compiler, not by this
 * file, so a parameter arriving in the registry later shows up in the advanced
 * drawer rather than silently going missing.
 *
 * The compiled prompt is shown, not hidden. The first thing anybody wants to
 * know is what was actually sent.
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
  onTitle,
  onEnhance,
  enhanceBusy,
  canEnhance,
}: {
  task: StudioTask;
  builder: StudioState;
  onBuilder: (next: StudioState) => void;
  values: Record<string, string>;
  onValue: (name: string, value: string) => void;
  /** Used only when the assistant named the song and the title box is empty. */
  onTitle: (title: string) => void;
  onEnhance: () => void;
  enhanceBusy: boolean;
  canEnhance: boolean;
}) {
  const [writing, setWriting] = useState(false);
  const field = (name: string) => task.fields.find((entry) => entry.name === name);

  const prompt = compilePrompt(builder, task.family, task.vocals);
  const lyricsField = field('lyrics');
  const bpmField = field('bpm');
  const keyField = field('keyscale');
  const instrumental = !wantsLyrics(builder, task.vocals);
  const lyrics = lyricsField ? (values[lyricsField.name] ?? '') : '';

  // What the model can do wins over what the toggle says. The control stays on
  // screen and locks rather than disappearing, because a section that vanishes
  // when the model changes moves the rest of the form and answers nobody's
  // question about where the vocals went. See DOCS/MEMORY.md.
  const vocalsLocked = task.vocals !== 'both';
  const vocalMode = effectiveVocalMode(builder, task.vocals);
  const vocalsHint =
    task.vocals === 'never'
      ? `${task.label} does not generate vocals, so every take from it is instrumental.`
      : task.vocals === 'required'
        ? `${task.label} always sings, so it has no instrumental setting.`
        : undefined;

  return (
    <>
      {/*
        Lyrics come first, directly under the song title. Writing the words is
        where a song usually starts, and the style boxes below describe how the
        words should sound.

        One consequence worth knowing. The vocal toggle that greys this card out
        lives in the Style card underneath it, so the control is below the thing
        it disables. The hint inside the editor says why it is off, which is the
        part somebody actually needs when they find it disabled.
      */}
      {lyricsField ? (
        <BuilderCard
          id="lyrics"
          title={lyricsField.label}
          actions={
            <>
              <IconButton
                label="Clear the lyrics"
                icon={Eraser}
                disabled={instrumental || lyrics === ''}
                onClick={() => onValue(lyricsField.name, '')}
              />
              <IconButton
                label="Write lyrics for me"
                icon={Sparkles}
                variant="primary"
                disabled={instrumental}
                onClick={() => setWriting(true)}
              />
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <LyricsEditor
              label={lyricsField.label}
              hint={
                instrumental
                  ? 'Not used while the vocals are set to instrumental. Nothing you have written is lost.'
                  : 'Section tags tell the model where the chorus is.'
              }
              disabled={instrumental}
              value={lyrics}
              onChange={(next) => onValue(lyricsField.name, next)}
            />

            <SavedPrompts
              kind="lyrics"
              body={lyrics}
              disabled={instrumental}
              onLoad={(body) => onValue(lyricsField.name, body)}
            />

            <LyricsAssistant
              open={writing}
              studio={builder}
              hasLyrics={lyrics.trim() !== ''}
              onApply={(draft: LyricsDraft) => {
                onValue(lyricsField.name, draft.lyrics);
                // The title the assistant gave the song is only used when the
                // box is empty. Overwriting a name somebody chose would be the
                // assistant deciding what the song is called.
                if (draft.title !== undefined) onTitle(draft.title);
              }}
              onClose={() => setWriting(false)}
            />
          </div>
        </BuilderCard>
      ) : null}

      <BuilderCard
        id="style"
        title="Style"
        actions={
          <IconButton
            label={enhanceBusy ? 'Asking for a richer prompt' : 'Make the prompt richer'}
            icon={Sparkles}
            variant="primary"
            disabled={!canEnhance || enhanceBusy}
            onClick={onEnhance}
          />
        }
      >
        <div className="flex flex-col gap-5">
          <Field
            label="Style"
            placeholder="synthwave, warm analogue tape, brushed drums"
            hint="The kind of music and how it should sound, in your own words."
            value={builder.style}
            onChange={(event) => onBuilder({ ...builder, style: event.target.value })}
          />

          <Field
            label="Mood"
            placeholder="melancholic, driving"
            value={builder.mood}
            onChange={(event) => onBuilder({ ...builder, mood: event.target.value })}
          />

          <SegmentedControl
            label="Vocals"
            name="vocal-mode"
            options={VOCAL_MODES}
            value={vocalMode}
            disabled={vocalsLocked}
            hint={vocalsHint}
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

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">The prompt this builds</span>
            <p
              aria-live="polite"
              className={cx(
                'rounded-md border border-line bg-canvas px-3.5 py-3 font-mono text-xs leading-relaxed',
                prompt === '' ? 'text-ink-faint' : 'text-ink-muted',
              )}
            >
              {prompt === '' ? 'Describe a style or a mood and the prompt appears here.' : prompt}
            </p>
          </div>
        </div>
      </BuilderCard>

      {bpmField ?? keyField ? (
        <BuilderCard id="more" title="More options" defaultOpen={false}>
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
        </BuilderCard>
      ) : null}
    </>
  );
}
