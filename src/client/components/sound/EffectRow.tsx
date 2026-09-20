import { Pause, Play, Trash2 } from 'lucide-react';
import type { Asset } from '../../../shared/types.ts';
import { usePlayer } from '../../lib/usePlayer.ts';
import { ExportMenu } from '../ExportMenu.tsx';
import { IconButton, Pill, cx } from '../ui.tsx';

/**
 * One sound effect, under the form that wrote it.
 *
 * Deliberately not `TakeRow`. That row belongs to the takes column and carries
 * the column's detail panel with it, which is a whole second surface for a
 * page that is a list of two kinds of thing. What is left is what an effect
 * needs: hear it, keep it, throw it away.
 *
 * It plays through the dock rather than through anything local, because an
 * effect is an ordinary take. Renaming is on the project page, where the rest
 * of a project's takes are.
 */

function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined) return 'length unknown';
  const whole = Math.round(seconds * 10) / 10;
  return `${whole.toFixed(1)}s`;
}

export function EffectRow({ asset, onRemove }: { asset: Asset; onRemove: () => void }) {
  const { nowPlaying, playing, play } = usePlayer();

  const current = nowPlaying?.id === asset.id;
  const running = current && playing;

  return (
    <li
      className={cx(
        'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-150',
        current
          ? 'border-accent/50 bg-raised'
          : 'border-line bg-surface hover:border-line-strong hover:bg-raised/60',
      )}
    >
      <IconButton
        label={running ? `Pause ${asset.label}` : `Play ${asset.label}`}
        icon={running ? Pause : Play}
        variant={current ? 'primary' : 'secondary'}
        onClick={() => play(asset)}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{asset.label}</p>
        <p className="truncate text-xs text-ink-faint">
          {formatDuration(asset.durationSeconds)} · {asset.format}
        </p>
      </div>

      {asset.peaks ? null : <Pill tone="neutral">no waveform</Pill>}

      <ExportMenu
        projectId={asset.projectId}
        assetId={asset.id}
        filename={asset.filename}
        label={asset.label}
        format={asset.format}
      />

      <IconButton label={`Delete ${asset.label}`} icon={Trash2} onClick={onRemove} />
    </li>
  );
}
