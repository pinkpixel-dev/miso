import { Download, Pause, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
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
 *
 * The scrub bar holds its own position while it is being dragged and hands one
 * value to the preview when the drag ends. Seeking rebuilds the audio graph,
 * and a transcription can run to several thousand notes, so a seek per pointer
 * move would stutter for as long as the drag lasted.
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
  const [scrub, setScrub] = useState<number | undefined>();

  const sourceName = source?.label ?? 'a take that has since been deleted';
  const length = artifact.durationSeconds === undefined ? undefined : timecode(artifact.durationSeconds);
  const at = scrub ?? preview.position;

  function commitScrub() {
    if (scrub === undefined) return;
    preview.seek(scrub);
    setScrub(undefined);
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{artifact.label}</p>
          <p className="mt-1 text-xs text-ink-muted">
            From {sourceName} · {artifact.noteCount} {artifact.noteCount === 1 ? 'note' : 'notes'}
            {length ? ` · ${length}` : ''}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
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
      </div>

      {preview.available ? (
        <div className="flex items-center gap-3">
          <IconButton
            label={preview.playing ? `Pause ${artifact.label}` : `Hear ${artifact.label} as plain tones`}
            icon={preview.playing ? Pause : Play}
            variant={preview.playing ? 'primary' : 'secondary'}
            onClick={() => (preview.playing ? preview.pause() : preview.play())}
          />

          <span className="w-10 shrink-0 text-right font-mono text-xs text-ink-faint">
            {timecode(at)}
          </span>

          <input
            type="range"
            min={0}
            max={preview.duration}
            step={0.1}
            value={at}
            aria-label={`Position in ${artifact.label}`}
            aria-valuetext={`${timecode(at)} of ${timecode(preview.duration)}`}
            onChange={(event) => setScrub(Number(event.target.value))}
            onPointerUp={commitScrub}
            onKeyUp={commitScrub}
            onBlur={commitScrub}
            className="h-9 min-w-0 flex-1 accent-[var(--color-accent)]"
          />

          <span className="w-10 shrink-0 font-mono text-xs text-ink-faint">
            {timecode(preview.duration)}
          </span>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">
          This transcription has no note events, so there is nothing to preview. The MIDI file
          is still downloadable.
        </p>
      )}
    </li>
  );
}
