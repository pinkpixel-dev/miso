import { useRef, useState } from 'react';
import { ACCEPTED_FORMATS } from '../../../shared/limits.ts';
import type { Asset } from '../../../shared/types.ts';
import { Panel } from '../ui.tsx';

/**
 * Choosing what to work on: a file from disk, or a take already in the project.
 *
 * Deliberately not `ImportDropZone`. That one uploads what it is given, which
 * is exactly what this must not do: the point of the workbench is to convert or
 * trim a file before it becomes a take, and a file dropped here may never be
 * saved at all. It is decoded in the browser and goes no further until you
 * choose to save the result.
 *
 * The size limit is not mentioned here for the same reason. Nothing is being
 * uploaded yet, so the limit that matters is the one on what comes out, which
 * the save controls say and keep saying as you edit.
 */
export function SourcePanel({
  assets,
  loading,
  busy,
  onFile,
  onTake,
}: {
  assets: Asset[];
  loading: boolean;
  /** True while something is decoding, so both doors close rather than queue. */
  busy: boolean;
  onFile: (file: File) => void;
  onTake: (asset: Asset) => void;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const accept = ACCEPTED_FORMATS.map((f) => `.${f}`).join(',');
  const formats = ACCEPTED_FORMATS.join(', ');

  function take(file: File | undefined) {
    if (file && !busy) onFile(file);
  }

  return (
    <Panel title="Pick something to work on">
      <div className="flex flex-col gap-5">
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
          {/*
            A real button wrapping a file input, as in the import zone. Dragging
            needs a pointer, and this is what keyboard and touch reach.
          */}
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="rounded-sm text-sm text-ink underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline"
          >
            Choose an audio file
          </button>
          <p className="text-xs text-ink-faint">
            Or drag one here. {formats}. Nothing is uploaded until you save.
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

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-ink">Or a take from this project</h3>

          {loading ? (
            <p className="text-sm text-ink-muted">Loading this project.</p>
          ) : assets.length === 0 ? (
            <p className="text-sm text-ink-muted">
              This project has no takes yet, so a file from disk is the only way in.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onTake(asset)}
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-ink-muted transition-colors duration-150 hover:bg-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <span className="min-w-0 truncate">{asset.label}</span>
                    <span className="shrink-0 text-xs text-ink-faint">
                      {asset.format.toUpperCase()}
                      {asset.sampleRate ? `, ${(asset.sampleRate / 1000).toFixed(1)} kHz` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}
