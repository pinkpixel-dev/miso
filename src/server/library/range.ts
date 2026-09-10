/**
 * Range header parsing, kept pure so every edge case is a unit test.
 *
 * Seeking inside a track is the whole reason this exists. A phone asks for the
 * bytes around the play head instead of pulling a 200 MB file to hear the
 * middle of it.
 *
 * `end` is inclusive, matching the HTTP header and Content-Range. Only a single
 * range is supported. A multipart range response is a lot of machinery no audio
 * element asks for.
 */

export type RangeResult =
  | { kind: 'whole' }
  | { kind: 'partial'; start: number; end: number }
  | { kind: 'unsatisfiable' };

const PATTERN = /^bytes=(\d*)-(\d*)$/;

export function parseRange(header: string | undefined, size: number): RangeResult {
  if (!header) return { kind: 'whole' };

  const match = PATTERN.exec(header.trim());
  if (!match) return { kind: 'whole' };

  const rawStart = match[1] ?? '';
  const rawEnd = match[2] ?? '';

  // "bytes=-" carries no numbers at all and means nothing. Treat it as absent.
  if (rawStart === '' && rawEnd === '') return { kind: 'whole' };

  if (size === 0) return { kind: 'unsatisfiable' };

  // A suffix range, "bytes=-100", asks for the last 100 bytes.
  if (rawStart === '') {
    const wanted = Number(rawEnd);
    if (wanted === 0) return { kind: 'unsatisfiable' };
    const start = Math.max(0, size - wanted);
    return { kind: 'partial', start, end: size - 1 };
  }

  const start = Number(rawStart);
  if (start >= size) return { kind: 'unsatisfiable' };

  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (end < start) return { kind: 'unsatisfiable' };

  return { kind: 'partial', start, end };
}
