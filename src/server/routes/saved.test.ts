import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ApiError, SavedPrompt } from '../../shared/types.ts';
import { db } from '../db/index.ts';
import { savedRoutes } from './saved.ts';

function app(): Hono {
  const instance = new Hono();
  instance.route('/api', savedRoutes);
  return instance;
}

function json(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

beforeEach(() => {
  db().prepare('DELETE FROM saved_prompts').run();
});

const prompt = { kind: 'prompt', name: 'Warm synthwave', body: 'synthwave, dreamy, warm tape' };

describe('saved prompts', () => {
  it('keeps a prompt under a name', async () => {
    const response = await app().request('/api/saved', json(prompt));
    expect(response.status).toBe(201);

    const saved = (await response.json()) as SavedPrompt;
    expect(saved).toMatchObject({ kind: 'prompt', name: 'Warm synthwave' });
  });

  it('replaces what was under a name rather than making a second entry', async () => {
    const first = (await (await app().request('/api/saved', json(prompt))).json()) as SavedPrompt;
    const second = (await (
      await app().request('/api/saved', json({ ...prompt, body: 'synthwave, darker' }))
    ).json()) as SavedPrompt;

    expect(second.id).toBe(first.id);
    expect(second.body).toBe('synthwave, darker');

    const all = (await (await app().request('/api/saved')).json()) as SavedPrompt[];
    expect(all).toHaveLength(1);
  });

  it('treats a prompt and a lyric sheet with the same name as two things', async () => {
    await app().request('/api/saved', json(prompt));
    await app().request('/api/saved', json({ ...prompt, kind: 'lyrics', body: '[Verse]\nline' }));

    const all = (await (await app().request('/api/saved')).json()) as SavedPrompt[];
    expect(all).toHaveLength(2);
  });

  it('lists one kind at a time when asked', async () => {
    await app().request('/api/saved', json(prompt));
    await app().request('/api/saved', json({ kind: 'lyrics', name: 'Chorus idea', body: '[Chorus]' }));

    const lyrics = (await (await app().request('/api/saved?kind=lyrics')).json()) as SavedPrompt[];
    expect(lyrics.map((entry) => entry.name)).toEqual(['Chorus idea']);
  });

  it('refuses a save with no name and one with nothing in it', async () => {
    expect((await app().request('/api/saved', json({ ...prompt, name: '  ' }))).status).toBe(400);
    expect((await app().request('/api/saved', json({ ...prompt, body: '' }))).status).toBe(400);
  });

  it('refuses a kind it does not have', async () => {
    const response = await app().request('/api/saved', json({ ...prompt, kind: 'song' }));
    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiError).error).toMatch(/prompt or lyrics/);
  });

  it('deletes one and answers with what is left', async () => {
    const saved = (await (await app().request('/api/saved', json(prompt))).json()) as SavedPrompt;
    const response = await app().request(`/api/saved/${saved.id}`, { method: 'DELETE' });

    expect(response.status).toBe(200);
    expect((await response.json()) as SavedPrompt[]).toHaveLength(0);
  });

  it('says so when there is nothing to delete', async () => {
    expect((await app().request('/api/saved/nope', { method: 'DELETE' })).status).toBe(404);
  });
});
