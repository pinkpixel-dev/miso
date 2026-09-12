import type { LyricsEngine, Settings, SettingsPatch } from '../../shared/types.ts';
import { defaultBackendUrl } from '../config.ts';
import { db } from './index.ts';

/**
 * Settings are key and value rows rather than a table of columns, so a new
 * setting is a new key and never a migration.
 *
 * One value never leaves this file: the API key for the external lyrics
 * engine. `readSettings` reports whether a key is stored and nothing more, and
 * only `readLyricsKey` returns the key itself, to the one caller that has to
 * put it in an Authorization header.
 */

const DEFAULTS: Settings = {
  backendUrl: defaultBackendUrl,
  lyricsEngine: 'external',
  lyricsExternalUrl: 'https://api.openai.com/v1',
  lyricsExternalModel: '',
  lyricsExternalKeySet: false,
  // llama.cpp's server is OpenAI-compatible under /v1 and ignores the model
  // name, serving whatever weights it was started with.
  lyricsLocalUrl: 'http://127.0.0.1:8081/v1',
  lyricsLocalModel: 'local-model',
};

const KEY_SETTING = 'lyricsExternalKey';

/** Strips a trailing slash so callers can always append a path safely. */
function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function stored(): Map<string, string> {
  const rows = db().prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  return new Map(rows.map((r) => [r.key, r.value]));
}

export function readSettings(): Settings {
  const values = stored();
  const text = (key: keyof Settings, fallback: string): string => {
    const value = values.get(key);
    return value === undefined || value === '' ? fallback : value;
  };

  const engine = values.get('lyricsEngine');

  return {
    backendUrl: normalizeUrl(text('backendUrl', DEFAULTS.backendUrl)),
    lyricsEngine: engine === 'local' ? 'local' : 'external',
    lyricsExternalUrl: normalizeUrl(text('lyricsExternalUrl', DEFAULTS.lyricsExternalUrl)),
    lyricsExternalModel: text('lyricsExternalModel', DEFAULTS.lyricsExternalModel),
    lyricsExternalKeySet: (values.get(KEY_SETTING) ?? '') !== '',
    lyricsLocalUrl: normalizeUrl(text('lyricsLocalUrl', DEFAULTS.lyricsLocalUrl)),
    lyricsLocalModel: text('lyricsLocalModel', DEFAULTS.lyricsLocalModel),
  };
}

/** The stored key, for the one caller that builds an Authorization header. */
export function readLyricsKey(): string {
  return stored().get(KEY_SETTING) ?? '';
}

/** An http or https URL, or a message saying why it is not one. */
function checkUrl(label: string, raw: string): string {
  const url = normalizeUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label} is not a valid URL: ${raw}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} must be http or https, got ${parsed.protocol}`);
  }
  return url;
}

/**
 * Writes the given keys and returns the full settings afterwards.
 *
 * Throws on a URL that is not a valid absolute http or https address, so a typo
 * fails here rather than as a confusing fetch error later.
 */
export function writeSettings(patch: SettingsPatch): Settings {
  const statement = db().prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  if (patch.backendUrl !== undefined) {
    statement.run('backendUrl', checkUrl('The backend URL', patch.backendUrl));
  }

  if (patch.lyricsEngine !== undefined) {
    const engine: LyricsEngine = patch.lyricsEngine === 'local' ? 'local' : 'external';
    statement.run('lyricsEngine', engine);
  }

  if (patch.lyricsExternalUrl !== undefined) {
    statement.run('lyricsExternalUrl', checkUrl('The lyrics API URL', patch.lyricsExternalUrl));
  }

  if (patch.lyricsLocalUrl !== undefined) {
    statement.run('lyricsLocalUrl', checkUrl('The local server URL', patch.lyricsLocalUrl));
  }

  if (patch.lyricsExternalModel !== undefined) {
    statement.run('lyricsExternalModel', patch.lyricsExternalModel.trim());
  }

  if (patch.lyricsLocalModel !== undefined) {
    statement.run('lyricsLocalModel', patch.lyricsLocalModel.trim());
  }

  // An empty string is how a key is cleared. It is the only way to remove one,
  // which is why it is not treated as "nothing was sent".
  if (patch.lyricsExternalKey !== undefined) {
    statement.run(KEY_SETTING, patch.lyricsExternalKey.trim());
  }

  return readSettings();
}
