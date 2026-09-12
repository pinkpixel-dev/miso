import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './index.ts';
import { readLyricsKey, readSettings, writeSettings } from './settings.ts';

beforeEach(() => {
  db().prepare('DELETE FROM settings').run();
});

describe('readSettings', () => {
  it('answers with defaults before anything has been saved', () => {
    const settings = readSettings();

    expect(settings.lyricsEngine).toBe('external');
    expect(settings.lyricsExternalUrl).toBe('https://api.openai.com/v1');
    expect(settings.lyricsExternalKeySet).toBe(false);
  });

  it('never returns the API key, only whether one is stored', () => {
    writeSettings({ lyricsExternalKey: 'sk-secret' });
    const settings = readSettings();

    expect(settings.lyricsExternalKeySet).toBe(true);
    expect(JSON.stringify(settings)).not.toContain('sk-secret');
  });

  it('hands the key to the one caller that needs it', () => {
    writeSettings({ lyricsExternalKey: 'sk-secret' });
    expect(readLyricsKey()).toBe('sk-secret');
  });
});

describe('writeSettings', () => {
  it('strips a trailing slash from every URL', () => {
    const settings = writeSettings({
      backendUrl: 'http://127.0.0.1:8080/',
      lyricsExternalUrl: 'https://openrouter.ai/api/v1//',
    });

    expect(settings.backendUrl).toBe('http://127.0.0.1:8080');
    expect(settings.lyricsExternalUrl).toBe('https://openrouter.ai/api/v1');
  });

  it('refuses a URL that is not http or https', () => {
    expect(() => writeSettings({ lyricsLocalUrl: 'ftp://127.0.0.1' })).toThrow(/http or https/);
    expect(() => writeSettings({ backendUrl: 'not a url' })).toThrow(/not a valid URL/);
  });

  it('clears the key on an empty string, which is the only way to remove one', () => {
    writeSettings({ lyricsExternalKey: 'sk-secret' });
    expect(writeSettings({ lyricsExternalKey: '' }).lyricsExternalKeySet).toBe(false);
    expect(readLyricsKey()).toBe('');
  });

  it('leaves the key alone when a patch does not mention it', () => {
    writeSettings({ lyricsExternalKey: 'sk-secret' });
    expect(writeSettings({ lyricsExternalModel: 'gpt-5-nano' }).lyricsExternalKeySet).toBe(true);
  });

  it('keeps both engines configured across a switch', () => {
    writeSettings({
      lyricsExternalModel: 'gpt-5-nano',
      lyricsLocalUrl: 'http://127.0.0.1:9000/v1',
      lyricsEngine: 'local',
    });

    const back = writeSettings({ lyricsEngine: 'external' });
    expect(back.lyricsExternalModel).toBe('gpt-5-nano');
    expect(back.lyricsLocalUrl).toBe('http://127.0.0.1:9000/v1');
  });
});
