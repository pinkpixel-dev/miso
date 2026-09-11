import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dataDir } from '../config.ts';
import { receiveToFile } from './receive.ts';

const scratch = join(dataDir, 'receive-test');
const target = join(scratch, 'out.bin');

function stream(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

beforeEach(async () => {
  await mkdir(scratch, { recursive: true });
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('receiveToFile', () => {
  it('writes the body and reports its size and checksum', async () => {
    const result = await receiveToFile(stream('hello ', 'world'), target, 1000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.bytes).toBe(11);
    expect(result.checksum).toBe(createHash('sha256').update('hello world').digest('hex'));
    expect(await readFile(target, 'utf8')).toBe('hello world');
  });

  it('refuses a body past the ceiling and leaves no file behind', async () => {
    const result = await receiveToFile(stream('a'.repeat(50)), target, 10);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.reason).toBe('too-large');
    expect(existsSync(target)).toBe(false);
  });

  it('accepts a body exactly at the ceiling', async () => {
    const result = await receiveToFile(stream('a'.repeat(10)), target, 10);
    expect(result.ok).toBe(true);
  });

  it('refuses an absent body', async () => {
    const result = await receiveToFile(null, target, 1000);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('empty');
  });

  it('refuses an empty body', async () => {
    const result = await receiveToFile(stream(''), target, 1000);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('empty');
  });

  it('reports a write it could not perform', async () => {
    const result = await receiveToFile(stream('hello'), join(scratch, 'absent-dir', 'out.bin'), 1000);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('write-failed');
  });
});
