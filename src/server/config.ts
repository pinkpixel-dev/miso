import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** Repository root, resolved from this file rather than the current directory. */
export const projectRoot = resolve(here, '../..');

/**
 * The running version, read from `package.json` so there is one source of it.
 *
 * `createRequire` rather than a JSON import because this file is loaded by tsx
 * in production and by vitest in tests, and a require needs nothing from either
 * of them. The health route reports it, which is how someone tells which image
 * a container is actually running.
 */
export const version: string = (
  createRequire(import.meta.url)('../../package.json') as { version: string }
).version;

/**
 * Where Miso keeps everything it owns: the database and, from phase 3, audio
 * assets. Overridable so a container can mount a volume somewhere else.
 */
export const dataDir = process.env.MISO_DATA_DIR
  ? resolve(process.env.MISO_DATA_DIR)
  : resolve(projectRoot, 'data');

export const databasePath = resolve(dataDir, 'miso.sqlite');

/** Built client assets, served by the service in production. */
export const clientDistDir = resolve(projectRoot, 'dist/client');

export const port = Number(process.env.MISO_PORT ?? 5171);
export const host = process.env.MISO_HOST ?? '127.0.0.1';
export const isProduction = process.env.NODE_ENV === 'production';

/**
 * Used the first time Miso starts, before the user has visited settings. The
 * port matches the audio.cpp server's own default.
 */
export const defaultBackendUrl = process.env.MISO_BACKEND_URL ?? 'http://127.0.0.1:8080';
