import { X } from 'lucide-react';
import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { Asset, Job } from '../../../shared/types.ts';
import { stringJobParam } from '../../lib/takeDetails.ts';
import { Tooltip, cx } from '../ui.tsx';

function formatBytes(bytes: number): string {
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}

function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined) return 'length unknown';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function RecordedText({ value, missing }: { value: string | undefined; missing: string }) {
  return value === undefined ? (
    <p className="text-sm text-ink-faint">{missing}</p>
  ) : (
    <p className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-ink-muted">
      {value}
    </p>
  );
}

export function TakeDetailPanel({
  asset,
  job,
  closeButtonRef,
  onClose,
}: {
  asset: Asset | undefined;
  job: Job | undefined;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const open = asset !== undefined;

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [asset?.id, closeButtonRef, onClose, open]);

  const prompt = job ? stringJobParam(job, 'prompt') : undefined;
  const lyrics = job ? stringJobParam(job, 'lyrics') : undefined;

  return (
    <div
      aria-hidden={!open}
      className={cx('absolute inset-0 z-30', open ? 'pointer-events-auto' : 'pointer-events-none')}
    >
      <button
        type="button"
        aria-label="Close take details"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-transparent"
      />

      <section
        id="take-detail-panel"
        role="dialog"
        aria-labelledby={open ? 'take-detail-title' : undefined}
        inert={!open}
        className={cx(
          'absolute inset-y-0 right-0 flex w-[min(420px,100%)] flex-col border-l border-line bg-surface shadow-xl',
          'transition-[transform,opacity] duration-200',
          open ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0',
        )}
      >
        {asset ? (
          <>
            <header className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 id="take-detail-title" className="truncate text-base font-medium text-ink">
                  {asset.label}
                </h2>
                <p className="mt-1 break-all text-xs text-ink-faint">{asset.filename}</p>
                <p className="mt-1 text-xs text-ink-faint">
                  {formatDuration(asset.durationSeconds)} · {asset.format} · {formatBytes(asset.bytes)}
                </p>
              </div>
              <Tooltip label="Close take details">
                <button
                  ref={closeButtonRef}
                  type="button"
                  aria-label="Close take details"
                  onClick={onClose}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-raised hover:text-ink active:bg-raised/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </Tooltip>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {!job ? (
                <section>
                  <h3 className="text-sm font-medium text-ink">
                    {asset.kind === 'source' ? 'Imported audio' : 'Generation details unavailable'}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {asset.kind === 'source'
                      ? 'This file was imported, so it does not have a generation prompt or lyrics.'
                      : 'No producing job was found in this project history, so there is no prompt or lyric record to show.'}
                  </p>
                </section>
              ) : (
                <div className="flex flex-col gap-6">
                  <section>
                    <h3 className="mb-2 text-sm font-medium text-ink">Prompt used</h3>
                    <RecordedText value={prompt} missing="No prompt was recorded for this job." />
                  </section>

                  {job.originalPrompt !== undefined ? (
                    <section className="border-t border-line pt-5">
                      <h3 className="mb-2 text-sm font-medium text-ink">Original idea</h3>
                      <RecordedText value={job.originalPrompt} missing="" />
                    </section>
                  ) : null}

                  <section className="border-t border-line pt-5">
                    <h3 className="mb-2 text-sm font-medium text-ink">Lyrics</h3>
                    <RecordedText value={lyrics} missing="No lyrics were recorded for this job." />
                  </section>
                </div>
              )}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
