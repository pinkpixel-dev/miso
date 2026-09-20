/**
 * Reads a stored file into memory in pieces, rather than in one request.
 *
 * This exists because of a failure `DOCS/ERRORS.md` records twice now. A single
 * `fetch` for a whole audio file fails with "Failed to fetch" in a browser
 * profile with extensions in it, at a size somewhere above a few megabytes,
 * and the same page works in an incognito window. It is not the service: the
 * bytes come back in under a tenth of a second to anything that will take them.
 *
 * The first time, in phase 4, the answer was to stop fetching the file at all
 * and read the waveform on the service instead. That answer is not available
 * here. Editing audio means having the samples in the browser, so the bytes
 * have to arrive somehow.
 *
 * What does work in the same profile is byte ranges, which is how the dock
 * plays a 34 MB take today: a media element seeks by asking for the bytes it
 * wants. So this asks the same way. Each request is small enough to be
 * unremarkable, and the pieces are joined once they are all here.
 *
 * No server change was needed. The audio route has answered 206 with
 * `content-range` since ranges were built for seeking.
 */

/**
 * How much to ask for at a time.
 *
 * The recorded failure was a 34 MB request, and 5.8 MB had been fine for months
 * before it. Four megabytes sits under the known good size rather than near the
 * known bad one, and the cost of being wrong in this direction is a few more
 * requests against a local service.
 */
export const CHUNK_BYTES = 4 * 1024 * 1024;

export interface ContentRange {
  start: number;
  /** Inclusive, matching the header and the service's own range parser. */
  end: number;
  total: number;
}

/**
 * Reads `content-range: bytes 0-4194303/35651584`.
 *
 * Pure, so the parsing is tested without a server, in the same spirit as
 * `server/library/range.ts` on the other side of the same conversation.
 */
export function parseContentRange(header: string | null | undefined): ContentRange | undefined {
  if (!header) return undefined;

  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/.exec(header.trim());
  if (!match) return undefined;

  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  if (end < start || total <= end) return undefined;

  return { start, end, total };
}

/** Joins the pieces, in order, into one block of memory. */
export function joinChunks(chunks: Uint8Array[], total: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export interface RangedFetchProgress {
  received: number;
  total: number;
  fraction: number;
}

/**
 * Fetches a URL in ranged pieces and hands back the whole thing.
 *
 * A service that ignores the range header and answers 200 with everything is
 * handled rather than refused, because that is a correct HTTP answer and the
 * result is the bytes either way.
 */
export async function fetchInRanges(
  url: string,
  onProgress?: (progress: RangedFetchProgress) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];
  let received = 0;
  let total: number | undefined;

  while (total === undefined || received < total) {
    const from = received;
    const to = from + CHUNK_BYTES - 1;

    const response = await fetch(url, { headers: { range: `bytes=${from}-${to}` } });
    if (!response.ok) throw new Error(`The service answered HTTP ${response.status}`);

    const bytes = new Uint8Array(await response.arrayBuffer());

    // 200 means the range was ignored and this is the entire file. Nothing more
    // to ask for, whatever the headers said.
    if (response.status === 200) {
      const whole = bytes.slice().buffer;
      onProgress?.({ received: bytes.length, total: bytes.length, fraction: 1 });
      return new Uint8Array(whole);
    }

    const range = parseContentRange(response.headers.get('content-range'));
    if (!range) {
      throw new Error('The service answered a partial file without saying which part it was');
    }

    // A piece that carries nothing would loop here forever, so it is an error
    // rather than something to keep asking about.
    if (bytes.length === 0) throw new Error('The service answered an empty piece of the file');

    chunks.push(bytes);
    received += bytes.length;
    total = range.total;

    onProgress?.({ received, total, fraction: total === 0 ? 1 : received / total });
  }

  return joinChunks(chunks, received);
}
