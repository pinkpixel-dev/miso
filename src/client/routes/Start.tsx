import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Field, Panel } from '../components/ui.tsx';
import { firstRunSuggestion } from '../lib/models.ts';
import { useCatalog } from '../lib/useCatalog.ts';
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

/**
 * The one thing a new install is missing, said before anything else.
 *
 * Miso ships no weights. On a first run the catalog is empty, every generate
 * button is disabled for a reason that is one screen away, and the create form
 * below looks like it should work. This is the gap between starting the stack
 * and making a sound, and it is the only part of the first run that a person
 * cannot work out by looking.
 *
 * It names one package rather than listing the catalog. A list is a decision to
 * make before you know anything about the models, and the catalog already marks
 * which one its authors recommend.
 *
 * Shows nothing at all once anything can generate, and nothing while the
 * backend is unreachable, which the banner in the shell is already saying more
 * accurately than this could.
 */
function FirstRun() {
  const { catalog } = useCatalog();
  const suggestion = firstRunSuggestion(catalog);
  if (!suggestion) return null;

  const { pkg, familyLabel } = suggestion;
  const installing = pkg.install?.state === 'running';

  return (
    <Panel title={installing ? 'Getting your first model' : 'Start by downloading a model'}>
      {installing ? (
        <p className="text-sm text-ink">
          {pkg.label} is downloading. It keeps going if you leave this screen.{' '}
          <Link to="/models" className="underline underline-offset-4 hover:text-ink">
            Watch it
          </Link>
        </p>
      ) : (
        <>
          <p className="text-sm text-ink">
            Miso generates with models you download once and keep. There are none yet, so nothing
            can be generated until one arrives.
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Start with {pkg.label}
            {pkg.bytes === undefined ? '' : `, ${formatBytes(pkg.bytes)}`}. {familyLabel} is the
            model the rest of Miso is built around: it writes from a prompt, takes lyrics, and every
            remix route runs on it.
          </p>
          {/*
            A link rather than a button, because it goes somewhere. That keeps
            middle click, open in a new tab, and the screen reader announcing it
            as a link. It carries the primary button's classes rather than
            wrapping Button, which does not take an `asChild`.
          */}
          <Link
            to="/models"
            className="mt-3 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink transition-colors duration-150 hover:bg-accent/90 active:bg-accent/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Open the model catalog
          </Link>
        </>
      )}
    </Panel>
  );
}

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

      <FirstRun />

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
