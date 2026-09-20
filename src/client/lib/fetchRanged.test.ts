import { describe, expect, it, vi } from 'vitest';
import { CHUNK_BYTES, fetchInRanges, joinChunks, parseContentRange } from './fetchRanged.ts';

/**
 * A stand in for the audio route, answering ranges the way it does.
 *
 * Worth faking rather than skipping. The reason this module exists at all is a
 * failure that only happens in a real browser profile, which no test can
 * reproduce, but the part that can go wrong on every run is the arithmetic:
 * asking for the right offsets, stopping at the right place, and putting the
 * pieces back in order.
 */
function serve(body: Uint8Array, { ignoreRange = false } = {}) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const header = (init?.headers as Record<string, string> | undefined)?.range;

    if (ignoreRange || !header) {
      return new Response(body.slice() as unknown as BodyInit, { status: 200 });
    }

    const match = /^bytes=(\d+)-(\d+)$/.exec(header)!;
    const start = Number(match[1]);
    const end = Math.min(Number(match[2]), body.length - 1);
    const slice = body.slice(start, end + 1);

    return new Response(slice as unknown as BodyInit, {
      status: 206,
      headers: { 'content-range': `bytes ${start}-${end}/${body.length}` },
    });
  });
}

/** Bytes whose value says where they came from, so order is checkable. */
function counted(length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) out[i] = i % 251;
  return out;
}

describe('parseContentRange', () => {
  it('reads the header the service sends', () => {
    expect(parseContentRange('bytes 0-4194303/35651584')).toEqual({
      start: 0,
      end: 4_194_303,
      total: 35_651_584,
    });
  });

  it('copes with extra spacing', () => {
    expect(parseContentRange('  bytes   10-20/100  ')).toEqual({ start: 10, end: 20, total: 100 });
  });

  it('refuses a header that is missing or nonsense', () => {
    expect(parseContentRange(undefined)).toBeUndefined();
    expect(parseContentRange(null)).toBeUndefined();
    expect(parseContentRange('')).toBeUndefined();
    expect(parseContentRange('bytes */100')).toBeUndefined();
    expect(parseContentRange('items 0-1/2')).toBeUndefined();
  });

  it('refuses a range that cannot be true', () => {
    // Ends before it starts, and claims more bytes than the file holds.
    expect(parseContentRange('bytes 20-10/100')).toBeUndefined();
    expect(parseContentRange('bytes 0-100/50')).toBeUndefined();
  });
});

describe('joinChunks', () => {
  it('puts the pieces back in order', () => {
    const joined = joinChunks([Uint8Array.from([1, 2]), Uint8Array.from([3, 4, 5])], 5);
    expect(Array.from(joined)).toEqual([1, 2, 3, 4, 5]);
  });

  it('gives back nothing for nothing', () => {
    expect(joinChunks([], 0).length).toBe(0);
  });
});

describe('fetchInRanges', () => {
  it('reads a file smaller than one piece in a single request', async () => {
    const body = counted(1000);
    const fetcher = serve(body);
    vi.stubGlobal('fetch', fetcher);

    const out = await fetchInRanges('/audio');
    expect(Array.from(out)).toEqual(Array.from(body));
    expect(fetcher).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('asks for the next piece from where the last one ended', async () => {
    const body = counted(1000);
    const fetcher = serve(body);
    vi.stubGlobal('fetch', fetcher);

    await fetchInRanges('/audio');
    const sent = (fetcher.mock.calls[0]![1]!.headers as Record<string, string>).range;
    expect(sent).toBe(`bytes=0-${CHUNK_BYTES - 1}`);

    vi.unstubAllGlobals();
  });

  it('joins several pieces back into the original bytes', async () => {
    // Larger than three chunks, so the loop runs properly rather than once.
    const body = counted(CHUNK_BYTES * 2 + 17);
    const fetcher = serve(body);
    vi.stubGlobal('fetch', fetcher);

    const out = await fetchInRanges('/audio');
    expect(out.length).toBe(body.length);
    expect(Array.from(out.slice(0, 50))).toEqual(Array.from(body.slice(0, 50)));
    expect(Array.from(out.slice(-50))).toEqual(Array.from(body.slice(-50)));
    expect(fetcher).toHaveBeenCalledTimes(3);

    vi.unstubAllGlobals();
  });

  it('reports progress that finishes at one', async () => {
    const body = counted(CHUNK_BYTES + 5);
    vi.stubGlobal('fetch', serve(body));

    const seen: number[] = [];
    await fetchInRanges('/audio', (progress) => seen.push(progress.fraction));

    expect(seen.at(-1)).toBe(1);
    expect(seen.every((f) => f > 0 && f <= 1)).toBe(true);

    vi.unstubAllGlobals();
  });

  it('takes the whole file when the service ignores the range', async () => {
    const body = counted(5000);
    const fetcher = serve(body, { ignoreRange: true });
    vi.stubGlobal('fetch', fetcher);

    const out = await fetchInRanges('/audio');
    expect(Array.from(out)).toEqual(Array.from(body));
    expect(fetcher).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('gives up on an error rather than looping', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );

    await expect(fetchInRanges('/audio')).rejects.toThrow('HTTP 404');
    vi.unstubAllGlobals();
  });

  it('gives up when a piece arrives without saying which piece it is', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(counted(10) as unknown as BodyInit, { status: 206 })),
    );

    await expect(fetchInRanges('/audio')).rejects.toThrow('which part');
    vi.unstubAllGlobals();
  });

  it('gives up on an empty piece instead of asking forever', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array(0) as unknown as BodyInit, {
            status: 206,
            headers: { 'content-range': 'bytes 0-0/100' },
          }),
      ),
    );

    await expect(fetchInRanges('/audio')).rejects.toThrow('empty piece');
    vi.unstubAllGlobals();
  });
});
