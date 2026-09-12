import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Project } from '../../shared/types.ts';
import { ConfirmDialog } from '../components/Dialog.tsx';
import { Button, Field, Panel } from '../components/ui.tsx';
import { useProjects } from '../lib/useProjects.ts';

/** Bytes as something a person reads. Matches the wording on the Models screen. */
function formatBytes(bytes: number): string {
  if (bytes === 0) return 'empty';
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}

function countLabel(count: number): string {
  return count === 1 ? '1 track' : `${count} tracks`;
}

export function LibraryRoute() {
  const { projects, error, loading, create, remove } = useProjects();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<Project | undefined>();
  const navigate = useNavigate();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === '' || creating) return;

    setCreating(true);
    const project = await create(name.trim());
    setCreating(false);

    if (project) {
      setName('');
      void navigate(`/projects/${project.id}`);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl">Library</h1>
        <p className="mt-1 text-ink-muted">Your projects and everything you have made.</p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink"
        >
          {error}
        </p>
      ) : null}

      <Panel title="New project">
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:flex-1">
            <Field
              label="Name"
              id="new-project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Untitled"
              maxLength={200}
            />
          </div>
          <Button type="submit" variant="primary" busy={creating} disabled={name.trim() === ''}>
            Create project
          </Button>
        </form>
      </Panel>

      <Panel title="Projects">
        {loading ? (
          <p className="text-sm text-ink-muted">Loading your projects.</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No projects yet. Make one above, then drop a song into it.
          </p>
        ) : (
          <ul className="flex flex-col">
            {projects.map((project) => (
              <li
                key={project.id}
                className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => void navigate(`/projects/${project.id}`)}
                    className="rounded-sm text-left text-sm text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {project.name}
                  </button>
                  <p className="mt-1 text-sm text-ink-muted">
                    {countLabel(project.assetCount)}, {formatBytes(project.bytes)}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => void navigate(`/projects/${project.id}`)}
                  >
                    Open
                  </Button>
                  <Button variant="ghost" onClick={() => setPendingRemoval(project)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ConfirmDialog
        open={pendingRemoval !== undefined}
        title={`Delete ${pendingRemoval?.name ?? 'this project'}?`}
        body={
          pendingRemoval
            ? `This removes ${countLabel(pendingRemoval.assetCount)} and frees ${formatBytes(pendingRemoval.bytes)}. It cannot be undone.`
            : ''
        }
        confirmLabel="Delete project"
        destructive
        onConfirm={() => {
          if (pendingRemoval) void remove(pendingRemoval.id);
          setPendingRemoval(undefined);
        }}
        onCancel={() => setPendingRemoval(undefined)}
      />
    </div>
  );
}
