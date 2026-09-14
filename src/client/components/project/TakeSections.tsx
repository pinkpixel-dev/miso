import type { Asset } from '../../../shared/types.ts';
import type { TakeSection } from '../../lib/takeGroups.ts';
import { TakeRow } from '../shell/TakeRow.tsx';

/**
 * Everything in the project, under a heading per origin.
 *
 * The rows are the same `TakeRow` the takes column uses. One row component
 * means play, export, rename and delete behave the same in both places, and a
 * row that gains an action gains it everywhere.
 *
 * Sections are flat by design. A repaint of a repaint sits with the other
 * repaints and says nothing about where it came from, because that is a tree.
 */

function countLabel(count: number): string {
  return count === 1 ? '1 take' : `${count} takes`;
}

export function TakeSections({
  sections,
  selectedAssetId,
  onOpenDetails,
  onRename,
  onRemove,
}: {
  sections: TakeSection[];
  selectedAssetId: string | undefined;
  onOpenDetails: (asset: Asset, trigger: HTMLButtonElement) => void;
  onRename: (asset: Asset, label: string) => void;
  onRemove: (asset: Asset) => void;
}) {
  return (
    <div className="flex flex-col gap-8">
      {sections.map((section) => (
        <section key={section.key} aria-labelledby={`take-section-${section.key}`}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
            <h2
              id={`take-section-${section.key}`}
              className="text-sm font-medium text-ink"
            >
              {section.label}
            </h2>
            <p className="text-xs text-ink-faint">{countLabel(section.takes.length)}</p>
          </div>

          <ul className="flex flex-col gap-2">
            {section.takes.map((asset) => (
              <TakeRow
                key={asset.id}
                asset={asset}
                detailsOpen={selectedAssetId === asset.id}
                onOpenDetails={(trigger) => onOpenDetails(asset, trigger)}
                onRename={(label) => onRename(asset, label)}
                onRemove={() => onRemove(asset)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
