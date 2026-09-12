import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { rename, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { MAX_ASSET_BYTES, isAcceptedFormat } from '../../shared/limits.ts';
import type { ApiError, Asset, AssetFormat } from '../../shared/types.ts';
import {
  deleteAsset,
  insertAsset,
  listAssets,
  readAsset,
  renameAsset,
  setAssetPeaks,
} from '../db/assets.ts';
import { db } from '../db/index.ts';
import { readProject } from '../db/projects.ts';
import { readAudioFacts } from '../library/metadata.ts';
import { validatePeaks } from '../library/peaks.ts';
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
