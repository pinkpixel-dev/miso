import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError, LyricsDraft, PromptSuggestion } from '../../shared/types.ts';
import { db } from '../db/index.ts';
import { writeSettings } from '../db/settings.ts';
import { lyricsRoutes } from './lyrics.ts';

function app(): Hono {
  const instance = new Hono();
  instance.route('/api', lyricsRoutes);
  return instance;
}

function json(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

function answers(content: string): ReturnType<typeof vi.fn> {
  const mock = vi.fn(
    async () =>
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

function configure(): void {
  writeSettings({
    lyricsEngine: 'external',
    lyricsExternalUrl: 'https://api.example.com/v1',
    lyricsExternalModel: 'a-model',
    lyricsExternalKey: 'sk-test',
  });
}

beforeEach(() => {
  db().prepare('DELETE FROM settings').run();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('when nothing is configured', () => {
  it('says which field is missing rather than failing at the provider', async () => {
    const response = await app().request('/api/lyrics/write', json({ description: 'rain' }));

    expect(response.status).toBe(409);
    expect(((await response.json()) as ApiError).detail).toMatch(/API key/i);
  });

  it('asks for a model once a key is stored', async () => {
    writeSettings({ lyricsExternalKey: 'sk-test' });
    const response = await app().request('/api/lyrics/write', json({ description: 'rain' }));

    expect(response.status).toBe(409);
    expect(((await response.json()) as ApiError).detail).toMatch(/model/i);
  });

  it('needs no key at all for a local server', async () => {
    writeSettings({ lyricsEngine: 'local' });
    answers('Title: Rain\n[Verse]\nline');

    expect((await app().request('/api/lyrics/write', json({ description: 'rain' }))).status).toBe(200);
  });
});

describe('POST /api/lyrics/write', () => {
  beforeEach(configure);

  it('answers with the lyrics and the title split apart', async () => {
    answers('Title: Midnight Drive\n\n[Verse 1]\nThe road is long');
    const response = await app().request('/api/lyrics/write', json({ description: 'driving home' }));

    expect(await response.json()).toEqual<LyricsDraft>({
      title: 'Midnight Drive',
      lyrics: '[Verse 1]\nThe road is long',
    });
  });

  it('sends the builder state along with the description', async () => {
    const mock = answers('[Verse]\nline');
    await app().request(
      '/api/lyrics/write',
      json({
        description: 'driving home',
        studio: {
          genre: ['Synthwave'],
          mood: [],
          customStyle: '',
          vocalStyle: '',
          vocalMode: 'female',
        },
      }),
    );

    const body = JSON.parse((mock.mock.calls[0]?.[1] as RequestInit).body as string) as {
      messages: { content: string }[];
    };
    expect(body.messages[1]?.content).toContain('Genre: Synthwave');
    expect(body.messages[1]?.content).toContain('driving home');
  });

  it('refuses an empty description', async () => {
    expect((await app().request('/api/lyrics/write', json({ description: '  ' }))).status).toBe(400);
  });

  it('passes the provider failure through rather than burying it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 })),
    );

    const response = await app().request('/api/lyrics/write', json({ description: 'rain' }));
    expect(response.status).toBe(502);
    expect(((await response.json()) as ApiError).detail).toBe('rate limited');
  });
});

describe('POST /api/lyrics/enhance', () => {
  beforeEach(configure);

  it('answers with the expansion beside the prompt it came from', async () => {
    answers('synthwave, dreamy, warm tape saturation, airy female vocals');
    const response = await app().request('/api/lyrics/enhance', json({ prompt: 'synthwave' }));

    expect(await response.json()).toEqual<PromptSuggestion>({
      original: 'synthwave',
      suggestion: 'synthwave, dreamy, warm tape saturation, airy female vocals',
    });
  });

  it('reports a model that answered with nothing usable', async () => {
    answers('   ');
    const response = await app().request('/api/lyrics/enhance', json({ prompt: 'synthwave' }));
    expect(response.status).toBe(502);
  });

  it('refuses a request with no prompt', async () => {
    expect((await app().request('/api/lyrics/enhance', json({}))).status).toBe(400);
  });
});
