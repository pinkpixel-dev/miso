import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { JobList } from '../components/JobList.tsx';
import { SoundEffects } from '../components/sound/SoundEffects.tsx';
import { Transcriptions } from '../components/sound/Transcriptions.tsx';
import { projectPath } from '../lib/routes.ts';
import { useMidiArtifacts } from '../lib/useMidiArtifacts.ts';
import { useStudio } from '../lib/useStudio.ts';

/**
 * Sound design, at /projects/:id/sound.
 *
 * The two phase 7 tools, on a page of their own. Neither makes a song. A sound
 * effect is an event rather than a track, and a transcription is not even
 * audio, so the generate form was the wrong home for one and the remix picker
 * was the wrong home for the other. Decided on 2026-09-19, and the second half
 * of that overrides the September 14 rule in Remix.tsx that one page carries
 * every task working from a take.
 *
 * Which tasks land here is decided by `surface` on the task in the registry,
 * not by matching ids in this file, so the two filters that feed the other two
 * pages stay automatic.
 *
 * Project scoped, because a sound effect is saved into a project and a
 * transcription hangs off one of its takes.
 */
export function SoundRoute() {
  const { project, projectId, assets, tasks, catalog, jobs, submit, cancelJob, dismissJobs, dismissedCount } =
    useStudio();

  const [busy, setBusy] = useState<'sfx' | 'midi' | undefined>();

  const midi = useMidiArtifacts(projectId, jobs);

  const sfxTask = tasks.find((task) => task.id === 'generate.sfx');
  const midiTask = tasks.find((task) => task.id === 'analyze.midi');

  async function run(kind: 'sfx' | 'midi', body: Parameters<typeof submit>[0]) {
    setBusy(kind);
    try {
      await submit(body);
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            to={projectPath(projectId ?? '')}
            className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors duration-150 hover:text-ink"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            {project?.name ?? 'Back to the project'}
          </Link>
          <h1 className="mt-1 font-display text-xl font-semibold tracking-tight">Sound design</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Sound effects written from a description, and the notes read back out of a take.
            Neither of these is a song, which is why they are not on the generate form.
          </p>
        </div>
      </header>

      <SoundEffects
        task={sfxTask}
        catalog={catalog}
        busy={busy === 'sfx'}
        onSubmit={(modelId, params) => void run('sfx', { taskId: 'generate.sfx', modelId, params })}
      />

      <Transcriptions
        task={midiTask}
        catalog={catalog}
        assets={assets}
        artifacts={midi.artifacts}
        loading={midi.loading}
        error={midi.error}
        busy={busy === 'midi'}
        onSubmit={(modelId, assetId) =>
          void run('midi', {
            taskId: 'analyze.midi',
            modelId,
            params: {},
            inputs: [{ assetId, role: 'source' }],
          })
        }
        onDelete={(id) => void midi.remove(id)}
      />

      <JobList
        jobs={jobs}
        hiddenCount={dismissedCount}
        onCancel={cancelJob}
        onClear={dismissJobs}
      />
    </div>
  );
}
