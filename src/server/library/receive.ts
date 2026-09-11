import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

/**
 * Streams a request body to a file, counting bytes and hashing as it goes.
 *
 * Nothing is buffered. A 200 MB import costs a chunk of memory at a time, not
 * 200 MB of it, which matters on a NAS with the rest of the app running beside
 * it.
 *
 * The caller is responsible for where the file goes and for what happens next.
 * This function unlinks the file it wrote only when it failed.
 */

export type ReceiveResult =
  | { ok: true; bytes: number; checksum: string }
  | { ok: false; reason: 'empty' | 'too-large' | 'disk-full' | 'write-failed'; message: string };

async function discard(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // The file may never have been created. Nothing to clean up.
  }
}

export async function receiveToFile(
  body: ReadableStream<Uint8Array> | null,
  path: string,
  maxBytes: number,
): Promise<ReceiveResult> {
  if (!body) return { ok: false, reason: 'empty', message: 'The request carried no file' };

  const hash = createHash('sha256');
  let bytes = 0;
  let overflowed = false;

  // Returning early from the generator ends the pipeline cleanly. Throwing
  // would work too, but it makes the too-large case indistinguishable from a
  // real write failure at the catch below.
  async function* limited(source: AsyncIterable<Buffer>): AsyncGenerator<Buffer> {
    for await (const chunk of source) {
      if (bytes + chunk.length > maxBytes) {
        overflowed = true;
        return;
      }
      bytes += chunk.length;
      hash.update(chunk);
      yield chunk;
    }
  }

  try {
    // The body is a DOM ReadableStream, the type Hono hands over and the one
    // this project's DOM lib defines. Node's fromWeb wants its own structurally
    // identical version, so the cast is the whole of the difference.
    await pipeline(
      Readable.fromWeb(body as NodeReadableStream<Uint8Array>),
      limited,
      createWriteStream(path),
    );
  } catch (error) {
    await discard(path);
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOSPC') {
      return { ok: false, reason: 'disk-full', message: 'The disk is full' };
    }
    return {
      ok: false,
      reason: 'write-failed',
      message: error instanceof Error ? error.message : 'The upload could not be written',
    };
  }

  if (overflowed) {
    await discard(path);
    return { ok: false, reason: 'too-large', message: 'The file is larger than the ceiling' };
  }

  if (bytes === 0) {
    await discard(path);
    return { ok: false, reason: 'empty', message: 'The request carried no file' };
  }

  return { ok: true, bytes, checksum: hash.digest('hex') };
}
