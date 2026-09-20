import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ACCEPTED_FORMATS, MAX_ASSET_BYTES } from '../../shared/limits.ts';
import { convertToWav } from '../lib/decodeFile.ts';
import type { ImportProgress } from '../lib/useProject.ts';
import { ConfirmDialog } from './Dialog.tsx';

/**
 * Two doors into the same import.
 *
 * Dragging works with a pointer. The whole zone is also a real button wrapping
 * a file input, because dragging cannot be done on a phone and Miso is used on
 * phones heavily. The button is what carries focus and the accessible name, so
 * keyboard and touch reach this the same way a mouse does.
 *
 * A file that is not already a WAV is asked about before it goes anywhere. The
 * service has no decoder, so an imported mp3 cannot be separated, voice
 * converted or mixed, and the only way anybody finds that out today is from a
 * job that will not start. Asking here is the last moment it is cheap to fix.
 *
 * Importing it untouched stays available, because the original bytes are
 * sometimes the point and Export has always promised to give back exactly what
 * came in.
 */
export function ImportDropZone({
  onFile,
  importing,
  workbenchTo,
}: {
  onFile: (file: File) => void;
  importing: ImportProgress | undefined;
  /**
   * Where the workbench is, when this zone is somewhere that can offer it.
   *
   * Importing and converting are the same gesture with different endings, and
   * the difference only matters once: an mp3 imported here stays an mp3, and
   * separation will refuse it. Saying so at the point somebody is about to drop
   * one is the only place the warning is useful.
   */
  workbenchTo?: string;
}) {
  const [over, setOver] = useState(false);
  const [asked, setAsked] = useState<File | undefined>();
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const input = useRef<HTMLInputElement>(null);

  const accept = ACCEPTED_FORMATS.map((f) => `.${f}`).join(',');
  const limit = `${Math.round(MAX_ASSET_BYTES / (1024 * 1024))} MB`;
  const formats = ACCEPTED_FORMATS.join(', ');

  function take(file: File | undefined) {
    if (!file) return;
    setError(undefined);

    // A WAV is already what everything here wants, so it is never asked about.
    if (file.name.toLowerCase().endsWith('.wav')) {
      onFile(file);
      return;
    }

    setAsked(file);
  }

  async function convertAndImport(file: File) {
    setConverting(true);
    try {
      const wav = await convertToWav(file);
      setAsked(undefined);
      onFile(wav);
    } catch (cause) {
      setAsked(undefined);
      setError(
        `${file.name} could not be converted: ${cause instanceof Error ? cause.message : String(cause)}. Importing it as it is will still work.`,
      );
    } finally {
      setConverting(false);
    }
  }

  if (converting) {
    return (
      <div className="rounded-md border border-line bg-surface p-4">
        <p className="text-sm text-ink" role="status">
          Converting {asked?.name} to WAV. This happens in this browser.
        </p>
        <div
          role="progressbar"
          aria-label="Converting"
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-2 h-1 w-full overflow-hidden rounded-full bg-raised"
        >
          <div className="h-full w-full bg-accent" />
        </div>
      </div>
    );
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

  const extension = asked?.name.split('.').pop()?.toUpperCase() ?? 'This file';

  return (
    <>
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
        'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-dashed px-3 py-2.5 transition-colors',
        over ? 'border-accent bg-raised' : 'border-line-strong bg-surface/60',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="rounded-sm text-sm text-ink underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Choose an audio file
      </button>
      <p className="text-xs text-ink-faint">
        Or drag one here. {formats} up to {limit}.
      </p>

      {workbenchTo === undefined ? null : (
        <Link
          to={workbenchTo}
          className="rounded-sm text-xs text-ink-muted underline underline-offset-4 transition-colors duration-150 hover:text-ink hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Convert or trim it first
        </Link>
      )}

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

      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink"
        >
          {error}
        </p>
      ) : null}

      {/*
        Three outcomes, not two. Converting and importing untouched are both
        real answers, and cancelling is the only one that leaves nothing behind.
      */}
      <ConfirmDialog
        open={asked !== undefined}
        title={`Convert this ${extension} to WAV?`}
        confirmLabel="Convert to WAV"
        secondary={{
          label: 'Import as it is',
          onSelect: () => {
            const file = asked;
            setAsked(undefined);
            if (file) onFile(file);
          },
        }}
        onConfirm={() => {
          if (asked) void convertAndImport(asked);
        }}
        onCancel={() => setAsked(undefined)}
        body={
          <div className="flex flex-col gap-2">
            <p>
              Miso reads WAV on its own. Everything that works on a whole song, splitting into
              stems, converting a voice, and mixing stems back together, needs one.
            </p>
            <p>
              Converting now keeps the audio exactly as it is and only changes the container, so
              the file gets larger and does not sound different. An {extension} is already lossy
              and this does not undo that.
            </p>
            <p className="text-ink-faint">
              Importing it as it is works too. It will play and export normally, and you can
              convert it later in Audio tools.
            </p>
          </div>
        }
      />
    </>
  );
}
