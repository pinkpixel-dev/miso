import { useState } from 'react';
import { gainToDecibels, peakAfterGain, type Edit, type FadeCurve } from '../../lib/edits.ts';
import { Button, Field, Pill, SegmentedControl } from '../ui.tsx';

/**
 * Fades, gain and normalize: the edits that change level rather than length.
 *
 * Every control here says what it will do before it does it, because level is
 * the one thing on this page you cannot see happening. A trim is obvious on the
 * waveform and a split is obvious in the project. Six decibels is a number, and
 * the only part of it that matters is whether it clips, so the peak it would
 * leave is on screen next to the button that would cause it.
 *
 * Nothing clips here, in the sense that nothing is clamped. `gain` keeps
 * samples past full scale in float so that lowering it again gets the original
 * back. Clamping happens once, in `writeWav`, when the samples become a file.
 * That is exactly why the warning matters: the damage is done at save, not at
 * the moment you press the button, so the warning has to come earlier.
 */

/** A ceiling that leaves a little headroom, which is the ordinary default. */
const DEFAULT_CEILING_DB = -1;

/** Peak as a figure to read, with silence said in words rather than as -Infinity. */
function peakLabel(peak: number): string {
  if (!Number.isFinite(gainToDecibels(peak))) return 'silent';
  return `${gainToDecibels(peak).toFixed(1)} dB`;
}

/** A number typed into a box, or nothing when what is there is not a number. */
function parsed(raw: string): number | undefined {
  const value = Number(raw);
  return raw.trim() !== '' && Number.isFinite(value) ? value : undefined;
}

function FadeRow({
  which,
  duration,
  busy,
  onApply,
}: {
  which: 'in' | 'out';
  duration: number;
  busy: boolean;
  onApply: (edit: Edit) => void;
}) {
  const [seconds, setSeconds] = useState('2');
  const [curve, setCurve] = useState<FadeCurve>('linear');

  const value = parsed(seconds);
  const usable = value !== undefined && value > 0;
  const longerThanTrack = value !== undefined && value > duration;

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <Field
        label={`Fade ${which} over seconds`}
        type="number"
        inputMode="decimal"
        min={0}
        max={duration}
        step={0.1}
        value={seconds}
        onChange={(event) => setSeconds(event.target.value)}
        className="w-32"
      />

      <SegmentedControl
        label={`Fade ${which} shape`}
        name={`fade-${which}-curve`}
        size="sm"
        options={[
          { value: 'linear', label: 'Linear' },
          { value: 'exponential', label: 'Exponential' },
        ]}
        value={curve}
        onChange={(next) => setCurve(next as FadeCurve)}
      />

      <Button
        variant="secondary"
        disabled={busy || !usable}
        className="min-h-11"
        onClick={() =>
          onApply(
            which === 'in'
              ? { kind: 'fadeIn', seconds: value!, curve }
              : { kind: 'fadeOut', seconds: value!, curve },
          )
        }
      >
        Apply fade {which}
      </Button>

      {longerThanTrack ? (
        <p className="text-sm text-ink-muted">
          Longer than the track, so the fade covers all of it.
        </p>
      ) : null}
    </div>
  );
}

export function LevelControls({
  peak,
  duration,
  busy,
  onApply,
}: {
  /** The loudest sample in the rendered audio, before anything new is applied. */
  peak: number;
  duration: number;
  busy: boolean;
  onApply: (edit: Edit) => void;
}) {
  const [decibels, setDecibels] = useState('0');
  const [ceiling, setCeiling] = useState(String(DEFAULT_CEILING_DB));

  const gainValue = parsed(decibels);
  const ceilingValue = parsed(ceiling);

  // What the peak would become, worked out rather than rendered. Gain is one
  // multiplication, so the answer needs no audio.
  const wouldPeak = gainValue === undefined ? peak : peakAfterGain(peak, gainValue);
  const wouldClip = wouldPeak > 1;
  const clipsAlready = peak > 1;

  return (
    <section aria-labelledby="level-heading" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="level-heading" className="text-sm font-medium text-ink">
          Fades and level
        </h3>

        <p className="flex items-center gap-2 text-sm text-ink-muted">
          Peak now <span className="text-ink">{peakLabel(peak)}</span>
          {clipsAlready ? <Pill tone="bad">Over full scale</Pill> : null}
        </p>
      </div>

      {clipsAlready ? (
        <p
          role="alert"
          className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink"
        >
          This is louder than full scale, so saving it now would flatten the loudest moments and
          they would distort. Bring the gain down, or normalize it to a ceiling.
        </p>
      ) : null}

      <FadeRow which="in" duration={duration} busy={busy} onApply={onApply} />
      <FadeRow which="out" duration={duration} busy={busy} onApply={onApply} />

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-line pt-4">
        <Field
          label="Gain in decibels"
          type="number"
          inputMode="decimal"
          step={0.5}
          value={decibels}
          onChange={(event) => setDecibels(event.target.value)}
          className="w-32"
        />

        <Button
          variant="secondary"
          disabled={busy || gainValue === undefined || gainValue === 0}
          className="min-h-11"
          onClick={() => onApply({ kind: 'gain', decibels: gainValue! })}
        >
          Apply gain
        </Button>

        <p className="flex items-center gap-2 text-sm text-ink-muted">
          Peak would be <span className="text-ink">{peakLabel(wouldPeak)}</span>
          {wouldClip ? <Pill tone="bad">Would clip</Pill> : null}
        </p>
      </div>

      {wouldClip && !clipsAlready ? (
        <p
          role="alert"
          className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink"
        >
          That much gain would push the track past full scale, and the loudest moments would
          distort when it is saved. Normalizing instead gets it as loud as it can go without
          that happening.
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-line pt-4">
        <Field
          label="Normalize to a ceiling in decibels"
          hint="Lifts or lowers the whole track so its loudest sample lands here. Zero is full scale."
          type="number"
          inputMode="decimal"
          max={0}
          step={0.5}
          value={ceiling}
          onChange={(event) => setCeiling(event.target.value)}
          className="w-32"
        />

        <Button
          variant="secondary"
          disabled={busy || ceilingValue === undefined}
          className="min-h-11"
          onClick={() => onApply({ kind: 'normalize', ceilingDecibels: ceilingValue! })}
        >
          Normalize
        </Button>
      </div>
    </section>
  );
}
