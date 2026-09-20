import { Download, Pause, Play, Trash2 } from 'lucide-react';
import type { Asset, MidiArtifact } from '../../../shared/types.ts';
import { midiDownloadUrl } from '../../lib/api.ts';
import { useMidiPreview } from '../../lib/useMidiPreview.ts';
import { IconButton, cx } from '../ui.tsx';

function timecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * One transcription: what it came from, how to hear it, how to keep it.
 *
 * The preview is a row of oscillators, not the MIDI file being rendered. It is
 * here to answer whether the notes are right before you take the file
 * somewhere that can play it properly. See `lib/useMidiPreview.ts`.
 */
export function MidiRow({
  artifact,
  source,
  onDelete,
}: {
  artifact: MidiArtifact;
  source: Asset | undefined;
  onDelete: () => void;
}) {
  const preview = useMidiPreview(artifact.notes);

  const sourceName = source?.label ?? 'a take that has since been deleted';
  const length = artifact.durationSeconds === undefined ? undefined : timecode(artifact.durationSeconds);

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm text-ink">{artifact.label}</p>
        <p className="mt-1 text-xs text-ink-muted">
          From {sourceName} · {artifact.noteCount} {artifact.noteCount === 1 ? 'note' : 'notes'}
          {length ? ` · ${length}` : ''}
        </p>
        {preview.playing ? (
          <p className="mt-1 font-mono text-xs text-ink-faint" role="status" aria-live="off">
            {timecode(preview.position)} / {timecode(preview.duration)}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <IconButton
          label={
            !preview.available
              ? 'This transcription has no notes to play'
              : preview.playing
                ? 'Stop the preview'
                : 'Hear the notes as plain tones'
          }
          icon={preview.playing ? Pause : Play}
          disabled={!preview.available}
          onClick={() => (preview.playing ? preview.stop() : preview.play())}
        />

        <a
          href={midiDownloadUrl(artifact.projectId, artifact.id)}
          download
          aria-label={`Download ${artifact.filename}`}
          className={cx(
            'inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-md border border-line px-3.5 py-2',
            'text-sm font-medium text-ink-muted transition-colors duration-150',
            'hover:bg-raised hover:text-ink active:bg-raised/70',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          )}
        >
          <Download size={16} aria-hidden="true" />
          Download
        </a>

        <IconButton label={`Delete ${artifact.label}`} icon={Trash2} onClick={onDelete} />
      </div>
    </li>
  );
}
