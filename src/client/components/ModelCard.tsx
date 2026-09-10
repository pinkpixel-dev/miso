import { useState } from 'react';
import type { CatalogFamily, CatalogPackage } from '../../shared/types.ts';
import { ConfirmDialog } from './Dialog.tsx';
import { Disclosure } from './Disclosure.tsx';
import { Button, Pill } from './ui.tsx';

/** Bytes as something a person reads, for example "6.19 GB". */
function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return 'size unknown';
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}

function installLine(pkg: CatalogPackage): string | undefined {
  const install = pkg.install;
  if (!install) return undefined;

  switch (install.state) {
    case 'running': {
      const { downloadedBytes: done, totalBytes: total } = install;
      if (done !== undefined && total !== undefined && total > 0) {
        return `Downloading, ${formatBytes(done)} of ${formatBytes(total)}`;
      }
      return install.phase ? `Downloading, ${install.phase}` : 'Downloading';
    }
    case 'failed':
      return `Install failed. ${install.error ?? ''}`.trim();
    case 'interrupted':
      return install.error ?? 'The download stopped.';
    case 'cancelled':
      return 'Install cancelled.';
    case 'complete':
      return undefined;
  }
}

function PackageRow({
  pkg,
  disabled,
  onInstall,
  onStop,
  onRemove,
}: {
  pkg: CatalogPackage;
  disabled: boolean;
  onInstall: () => void;
  onStop: () => void;
  onRemove: () => void;
}) {
  const running = pkg.install?.state === 'running';
  const line = installLine(pkg);
  const fraction =
    pkg.install?.downloadedBytes !== undefined && pkg.install.totalBytes
      ? Math.min(1, pkg.install.downloadedBytes / pkg.install.totalBytes)
      : undefined;

  return (
    <div className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink">{pkg.label}</span>
          <span className="font-mono text-xs text-ink-faint">{pkg.precision}</span>
          {pkg.recommended ? <Pill tone="neutral">recommended</Pill> : null}
          {pkg.installed ? <Pill tone="good">installed</Pill> : null}
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {formatBytes(pkg.bytes)}
          {line ? `. ${line}` : ''}
        </p>
        {running ? (
          <div
            role="progressbar"
            aria-label={`Installing ${pkg.label}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={fraction === undefined ? undefined : Math.round(fraction * 100)}
            className="mt-2 h-1 w-full max-w-xs overflow-hidden rounded-full bg-raised"
          >
            <div
              className="h-full bg-accent transition-[width] duration-500"
              style={{ width: fraction === undefined ? '100%' : `${fraction * 100}%` }}
            />
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {running ? (
          <Button variant="secondary" onClick={onStop} disabled={disabled}>
            Stop
          </Button>
        ) : pkg.installed ? (
          <Button variant="ghost" onClick={onRemove} disabled={disabled}>
            Remove
          </Button>
        ) : (
          <Button variant="primary" onClick={onInstall} disabled={disabled}>
            {pkg.install?.state === 'interrupted' ? 'Resume' : 'Install'}
          </Button>
        )}
      </div>
    </div>
  );
}

export function ModelCard({
  family,
  disabled,
  onInstall,
  onStop,
  onRemove,
}: {
  family: CatalogFamily;
  disabled: boolean;
  onInstall: (id: string) => void;
  onStop: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [pendingRemoval, setPendingRemoval] = useState<CatalogPackage | undefined>();
  const [lead, ...rest] = family.packages;
  if (!lead) return null;

  const rowProps = (pkg: CatalogPackage) => ({
    pkg,
    disabled,
    onInstall: () => onInstall(pkg.id),
    onStop: () => onStop(pkg.id),
    onRemove: () => setPendingRemoval(pkg),
  });

  return (
    <article className="rounded-lg border border-line bg-surface p-5">
      <header>
        <h3 className="text-base text-ink">{family.displayName}</h3>
        <p className="mt-1 text-sm text-ink-muted">{family.summary}</p>
        {family.tasks.length > 0 ? (
          <p className="mt-2 font-mono text-xs text-ink-faint">{family.tasks.join(' · ')}</p>
        ) : null}
      </header>

      <div className="mt-4">
        <PackageRow {...rowProps(lead)} />
      </div>

      {rest.length > 0 ? (
        <div className="mt-2">
          <Disclosure summary={`${rest.length} other ${rest.length === 1 ? 'version' : 'versions'}`}>
            {rest.map((pkg) => (
              <PackageRow key={pkg.id} {...rowProps(pkg)} />
            ))}
          </Disclosure>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingRemoval !== undefined}
        title={`Remove ${pendingRemoval?.label ?? ''}?`}
        body={
          <>
            This deletes {formatBytes(pendingRemoval?.bytes)} from the server. You can install it again later, which
            means downloading it again.
          </>
        }
        confirmLabel="Remove"
        destructive
        onCancel={() => setPendingRemoval(undefined)}
        onConfirm={() => {
          const target = pendingRemoval;
          setPendingRemoval(undefined);
          if (target) onRemove(target.id);
        }}
      />
    </article>
  );
}
