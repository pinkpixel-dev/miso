import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StorageUsage as Usage } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { Panel } from './ui.tsx';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 MB';
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}

export function StorageUsage() {
  const [usage, setUsage] = useState<Usage | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    api
      .getStorage()
      .then(setUsage)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  return (
    <Panel title="Storage">
      {error ? (
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
      ) : !usage ? (
        <p className="text-sm text-ink-muted">Working out what is stored.</p>
      ) : usage.projects.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing stored yet.</p>
      ) : (
        <>
          <p className="text-sm text-ink">{formatBytes(usage.totalBytes)} across all projects.</p>
          <ul className="mt-3 flex flex-col">
            {usage.projects.map((project) => (
              <li
                key={project.id}
                className="flex items-center justify-between gap-2 border-t border-line py-2 first:border-t-0"
              >
                <Link
                  to={`/projects/${project.id}`}
                  className="min-w-0 truncate text-sm text-ink underline-offset-4 hover:underline"
                >
                  {project.name}
                </Link>
                <span className="shrink-0 text-sm text-ink-muted">
                  {formatBytes(project.bytes)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
