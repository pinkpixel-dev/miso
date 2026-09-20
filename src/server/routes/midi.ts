import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import type { ApiError, MidiArtifact } from '../../shared/types.ts';
import { db } from '../db/index.ts';
import { deleteMidiArtifact, findMidiArtifact, listMidiArtifacts } from '../db/midi.ts';
import { readProject } from '../db/projects.ts';
import { midiPath, removeMidi } from '../library/storage.ts';

/**
 * Transcriptions, at /api/projects/:id/midi.
 *
 * Separate from the asset routes because a transcription is not an asset. It
 * has no format to negotiate, no ranges to serve, no waveform to upload and no
 * conversion on the way out. What is left is a list, a download and a delete.
 *
 * There is no POST. A transcription is made by queueing `analyze.midi` through
 * the job routes, the same as every other task, and arrives here when the
 * worker stores the result.
 */
export const midiRoutes = new Hono();

/** Same as the asset download header, so a MIDI file saves under its own name. */
function disposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

midiRoutes.get('/projects/:id/midi', (c) => {
  const projectId = c.req.param('id');
  if (!readProject(db(), projectId)) {
    return c.json<ApiError>({ error: `No project with the id ${projectId}` }, 404);
  }

  return c.json<MidiArtifact[]>(listMidiArtifacts(db(), projectId));
});

midiRoutes.get('/projects/:id/midi/:midiId/download', async (c) => {
  const projectId = c.req.param('id');
  const artifact = findMidiArtifact(db(), c.req.param('midiId'));

  // The project is checked against the row rather than on its own, so a valid
  // id under the wrong project reads as missing instead of handing the file
  // over.
  if (!artifact || artifact.projectId !== projectId) {
    return c.json<ApiError>({ error: 'No transcription with that id in this project' }, 404);
  }

  const path = midiPath(projectId, artifact.id);
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return c.json<ApiError>({ error: `The file for ${artifact.label} is missing from disk` }, 404);
  }

  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>, {
    status: 200,
    headers: {
      'content-type': 'audio/midi',
      'content-length': String(size),
      'content-disposition': disposition(artifact.filename),
    },
  });
});

midiRoutes.delete('/projects/:id/midi/:midiId', async (c) => {
  const projectId = c.req.param('id');
  const artifact = findMidiArtifact(db(), c.req.param('midiId'));

  if (!artifact || artifact.projectId !== projectId) {
    return c.json<ApiError>({ error: 'No transcription with that id in this project' }, 404);
  }

  // The row goes first. A file left behind with no row is invisible and gets
  // swept; a row left behind with no file is a download that 404s.
  deleteMidiArtifact(db(), artifact.id);
  await removeMidi(projectId, artifact.id);

  return c.json<MidiArtifact[]>(listMidiArtifacts(db(), projectId));
});
