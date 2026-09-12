import { useRef, useState } from 'react';
import { ACCEPTED_FORMATS, MAX_ASSET_BYTES } from '../../shared/limits.ts';
import type { ImportProgress } from '../lib/useProject.ts';

/**
 * Two doors into the same import.
 *
 * Dragging works with a pointer. The whole zone is also a real button wrapping
 * a file input, because dragging cannot be done on a phone and Miso is used on
 * phones heavily. The button is what carries focus and the accessible name, so
 * keyboard and touch reach this the same way a mouse does.
 */
export function ImportDropZone({
  onFile,
  importing,
}: {
  onFile: (file: File) => void;
  importing: ImportProgress | undefined;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const accept = ACCEPTED_FORMATS.map((f) => `.${f}`).join(',');
  const limit = `${Math.round(MAX_ASSET_BYTES / (1024 * 1024))} MB`;
  const formats = ACCEPTED_FORMATS.join(', ');

  function take(file: File | undefined) {
    if (file) onFile(file);
  }

  if (importing) {
    const percent = Math.round(importing.fraction * 100);
    return (
      <div className="rounded-md border border-line bg-surface p-4">
        <p className="text-sm text-ink">
          {importing.stage === 'uploading' ? 'Uploading' : 'Reading the waveform for'}{' '}
          {importing.filename}
        </p>
        <div
          role="progressbar"
          aria-label={`Importing ${importing.filename}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={importing.stage === 'uploading' ? percent : undefined}
          className="mt-2 h-1 w-full overflow-hidden rounded-full bg-raised"
        >
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: importing.stage === 'uploading' ? `${percent}%` : '100%' }}
          />
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          {importing.stage === 'uploading'
            ? `${percent}% sent`
            : 'Uploaded. Working out the waveform, which happens in this browser.'}
        </p>
      </div>
    );
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        take(event.dataTransfer.files[0]);
      }}
      className={[
        'rounded-md border border-dashed p-6 text-center transition-colors',
        over ? 'border-accent bg-raised' : 'border-line-strong bg-surface',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="rounded-sm text-sm text-ink underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Choose an audio file
      </button>
      <p className="mt-2 text-sm text-ink-muted">
        Or drag one here. {formats} up to {limit}.
      </p>

      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          take(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </div>
  );
}
