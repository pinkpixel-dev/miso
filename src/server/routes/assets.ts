import { Hono } from 'hono';
import { ZipFile } from 'yazl';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, rename, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { MAX_ASSET_BYTES, isAcceptedFormat } from '../../shared/limits.ts';
import type { ApiError, Asset, AssetFormat, Job } from '../../shared/types.ts';
import {
  deleteAsset,
  insertAsset,
  listAssets,
  readAsset,
  renameAsset,
  setAssetPeaks,
} from '../db/assets.ts';
import { db } from '../db/index.ts';
import { createJob, listJobInputs, listJobs, readJob } from '../db/jobs.ts';
import { findScoreForAsset } from '../db/scores.ts';
import { readProject } from '../db/projects.ts';
import { storeAudio } from '../jobs/results.ts';
import { readAudioFacts } from '../library/metadata.ts';
import { mixChannels, type MixSource } from '../library/mix.ts';
import { validatePeaks } from '../library/peaks.ts';
import { readWav, writeWav } from '../library/wav.ts';
import { peaksFromWav } from '../library/wavPeaks.ts';
import { parseRange } from '../library/range.ts';
import { receiveToFile } from '../library/receive.ts';
import {
  assetPath,
  ensureProjectDir,
  removeAsset,
  removeTemp,
  tempPath,
} from '../library/storage.ts';

/**
 * Assets.
 *
 * Import is the interesting one. The body is the raw file, not multipart,
 * because Hono's parseBody buffers the whole request and there is only ever one
 * file. The filename travels in x-miso-filename, URI encoded so a non-ASCII
 * name survives the header.
 *
 * The file is written and verified before the row is inserted. A crash between
 * the two leaves a file nothing points at, which is invisible and gets swept at
 * startup. The other order would leave a row whose file is missing, which is a
 * broken entry someone has to explain.
 */
export const assetRoutes = new Hono();

const MEGABYTE = 1024 * 1024;
const MAX_LABEL_LENGTH = 200;

const CONTENT_TYPES: Record<AssetFormat, string> = {
  wav: 'audio/wav',
  flac: 'audio/flac',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
};

function readFilename(header: string | undefined): string | undefined {
  if (!header) return undefined;
  try {
    const decoded = decodeURIComponent(header).trim();
    return decoded === '' ? undefined : decoded;
  } catch {
    // A header that is not valid percent encoding. Take it as it came.
    return header.trim() || undefined;
  }
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

/** "tone.wav" becomes "tone". A name with no dot keeps all of itself. */
function labelFrom(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const stem = dot === -1 ? filename : filename.slice(0, dot);
  return stem.trim() === '' ? filename : stem;
}

/**
 * Finds an asset and confirms it belongs to the project in the URL.
 *
 * Without the second check, an asset id from one project would be reachable
 * through another project's path, and the delete route would then remove a file
 * from a directory the caller never named.
 */
function assetIn(projectId: string, assetId: string): Asset | undefined {
  const asset = readAsset(db(), assetId);
  return asset && asset.projectId === projectId ? asset : undefined;
}

/**
 * Reads a slice of a file as a web stream Hono can answer with.
 *
 * `end` is inclusive here because createReadStream is inclusive too, which
 * matches the HTTP header and saves a conversion nobody would remember.
 */
function fileStream(path: string, start?: number, end?: number): ReadableStream<Uint8Array> {
  const node = start === undefined ? createReadStream(path) : createReadStream(path, { start, end });
  return Readable.toWeb(node) as ReadableStream<Uint8Array>;
}

/**
 * A name no other entry in this zip already has.
 *
 * Two outputs of one job can carry the same filename, which is what happens
 * when a take's label repeats. A zip with two identical entries is a zip that
 * unpacks to one file on most tools, silently.
 */
function uniqueEntryName(taken: Set<string>, filename: string): string {
  if (!taken.has(filename)) {
    taken.add(filename);
    return filename;
  }

  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : '';

  for (let n = 2; ; n += 1) {
    const candidate = `${stem} ${n}${extension}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

/** What the download itself is called. */
function zipName(title: string): string {
  const trimmed = title.trim().slice(0, MAX_LABEL_LENGTH);
  return `${trimmed === '' ? 'stems' : trimmed}.zip`;
}

/**
 * A filename that survives a header. The plain `filename` is there for old
 * clients, `filename*` carries the real one, which may be non-ASCII.
 */
function disposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

assetRoutes.post('/projects/:id/assets', async (c) => {
  const projectId = c.req.param('id');
  if (!readProject(db(), projectId)) {
    return c.json<ApiError>({ error: `No project with the id ${projectId}` }, 404);
  }

  const filename = readFilename(c.req.header('x-miso-filename'));
  if (!filename) {
    return c.json<ApiError>({ error: 'The x-miso-filename header is required' }, 400);
  }

  // Checked before a byte is read, so an obviously wrong file does not cost a
  // 200 MB upload first. The parse below is the check that actually decides.
  const extension = extensionOf(filename);
  if (!isAcceptedFormat(extension)) {
    return c.json<ApiError>(
      {
        error: `Miso does not import ${extension === '' ? 'files with no extension' : extension} files`,
        detail: 'Accepted formats are wav, flac, mp3, and m4a.',
      },
      415,
    );
  }

  await ensureProjectDir(projectId);
  const temp = tempPath(projectId);

  const received = await receiveToFile(c.req.raw.body, temp, MAX_ASSET_BYTES);
  if (!received.ok) {
    if (received.reason === 'too-large') {
      return c.json<ApiError>(
        { error: `That file is larger than the ${Math.round(MAX_ASSET_BYTES / MEGABYTE)} MB limit` },
        413,
      );
    }
    if (received.reason === 'disk-full') {
      return c.json<ApiError>({ error: 'The disk is full, so the import was not saved' }, 507);
    }
    if (received.reason === 'empty') {
      return c.json<ApiError>({ error: 'The request carried no file' }, 400);
    }
    return c.json<ApiError>({ error: 'The upload could not be saved', detail: received.message }, 500);
  }

  const facts = await readAudioFacts(temp);
  if (!facts.ok) {
    await removeTemp(temp);
    return c.json<ApiError>(
      { error: `${filename} could not be read as audio`, detail: `Detected: ${facts.detected}` },
      415,
    );
  }

  const id = randomUUID();
  try {
    await rename(temp, assetPath(projectId, id, facts.value.format));
  } catch (error) {
    await removeTemp(temp);
    return c.json<ApiError>(
      {
        error: 'The upload could not be stored',
        detail: error instanceof Error ? error.message : undefined,
      },
      500,
    );
  }

  const asset = insertAsset(db(), {
    id,
    projectId,
    kind: 'source',
    label: labelFrom(filename),
    filename,
    format: facts.value.format,
    bytes: received.bytes,
    checksum: received.checksum,
    durationSeconds: facts.value.durationSeconds,
    sampleRate: facts.value.sampleRate,
    channels: facts.value.channels,
  });

  return c.json<Asset>(asset, 201);
});

assetRoutes.put('/projects/:id/assets/:assetId/peaks', async (c) => {
  const projectId = c.req.param('id');
  const assetId = c.req.param('assetId');

  const asset = assetIn(projectId, assetId);
  if (!asset) return c.json<ApiError>({ error: `No asset with the id ${assetId}` }, 404);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json<ApiError>({ error: 'Request body must be JSON' }, 400);
  }

  const result = validatePeaks((body as { peaks?: unknown })?.peaks);
  if (!result.ok) {
    return c.json<ApiError>({ error: 'Those peaks are not usable', detail: result.error }, 400);
  }

  const updated = setAssetPeaks(db(), assetId, result.value);
  if (!updated) return c.json<ApiError>({ error: `No asset with the id ${assetId}` }, 404);

  return c.json<Asset>(updated);
});

/**
 * One take, whole, peaks included.
 *
 * The library list leaves peaks out, because they are 23 KB a row and nothing
 * in that list draws a waveform. This is how the take being played reaches the
 * dock with one: without stored peaks the player falls back to fetching the
 * entire file to draw it, which for a three minute WAV is the 34 MB request
 * DOCS/ERRORS.md records a browser extension blocking outright.
 */
assetRoutes.get('/projects/:id/assets/:assetId', (c) => {
  const assetId = c.req.param('assetId');
  const asset = assetIn(c.req.param('id'), assetId);
  if (!asset) return c.json<ApiError>({ error: `No asset with the id ${assetId}` }, 404);

  return c.json<Asset>(asset);
});

assetRoutes.patch('/projects/:id/assets/:assetId', async (c) => {
  const projectId = c.req.param('id');
  const assetId = c.req.param('assetId');

  if (!assetIn(projectId, assetId)) {
    return c.json<ApiError>({ error: `No asset with the id ${assetId}` }, 404);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json<ApiError>({ error: 'Request body must be JSON' }, 400);
  }

  const { label } = (body ?? {}) as { label?: unknown };
  if (typeof label !== 'string' || label.trim() === '') {
    return c.json<ApiError>({ error: 'An asset needs a name' }, 400);
  }
  if (label.trim().length > MAX_LABEL_LENGTH) {
    return c.json<ApiError>(
      { error: `A name cannot be longer than ${MAX_LABEL_LENGTH} characters` },
      400,
    );
  }

  const updated = renameAsset(db(), assetId, label.trim());
  if (!updated) return c.json<ApiError>({ error: `No asset with the id ${assetId}` }, 404);

  return c.json<Asset>(updated);
});

/** File first, then row, for the same reason import writes in that order. */
assetRoutes.delete('/projects/:id/assets/:assetId', async (c) => {
  const projectId = c.req.param('id');
  const assetId = c.req.param('assetId');

  const asset = assetIn(projectId, assetId);
  if (!asset) return c.json<ApiError>({ error: `No asset with the id ${assetId}` }, 404);

  await removeAsset(projectId, assetId, asset.format);
  deleteAsset(db(), assetId);

  return c.json<Asset[]>(listAssets(db(), projectId));
});

/**
 * Reads a stored track's waveform on the service and saves it.
 *
 * The browser route below it still exists and still handles mp3, flac, and m4a,
 * which need a real decoder. This handles WAV, and it matters more than a small
 * saving: drawing a waveform in the browser means fetching the entire file, and
 * a three minute WAV is 34 MB. That request is large enough for a browser
 * extension to intercept, and when one does it fails with "Failed to fetch" and
 * there is no way for the person to draw the waveform at all. Reading it here
 * needs nothing from the browser but the request.
 */
assetRoutes.post('/projects/:id/assets/:assetId/peaks/read', async (c) => {
  const projectId = c.req.param('id');
  const assetId = c.req.param('assetId');

  const asset = assetIn(projectId, assetId);
  if (!asset) return c.json<ApiError>({ error: `No asset with the id ${assetId}` }, 404);

  if (asset.format !== 'wav') {
    return c.json<ApiError>(
      {
        error: `Miso cannot read the waveform of a ${asset.format} file`,
        detail: 'Only WAV is read here. Everything else is decoded in the browser.',
      },
      415,
    );
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(assetPath(projectId, assetId, asset.format));
  } catch {
    return c.json<ApiError>({ error: `The file for ${asset.label} is missing from disk` }, 404);
  }

  const peaks = peaksFromWav(bytes);
  if (!peaks) {
    return c.json<ApiError>(
      {
        error: `The waveform of ${asset.label} could not be read`,
        detail: 'Its samples are in a layout Miso does not read. The browser may manage it.',
      },
      415,
    );
  }

  const updated = setAssetPeaks(db(), assetId, peaks);
  if (!updated) return c.json<ApiError>({ error: `No asset with the id ${assetId}` }, 404);

  return c.json<Asset>(updated);
});

assetRoutes.get('/projects/:id/assets/:assetId/audio', async (c) => {
  const projectId = c.req.param('id');
  const assetId = c.req.param('assetId');

  const asset = assetIn(projectId, assetId);
  if (!asset) return c.json<ApiError>({ error: `No asset with the id ${assetId}` }, 404);

  const path = assetPath(projectId, assetId, asset.format);

  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return c.json<ApiError>({ error: `The file for ${asset.label} is missing from disk` }, 404);
  }

  const range = parseRange(c.req.header('range'), size);
  const type = CONTENT_TYPES[asset.format];

  if (range.kind === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { 'content-range': `bytes */${size}`, 'accept-ranges': 'bytes' },
    });
  }

  if (range.kind === 'whole') {
    return new Response(fileStream(path), {
      status: 200,
      headers: {
        'content-type': type,
        'content-length': String(size),
        'accept-ranges': 'bytes',
      },
    });
  }

  return new Response(fileStream(path, range.start, range.end), {
    status: 206,
    headers: {
      'content-type': type,
      'content-length': String(range.end - range.start + 1),
      'content-range': `bytes ${range.start}-${range.end}/${size}`,
      'accept-ranges': 'bytes',
    },
  });
});

/**
 * Every stem this set can be mixed from.
 *
 * The separation's own outputs, plus any stem made from one of them, which
 * today means a voice conversion. A conversion is written under its own job, so
 * the separation's output list cannot see it, and a mix that could only reach
 * that list would be unable to save the one thing the conversion is for:
 * hearing a new voice over the backing it was sung against.
 *
 * Only stems are picked up. A mix of this set is a descendant of every stem in
 * it, and summing a set together with the mix of that set would double it.
 *
 * Returned as a set rather than checked per asset, because the page sends gains
 * for whatever it is showing and the answer to "may this be mixed here" must
 * not depend on the order they arrive in.
 */
function mixableStemIds(projectId: string, job: Job): Set<string> {
  const allowed = new Set<string>(job.outputAssetIds);

  for (const other of listJobs(db(), projectId)) {
    if (other.id === job.id) continue;
    if (!other.inputs.some((input) => allowed.has(input.assetId))) continue;

    for (const producedId of other.outputAssetIds) {
      const asset = assetIn(projectId, producedId);
      if (asset?.kind === 'stem') allowed.add(producedId);
    }
  }

  return allowed;
}

/**
 * Sums a separation's stems back into one take.
 *
 * The gains arrive already resolved by the page: solo and mute are questions
 * about what you are listening to, and the answer is whatever you can hear, so
 * a muted stem reaches here as a zero rather than as a flag this would have to
 * interpret a second time and possibly differently. What you save is what you
 * heard, which is the whole promise of the button.
 *
 * Done here and now rather than queued. Summing four stems is well under a
 * second, nothing is sent to audio.cpp, and queueing it would mean teaching the
 * worker to run work that never leaves this process.
 *
 * The job row exists for lineage rather than for the queue. It is written
 * complete, carries the gains that produced the mix, and points at every stem
 * that went into it, so the detail panel can answer what this was made from.
 */
assetRoutes.post('/projects/:id/jobs/:jobId/mix', async (c) => {
  const projectId = c.req.param('id');
  const jobId = c.req.param('jobId');

  if (!readProject(db(), projectId)) {
    return c.json<ApiError>({ error: `No project with the id ${projectId}` }, 404);
  }

  const job = readJob(db(), jobId);
  if (!job || job.projectId !== projectId) {
    return c.json<ApiError>({ error: `No job with the id ${jobId}` }, 404);
  }

  const body = (await c.req.json().catch(() => null)) as { gains?: unknown } | null;
  const gains = body?.gains;
  if (typeof gains !== 'object' || gains === null || Array.isArray(gains)) {
    return c.json<ApiError>({ error: 'gains is required, as an object of asset id to level' }, 400);
  }

  const levels = gains as Record<string, unknown>;
  const sources: MixSource[] = [];
  const usedAssetIds: string[] = [];
  let sampleRate: number | undefined;

  for (const assetId of mixableStemIds(projectId, job)) {
    const asset = assetIn(projectId, assetId);
    if (!asset) continue;

    const raw = levels[assetId];
    const gain = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 1;
    if (gain === 0) continue;

    const audio = readWav(await readFile(assetPath(projectId, assetId, asset.format)));
    if (!audio) {
      return c.json<ApiError>({ error: `${asset.label} could not be read as a WAV` }, 422);
    }

    // Every stem of one separation comes back at one rate. A set that
    // disagrees is not a set, and summing it would play one part at the wrong
    // speed rather than failing.
    if (sampleRate === undefined) sampleRate = audio.sampleRate;
    else if (sampleRate !== audio.sampleRate) {
      return c.json<ApiError>({ error: 'These stems are not all at the same sample rate' }, 422);
    }

    sources.push({ channels: audio.channels, gain });
    usedAssetIds.push(assetId);
  }

  if (sources.length === 0 || sampleRate === undefined) {
    return c.json<ApiError>({ error: 'There is nothing audible to mix' }, 400);
  }

  const mixed = mixChannels(sources);
  const bytes = writeWav(mixed.channels, sampleRate);

  // Named after the take the stems came out of, which the separation job
  // recorded as its source. A mix called "Split into stems mix" would say
  // nothing about which song it is.
  const source = listJobInputs(db(), jobId).find((input) => input.role === 'source');
  const sourceAsset = source ? readAsset(db(), source.assetId) : undefined;
  const label = `${sourceAsset?.label ?? job.title ?? 'Stems'} (mix)`;

  const mixJobId = randomUUID();
  createJob(db(), mixJobId, {
    projectId,
    taskId: 'stems.mix',
    // No model ran. This mix was summed here, and the field is the package a
    // job used, which for this one is nothing.
    modelId: '',
    params: { gains: Object.fromEntries(usedAssetIds.map((id, at) => [id, sources[at]!.gain])) },
    title: label,
    state: 'complete',
    inputs: usedAssetIds.map((assetId) => ({ assetId, role: 'stem' })),
  });

  const asset = await storeAudio(db(), projectId, mixJobId, label, 'mix', bytes);

  return c.json({ asset, clipped: mixed.clipped }, 201);
});

/**
 * Every output of one job, as a zip.
 *
 * This exists for separation, which is the only thing that writes several
 * takes at once. Four stems exported one at a time is four trips through a
 * save dialog, and they belong together.
 *
 * Stored, not deflated. These are PCM WAVs and they do not compress to
 * anything worth the time: the point of the container here is to carry four
 * files under one name, not to make them smaller.
 *
 * Streamed from disk rather than read. A three minute stereo set is well over
 * a hundred megabytes, and yazl reads each entry as the zip is written, so
 * none of it is ever held whole in memory.
 *
 * A missing file is left out rather than failing the whole export. Three stems
 * and one gap is more useful than a refusal, and the sweep at startup is what
 * cleans up rows whose file has gone.
 */
assetRoutes.get('/projects/:id/jobs/:jobId/outputs.zip', async (c) => {
  const projectId = c.req.param('id');
  const jobId = c.req.param('jobId');

  if (!readProject(db(), projectId)) {
    return c.json<ApiError>({ error: `No project with the id ${projectId}` }, 404);
  }

  const job = readJob(db(), jobId);
  if (!job || job.projectId !== projectId) {
    return c.json<ApiError>({ error: `No job with the id ${jobId}` }, 404);
  }

  const outputs = job.outputAssetIds.flatMap((id) => {
    const asset = assetIn(projectId, id);
    return asset ? [asset] : [];
  });

  if (outputs.length === 0) {
    return c.json<ApiError>({ error: 'This job has nothing to export' }, 404);
  }

  const zip = new ZipFile();
  const taken = new Set<string>();

  for (const asset of outputs) {
    const path = assetPath(projectId, asset.id, asset.format);
    try {
      await stat(path);
    } catch {
      continue;
    }
    zip.addFile(path, uniqueEntryName(taken, asset.filename));
  }

  zip.end();

  // yazl types its output as the NodeJS.ReadableStream interface while handing
  // back a real Readable, and toWeb wants the class. The cast is the whole of
  // the difference, the same shape as the one in audiocpp/client.ts.
  const body = Readable.toWeb(zip.outputStream as Readable) as ReadableStream<Uint8Array>;

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': disposition(zipName(job.title ?? 'stems')),
    },
  });
});

/**
 * Export is the stored bytes, unchanged. There is no conversion, because
 * converting needs an encoder and this phase keeps the server free of codecs.
 */
assetRoutes.get('/projects/:id/assets/:assetId/download', async (c) => {
  const projectId = c.req.param('id');
  const assetId = c.req.param('assetId');

  const asset = assetIn(projectId, assetId);
  if (!asset) return c.json<ApiError>({ error: `No asset with the id ${assetId}` }, 404);

  const path = assetPath(projectId, assetId, asset.format);

  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return c.json<ApiError>({ error: `The file for ${asset.label} is missing from disk` }, 404);
  }

  return new Response(fileStream(path), {
    status: 200,
    headers: {
      'content-type': CONTENT_TYPES[asset.format],
      'content-length': String(size),
      'content-disposition': disposition(asset.filename),
    },
  });
});

/**
 * The ABC score a take was planned from, as a download.
 *
 * Served from the database rather than from disk, which 010 explains: the
 * document is about a kilobyte and lives in a column.
 *
 * A take with no score is a 404 and not an error worth dressing up. Only YuE2
 * writes one, and only with its planning left on, so most takes in a project
 * will never have one.
 */
assetRoutes.get('/projects/:id/assets/:assetId/score', (c) => {
  const projectId = c.req.param('id');
  const assetId = c.req.param('assetId');

  const asset = assetIn(projectId, assetId);
  if (!asset) return c.json<ApiError>({ error: `No asset with the id ${assetId}` }, 404);

  const score = findScoreForAsset(db(), assetId);
  if (!score) {
    return c.json<ApiError>({ error: `${asset.label} was generated without a score` }, 404);
  }

  return new Response(score.abc, {
    status: 200,
    headers: {
      'content-type': 'text/vnd.abc; charset=utf-8',
      'content-length': String(Buffer.byteLength(score.abc, 'utf8')),
      'content-disposition': disposition(score.filename),
    },
  });
});

