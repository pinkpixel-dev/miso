import { afterEach, describe, expect, it, vi } from 'vitest';
import { chat } from './client.ts';

const external = { url: 'https://api.example.com/v1', model: 'a-model', key: 'sk-test' };
const local = { url: 'http://127.0.0.1:8081/v1', model: 'local-model', key: '' };

function respondWith(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const mock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

const answer = { choices: [{ message: { content: 'synthwave, dreamy' } }] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chat', () => {
  it('reads the text out of a completion', async () => {
    respondWith(answer);
    expect(await chat(external, 'system', 'user')).toEqual({ ok: true, value: 'synthwave, dreamy' });
  });

  it('sends the key as a bearer token', async () => {
    const mock = respondWith(answer);
    await chat(external, 'system', 'user');

    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect(mock.mock.calls[0]?.[0]).toBe('https://api.example.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
  });

  it('sends no authorization at all to a local server', async () => {
    const mock = respondWith(answer);
    await chat(local, 'system', 'user');

    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect('authorization' in (init.headers as Record<string, string>)).toBe(false);
  });

  it('puts both messages in the body under the model that was configured', async () => {
    const mock = respondWith(answer);
    await chat(external, 'be a songwriter', 'write about rain');

    const body = JSON.parse((mock.mock.calls[0]?.[1] as RequestInit).body as string) as {
      model: string;
      messages: { role: string; content: string }[];
    };

    expect(body.model).toBe('a-model');
    expect(body.messages).toEqual([
      { role: 'system', content: 'be a songwriter' },
      { role: 'user', content: 'write about rain' },
    ]);
  });

  it('says the key was refused rather than repeating a status code', async () => {
    respondWith({ error: { message: 'Incorrect API key provided' } }, 401);
    const result = await chat(external, 'system', 'user');

    expect(result).toMatchObject({ ok: false, message: 'Incorrect API key provided' });
  });

  it('points at the version path when nothing answered', async () => {
    respondWith({}, 404);
    const result = await chat(external, 'system', 'user');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/version path/);
  });

  it('reports a completion that came back empty', async () => {
    respondWith({ choices: [{ message: { content: '' } }] });
    expect(await chat(external, 'system', 'user')).toMatchObject({ ok: false });
  });

  it('says which address could not be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const result = await chat(local, 'system', 'user');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('http://127.0.0.1:8081/v1');
  });
});
