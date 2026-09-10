import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readAudioFacts } from './metadata.ts';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('readAudioFacts', () => {
  it.each([
    ['tone.wav', 'wav'],
    ['tone.flac', 'flac'],
    ['tone.mp3', 'mp3'],
    ['tone.m4a', 'm4a'],
  ])('reads %s as %s', async (file, format) => {
    const result = await readAudioFacts(join(fixtures, file));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.format).toBe(format);
    expect(result.value.sampleRate).toBe(44100);
    expect(result.value.channels).toBe(2);
    expect(result.value.durationSeconds).toBeGreaterThan(0.5);
    expect(result.value.durationSeconds).toBeLessThan(2);
  });

  it('rejects a file that is not audio, whatever it is called', async () => {
    const result = await readAudioFacts(join(fixtures, 'not-audio.wav'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detected).toMatch(/\S/);
  });

  it('rejects a file that does not exist', async () => {
    const result = await readAudioFacts(join(fixtures, 'absent.wav'));
    expect(result.ok).toBe(false);
  });
});
