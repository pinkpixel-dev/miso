import type { Settings } from '../../shared/types.ts';
import { defaultBackendUrl } from '../config.ts';
import { db } from './index.ts';

const DEFAULTS: Settings = {
  backendUrl: defaultBackendUrl,
};

/** Strips a trailing slash so callers can always append a path safely. */
function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function readSettings(): Settings {
  const rows = db().prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];

  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const backendUrl = stored.get('backendUrl');

  return {
    backendUrl: backendUrl ? normalizeUrl(backendUrl) : DEFAULTS.backendUrl,
  };
}

/**
 * Writes the given keys and returns the full settings afterwards.
 *
 * Throws on a backend URL that is not a valid absolute http or https URL, so a
 * typo fails here rather than as a confusing fetch error later.
 */
export function writeSettings(patch: Partial<Settings>): Settings {
  const statement = db().prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  if (patch.backendUrl !== undefined) {
    const url = normalizeUrl(patch.backendUrl);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Not a valid URL: ${patch.backendUrl}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Backend URL must be http or https, got ${parsed.protocol}`);
    }
    statement.run('backendUrl', url);
  }

  return readSettings();
}
