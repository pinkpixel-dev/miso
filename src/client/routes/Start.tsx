import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Panel } from '../components/ui.tsx';
import { useProjects } from '../lib/useProjects.ts';

/**
 * What you land on with no project open.
 *
 * This replaced the Library screen. The rail already lists every project, so a
 * second grid of the same projects was one answer to a question that was
 * already answered. What is left is the part the rail cannot do: making a new
 * project, and a short way back into the ones you touched last.
 */

function countLabel(count: number): string {
  return count === 1 ? '1 take' : `${count} takes`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return 'empty';
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}

/** Enough to get back to what you were doing, not a second library screen. */
const RECENT = 5;

export function StartRoute() {
  const { projects, error, loading, create } = useProjects();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
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

  const recent = projects.slice(0, RECENT);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl">Start something</h1>
        <p className="mt-1 text-ink-muted">
          Make a project, then generate a take or drop a song into it.
        </p>
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

      {loading && projects.length === 0 ? null : recent.length === 0 ? null : (
        <Panel title="Recent">
          <ul className="flex flex-col">
            {recent.map((project) => (
              <li
                key={project.id}
                className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-t-0"
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
                <Button
                  variant="secondary"
                  onClick={() => void navigate(`/projects/${project.id}`)}
                >
                  Open
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
