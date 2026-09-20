import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureLoaded, registrationId } from './residency.ts';
import { findTask } from '../tasks/registry.ts';

const task = findTask('generate.text2music');
if (!task) throw new Error('generate.text2music is missing from the registry');

const ace = 'ace_step_turbo_q8_0';

/**
 * Answers each route the load path calls, and records what was asked for. The
 * order matters: registered models, then package sizes, then the models root,
 * then any unloads and the load itself.
 */
function backend(models: { id: string; loaded: boolean }[]) {
  const calls: { path: string; body: unknown }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ path, body });

      const json = (value: unknown) =>
        new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

      if (path === '/v1/models') {
        return json({
          data: models.map((model) => ({
            ...model,
            family: 'ace_step',
            task: 'gen',
            path: '/app/models/ACE-Step1.5-GGUF/turbo',
          })),
        });
      }
      if (path === '/v1/ui/models/package-sizes') {
        return json({ state: 'complete', data: [{ id: ace, size_bytes: 1, installed: true }] });
      }
      if (path === '/v1/ui/models-root') return json({ models_root: '/app/models' });
      if (path === '/v1/models/unload') return json({ id: body, loaded: false });
      if (path === '/v1/models/load') return json({ id: body, loaded: true });
      return new Response('nope', { status: 404 });
    }),
  );

  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ensureLoaded', () => {
  it('does nothing when the model it needs is already loaded', async () => {
    const calls = backend([{ id: registrationId(ace), loaded: true }]);

    expect(await ensureLoaded('http://backend', task, ace, 'gen')).toEqual({ ok: true });
    expect(calls.map((call) => call.path)).toEqual(['/v1/models']);
  });

  /**
   * The case that failed a real generation: a stray registration left loaded,
   * plus Miso's own, is two copies of a 13 GB model on a 16 GB card.
   */
  it('unloads anything else that is resident before loading', async () => {
    const calls = backend([
      { id: 'someone-elses-ace-step', loaded: true },
      { id: registrationId(ace), loaded: false },
    ]);

    expect(await ensureLoaded('http://backend', task, ace, 'gen')).toEqual({ ok: true });

    const unloads = calls.filter((call) => call.path === '/v1/models/unload');
    expect(unloads.map((call) => (call.body as { id: string }).id)).toEqual(['someone-elses-ace-step']);

    // And the load came after the unload, not before it.
    expect(calls.findIndex((c) => c.path === '/v1/models/load')).toBeGreaterThan(
      calls.findIndex((c) => c.path === '/v1/models/unload'),
    );
  });

  it('leaves a registration that is already unloaded alone', async () => {
    const calls = backend([{ id: 'idle-model', loaded: false }]);

    await ensureLoaded('http://backend', task, ace, 'gen');
    expect(calls.some((call) => call.path === '/v1/models/unload')).toBe(false);
  });

  it('loads with the variant subdirectory and the session options the task needs', async () => {
    const calls = backend([]);
    await ensureLoaded('http://backend', task, ace, 'gen');

    const load = calls.find((call) => call.path === '/v1/models/load')?.body as Record<string, unknown>;
    expect(load).toMatchObject({
      id: registrationId(ace),
      family: 'ace_step',
      path: '/app/models/ACE-Step1.5-GGUF/turbo',
      task: 'gen',
      session_options: { 'ace_step.mem_saver': 'true' },
    });
  });

  it('says a package is not installed rather than letting the loader fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const path = new URL(url).pathname;
        const json = (value: unknown) =>
          new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
        if (path === '/v1/models') return json({ data: [] });
        if (path === '/v1/ui/models/package-sizes') {
          return json({ state: 'complete', data: [{ id: ace, size_bytes: 0, installed: false }] });
        }
        return new Response('nope', { status: 404 });
      }),
    );

    expect(await ensureLoaded('http://backend', task, ace, 'gen')).toMatchObject({
      ok: false,
      reason: 'not_installed',
    });
  });
});

describe('ensureLoaded and the registration kind', () => {
  /**
   * The registration id is per package, so one package held under two kinds is
   * the same id twice. Vevo2 is the first family that needs both: its singing
   * routes are split across `svc` and `tts`, and a request naming a route the
   * loaded kind does not carry is refused after staging, where it looks like
   * the job was working.
   */
  it('loads again when the loaded model is registered under another kind', async () => {
    const calls = backend([{ id: registrationId(ace), loaded: true }]);

    expect(await ensureLoaded('http://backend', task, ace, 'tts')).toEqual({ ok: true });

    const load = calls.find((call) => call.path === '/v1/models/load');
    expect(load).toBeDefined();
    expect((load?.body as { task: string }).task).toBe('tts');
  });

  it('still does nothing when the kind already matches', async () => {
    const calls = backend([{ id: registrationId(ace), loaded: true }]);

    expect(await ensureLoaded('http://backend', task, ace, 'gen')).toEqual({ ok: true });
    expect(calls.map((call) => call.path)).toEqual(['/v1/models']);
  });
});
