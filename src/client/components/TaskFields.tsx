import type { MidiArtifact, ScoreArtifact, TaskField } from '../../shared/types.ts';
import { LyricsEditor } from './LyricsEditor.tsx';
import { ScoreField } from './ScoreField.tsx';
import { Field, SegmentedControl, TextArea } from './ui.tsx';

/**
 * One task field, drawn the way its kind asks to be drawn.
 *
 * Shared by the create column and the remix page. Both render whatever fields
 * the service says a task takes, which is the point of the task registry: a new
 * task arrives as data and gets a working form without a new screen. Two copies
 * of these rules would eventually disagree about how a lyrics box looks.
 */
export function PlainField({
  field,
  value,
  onChange,
  placeholder = 'cinematic synth pop with clear vocals',
  scores = [],
  transcriptions = [],
}: {
  field: TaskField;
  value: string;
  onChange: (value: string) => void;
  /** The example shown in an empty text box, which differs by what is being written. */
  placeholder?: string;
  /**
   * Scores already in this project, for a `score` field's picker.
   *
   * Empty everywhere but the create column, which is the only page that offers
   * a task taking one. An empty list is not an error: it draws the box and the
   * file button without the picker, which is what a project that has not
   * planned anything yet should see.
   */
  scores?: ScoreArtifact[];
  /**
   * Transcriptions already in this project, which a `score` field offers as a
   * melody after converting them. Empty everywhere but the create column, the
   * same as `scores`.
   */
  transcriptions?: MidiArtifact[];
}) {
  if (field.kind === 'number') {
    return (
      <Field
        label={field.label}
        type="number"
        inputMode="decimal"
        min={field.min}
        max={field.max}
        step={field.step}
        hint={field.help}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  // A short fixed list, so the options are all on screen rather than behind a
  // menu. Four voices that sound nothing like each other are worth seeing at
  // once, and the segmented control is already a radio group underneath.
  if (field.kind === 'choice' && field.values !== undefined && field.values.length > 0) {
    return (
      <SegmentedControl
        label={field.label}
        name={field.name}
        options={field.values}
        value={value === '' ? (field.values[0]?.value ?? '') : value}
        onChange={onChange}
        hint={field.help}
      />
    );
  }

  if (field.kind === 'score') {
    return (
      <ScoreField
        field={field}
        value={value}
        onChange={onChange}
        scores={scores}
        transcriptions={transcriptions}
      />
    );
  }

  if (field.kind === 'lyrics') {
    return <LyricsEditor label={field.label} hint={field.help} value={value} onChange={onChange} />;
  }

  return (
    <TextArea
      label={field.label}
      rows={3}
      hint={field.help}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
