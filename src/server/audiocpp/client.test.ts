import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanPartial,
  deletePackage,
  fetchInstallStatus,
  fetchModelsRoot,
  fetchPackageSizes,
  fetchRegisteredModels,
  readTaskResult,
  runTask,
  startInstall,
  stopInstall,
} from './client.ts';

/**
 * `runTask` calls undici's own fetch rather than the global one, so it can hand
 * it a dispatcher with the 300 second header timeout disabled. See client.ts.
 *
 * These tests stub the global fetch, so undici's is pointed at whatever the
 * stub currently is. Without this every runTask case below would make a real
 * request to a backend that is not there.
 */
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
  return {
    ...actual,
    fetch: (...args: unknown[]) => (globalThis.fetch as (...a: unknown[]) => unknown)(...args),
  };
});

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const load = (name: string): unknown => JSON.parse(readFileSync(join(fixtures, name), 'utf8'));

function respondWith(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPackageSizes', () => {
  it('reports a scan in progress', async () => {
    respondWith(load('package-sizes-scanning.json'));
    const result = await fetchPackageSizes('http://backend');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.scanning).toBe(true);
      expect(result.value.packages.every((p) => p.bytes === undefined)).toBe(true);
    }
  });

  it('reports sizes and installed state once the scan completes', async () => {
    respondWith(load('package-sizes-complete.json'));
    const result = await fetchPackageSizes('http://backend');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.scanning).toBe(false);
      expect(result.value.packages.length).toBe(202);
      expect(result.value.packages.every((p) => typeof p.id === 'string')).toBe(true);
      const acestepTurbo = result.value.packages.find((p) => p.id === 'ace_step_turbo_q8_0');
      expect(acestepTurbo).toEqual({ id: 'ace_step_turbo_q8_0', bytes: 6185460032, installed: true });
    }
  });

  it('reports management disabled rather than throwing', async () => {
    respondWith(load('management-forbidden.json'), 403);
    const result = await fetchPackageSizes('http://backend');
    expect(result).toEqual({ ok: false, reason: 'management_disabled', message: expect.any(String) });
  });

  it('reports an unreachable server rather than throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const result = await fetchPackageSizes('http://backend');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unreachable');
  });
});

describe('fetchInstallStatus', () => {
  it('reports a running install with real byte progress', async () => {
    respondWith(load('install-status-running.json'));
    const result = await fetchInstallStatus('http://backend', 'stable_audio_3_small_music_q8_0');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.known).toBe(true);
      expect(result.value.finished).toBe(false);
      expect(result.value.failed).toBe(false);
      expect(result.value.phase).toBe('running');
      expect(result.value.downloadedBytes).toBe(40950081);
      expect(result.value.totalBytes).toBe(1683570752);
    }
  });

  it('reports a finished, successful install', async () => {
    respondWith(load('install-status-complete.json'));
    const result = await fetchInstallStatus('http://backend', 'stable_audio_3_small_music_q8_0');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.finished).toBe(true);
      expect(result.value.failed).toBe(false);
      expect(result.value.downloadedBytes).toBe(1683570752);
    }
  });

  it('reports a job the server does not know about, with no misleading byte counts', async () => {
    respondWith(load('install-status-unknown.json'));
    const result = await fetchInstallStatus('http://backend', 'definitely_not_a_package');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.known).toBe(false);
      expect(result.value.downloadedBytes).toBeUndefined();
      expect(result.value.totalBytes).toBeUndefined();
    }
  });

  it('reports a failed install as known, finished, and failed, and keeps the real error message', async () => {
    // Recorded live against a gated Hugging Face package (pocket_tts_english_safetensors),
    // which the server refuses without a valid HF token. state is "failed" directly, not
    // "complete" with a non-zero exit_code, and exit_code and progress_percent both stay -1.
    respondWith(load('install-status-failed.json'));
    const result = await fetchInstallStatus('http://backend', 'pocket_tts_english_safetensors');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.known).toBe(true);
      expect(result.value.finished).toBe(true);
      expect(result.value.failed).toBe(true);
      expect(result.value.phase).toBe('failed');
      expect(result.value.message).toBe(
        'kyutai/pocket-tts/languages/english/embeddings/alba.safetensors requires accepted Hugging Face access and a valid HF token',
      );
    }
  });
});

describe('startInstall', () => {
  it('posts the id key, not package, and succeeds', async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify(load('install-started.json')), { status: 200 }));
    vi.stubGlobal('fetch', spy);

    const result = await startInstall('http://backend', 'htdemucs_q8_0');

    expect(result.ok).toBe(true);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/v1/ui/models/install');
    expect(String(init.body)).toBe(JSON.stringify({ id: 'htdemucs_q8_0' }));
  });
});

describe('fetchInstallStatus request shape', () => {
  it('queries by id, not package', async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify(load('install-status-running.json')), { status: 200 }));
    vi.stubGlobal('fetch', spy);

    await fetchInstallStatus('http://backend', 'stable_audio_3_small_music_q8_0');

    const [url] = spy.mock.calls[0] as unknown as [string];
    expect(url).toBe('http://backend/v1/ui/models/install-status?id=stable_audio_3_small_music_q8_0');
  });
});

describe('stopInstall, deletePackage, cleanPartial', () => {
  it('all post the id key to their respective routes', async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify(load('install-status-complete.json')), { status: 200 }));
    vi.stubGlobal('fetch', spy);

    await stopInstall('http://backend', 'p1');
    await deletePackage('http://backend', 'p2');
    await cleanPartial('http://backend', 'p3');

    const calls = spy.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0]?.[0]).toContain('/v1/ui/models/install/stop');
    expect(String(calls[0]?.[1].body)).toBe(JSON.stringify({ id: 'p1' }));
    expect(calls[1]?.[0]).toContain('/v1/ui/models/delete');
    expect(String(calls[1]?.[1].body)).toBe(JSON.stringify({ id: 'p2' }));
    expect(calls[2]?.[0]).toContain('/v1/ui/models/clean-partial');
    expect(String(calls[2]?.[1].body)).toBe(JSON.stringify({ id: 'p3' }));
  });
});

describe('cleanPartial', () => {
  // The real server carries the count only in its message, confirmed live:
  // {"id":"...","cleaned":true,"message":"Cleaned 0 partial download directories for ..."}
  it('reads the directory count out of the server message', async () => {
    respondWith({ id: 'p1', cleaned: true, message: 'Cleaned 3 partial download directories for p1' });
    const result = await cleanPartial('http://backend', 'p1');
    expect(result).toEqual({ ok: true, value: 3 });
  });

  it('reads a sweep that removed nothing as zero, not as unknown', async () => {
    respondWith({ id: 'p1', cleaned: true, message: 'Cleaned 0 partial download directories for p1' });
    const result = await cleanPartial('http://backend', 'p1');
    expect(result).toEqual({ ok: true, value: 0 });
  });

  it('reports an unknown count rather than guessing when the wording changes', async () => {
    respondWith({ id: 'p1', cleaned: true, message: 'Removed the leftovers' });
    const result = await cleanPartial('http://backend', 'p1');
    expect(result).toEqual({ ok: true, value: undefined });
  });
});

describe('fetchModelsRoot', () => {
  it('reads where the server keeps packages', async () => {
    respondWith(load('models-root.json'));
    const result = await fetchModelsRoot('http://backend');
    expect(result).toEqual({ ok: true, value: '/app/models' });
  });

  it('treats a response with no root as an error rather than an empty path', async () => {
    respondWith({ is_default: true });
    const result = await fetchModelsRoot('http://backend');
    expect(result).toMatchObject({ ok: false, reason: 'error' });
  });
});

describe('fetchRegisteredModels', () => {
  it('reads what the server has registered, loaded or not', async () => {
    respondWith(load('models-list.json'));
    const result = await fetchRegisteredModels('http://backend');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        {
          id: 'miso-probe-ace-step',
          family: 'ace_step',
          task: 'gen',
          loaded: true,
          path: '/app/models/ACE-Step1.5-GGUF/turbo',
        },
      ]);
    }
  });

  it('answers with an empty list when nothing is registered', async () => {
    respondWith({ object: 'list', data: [] });
    const result = await fetchRegisteredModels('http://backend');
    expect(result).toEqual({ ok: true, value: [] });
  });
});

describe('readTaskResult', () => {
  it('reads a single audio result', () => {
    const result = readTaskResult({ audio: 'AAA=', sample_rate: 48000, channels: 2 });
    expect(result).toEqual({ audio: 'AAA=', sampleRate: 48000, channels: 2, namedOutputs: [] });
  });

  it('reads the named outputs a separation returns', () => {
    const result = readTaskResult({
      named_audio_outputs: [
        { id: 'vocals', audio: 'AAA=' },
        { id: 'drums', audio: 'BBB=' },
      ],
    });
    expect(result.namedOutputs.map((output) => output.id)).toEqual(['vocals', 'drums']);
    // With no top level audio, the first named output stands in as the result.
    expect(result.audio).toBe('AAA=');
  });

  it('throws when a finished task returned no audio at all', () => {
    expect(() => readTaskResult({ timing: {} })).toThrow(/no audio/i);
  });
});

describe('runTask', () => {
  it('treats a 503 as busy rather than a failure', async () => {
    respondWith({ error: { message: 'server_busy' } }, 503);
    const result = await runTask('http://backend', 'miso:ace', { task_route: 'text2music' });
    expect(result).toMatchObject({ ok: false, reason: 'busy' });
  });

  it('names an unknown model so the caller can say what to install', async () => {
    respondWith({ error: { message: 'unknown model id: nope' } }, 400);
    const result = await runTask('http://backend', 'nope', {});
    expect(result).toMatchObject({ ok: false, reason: 'unknown_model', message: 'unknown model id: nope' });
  });

  it('returns the audio on success', async () => {
    respondWith({ audio: 'AAA=', sample_rate: 48000, channels: 2 });
    const result = await runTask('http://backend', 'miso:ace', { task_route: 'text2music' });
    expect(result.ok && result.value.audio).toBe('AAA=');
  });
});
