import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { AssetFormat } from '../../shared/types.ts';
import {
  EXPORT_FORMATS,
  exportAsset,
  needsConversion,
  type ExportFormat,
  type ExportProgress,
} from '../lib/exportAudio.ts';
import { Tooltip, cx } from './ui.tsx';

/**
 * Export, with a choice of format.
 *
 * One component for all three places a file can leave Miso, so a take in the
 * project, a take in the library and a stem all behave the same way and say the
 * same things while they work.
 *
 * Exporting in the stored format is still a plain download and takes no time.
 * The other one has to read the file, decode it and encode it again, which is
 * seconds of work on a long track, so it reports what it is doing. That is also
 * why this is a menu rather than two buttons: the fast path should not look
 * like the slow one.
 */

function stageLabel(progress: ExportProgress): string {
  if (progress.stage === 'reading') return `Reading, ${Math.round(progress.fraction * 100)}%`;
  if (progress.stage === 'decoding') return 'Decoding';
  return `Encoding, ${Math.round(progress.fraction * 100)}%`;
}

export function ExportMenu({
  projectId,
  assetId,
  filename,
  label,
  format,
}: {
  projectId: string;
  assetId: string;
  /** The stored name, where the row carries one. */
  filename?: string;
  /** What this file is called on screen, for the accessible names. */
  label: string;
  /** The format it is stored in, which decides which choice is instant. */
  format: AssetFormat;
}) {
  const [progress, setProgress] = useState<ExportProgress | undefined>();
  const [error, setError] = useState<string | undefined>();

  const busy = progress !== undefined;

  async function run(want: ExportFormat) {
    setError(undefined);
    if (!needsConversion(format, want)) {
      // Nothing to do but hand over the bytes, so no progress and no waiting.
      await exportAsset({ projectId, assetId, filename, label, storedFormat: format, want });
      return;
    }

    setProgress({ stage: 'reading', fraction: 0 });
    try {
      await exportAsset({
        projectId,
        assetId,
        filename,
        label,
        storedFormat: format,
        want,
        onProgress: setProgress,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setProgress(undefined);
    }
  }

  return (
    <>
      <DropdownMenu.Root>
        <Tooltip label={busy ? `Exporting ${label}` : `Export ${label}`}>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              disabled={busy}
              aria-label={`Export ${label}`}
              className={cx(
                'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                'text-ink-muted transition-colors duration-150 hover:bg-raised hover:text-ink',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                'data-[state=open]:bg-raised data-[state=open]:text-ink',
                'disabled:cursor-not-allowed disabled:hover:bg-transparent',
              )}
            >
              {busy ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Download aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          </DropdownMenu.Trigger>
        </Tooltip>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-48 rounded-md border border-line bg-surface p-1 shadow-xl"
          >
            {EXPORT_FORMATS.map((want) => (
              <DropdownMenu.Item
                key={want}
                onSelect={() => void run(want)}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-sm text-ink-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-ink"
              >
                <span>Export as {want.toUpperCase()}</span>
                {/*
                  Says which one is free, so the slow choice is a choice rather
                  than a surprise. MP3 is lossy and it is worth saying once,
                  where somebody is about to pick it.
                */}
                <span className="text-xs text-ink-faint">
                  {needsConversion(format, want) ? (want === 'mp3' ? 'lossy' : 'converts') : 'as is'}
                </span>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/*
        Progress and failure both announced rather than only drawn, because the
        trigger is an icon and a spinner says nothing on its own.
      */}
      <span aria-live="polite" className="sr-only">
        {progress ? `Exporting ${label}. ${stageLabel(progress)}.` : ''}
        {error ? `Exporting ${label} failed. ${error}` : ''}
      </span>

      {error ? (
        <Tooltip label={error}>
          <span className="text-xs text-bad" role="alert">
            Export failed
          </span>
        </Tooltip>
      ) : null}
    </>
  );
}
