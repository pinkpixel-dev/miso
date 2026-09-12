import { resolve } from 'node:path';

/**
 * One data directory per test worker.
 *
 * Route tests open the real database through db() and write real files, and
 * several of them clear the projects table between cases. Sharing one directory
 * across workers means one file's cleanup wipes another file's fixtures partway
 * through. Vitest runs a single test file at a time inside a worker, so keying
 * the directory on the worker id is enough to keep them apart.
 *
 * This runs before any test module is imported, which is what lets it reach
 * config.ts before that module reads the variable.
 */
const worker = process.env.VITEST_WORKER_ID ?? '1';
process.env.MISO_DATA_DIR = resolve('.tmp/vitest', `worker-${worker}`);
