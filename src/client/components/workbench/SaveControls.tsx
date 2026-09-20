import { formatMegabytes } from '../../lib/saveAudio.ts';
import { OUTPUT_RATES, type OutputRate, type WorkbenchState } from '../../lib/useWorkbench.ts';
import { formatSeconds } from '../../lib/region.ts';
import { Button, SegmentedControl } from '../ui.tsx';

/**
 * The output rate, and the button that writes the take.
 *
 * The rate is a property of the file being written rather than an edit, which
 * is why it sits down here with Save rather than up with trim and fade. It is
 * also the one control on this page that needs explaining, so each choice says
 * what it is for rather than only what it is.
 */

function stageLabel(stage: 'encoding' | 'uploading' | 'saving-waveform'): string {
  if (stage === 'encoding') return 'Encoding';
  if (stage === 'uploading') return 'Uploading';
  return 'Saving the waveform';
}

export function SaveControls({
  workbench,
  suffix,
  label,
}: {
  workbench: WorkbenchState;
  /** What the saved file gets called, after the source name. */
  suffix: string;
  /** What the button says, since this panel is used for more than converting. */
  label: string;
}) {
  const { outputRate, setOutputRate, outputBytes, overLimit, saving, renderedDuration } = workbench;

  const purpose = OUTPUT_RATES.find((entry) => entry.rate === outputRate)?.purpose;
  const empty = renderedDuration <= 0;

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        label="Sample rate to save at"
        name="workbench-rate"
        hint={purpose}
        options={OUTPUT_RATES.map((entry) => ({
          value: String(entry.rate),
          label: entry.label,
        }))}
        value={String(outputRate)}
        onChange={(value) => setOutputRate(Number(value) as OutputRate)}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
        <Button
          variant="primary"
          busy={saving !== undefined}
          disabled={overLimit || empty || saving !== undefined}
          onClick={() => void workbench.save(suffix)}
          className="min-h-11"
        >
          {label}
        </Button>

        <p className="text-sm text-ink-muted">
          {empty ? (
            'Nothing to save. The edits left no audio.'
          ) : (
            <>
              {formatSeconds(renderedDuration)} of 16-bit WAV, about{' '}
              <span className="text-ink">{formatMegabytes(outputBytes)}</span>
            </>
          )}
        </p>
      </div>

      {saving ? (
        <div>
          <div
            role="progressbar"
            aria-label="Saving"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={saving.stage === 'uploading' ? Math.round(saving.fraction * 100) : undefined}
            className="h-1 w-full overflow-hidden rounded-full bg-raised"
          >
            <div
              className="h-full bg-accent transition-[width] duration-300"
              style={{
                width: saving.stage === 'uploading' ? `${Math.round(saving.fraction * 100)}%` : '100%',
              }}
            />
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            {stageLabel(saving.stage)}
            {saving.stage === 'uploading' ? `, ${Math.round(saving.fraction * 100)}% sent` : ''}
          </p>
        </div>
      ) : null}

      {overLimit ? (
        <p
          role="alert"
          className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink"
        >
          That would be {formatMegabytes(outputBytes)}, which is over the import limit. Trim it
          shorter, or save it at 44.1 kHz instead.
        </p>
      ) : null}
    </div>
  );
}
