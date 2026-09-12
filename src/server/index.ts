import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { clientDistDir, host, isProduction, port, projectRoot } from './config.ts';
import { db } from './db/index.ts';
import { backfillWavPeaks } from './library/backfillPeaks.ts';
import { sweepTempFiles } from './library/storage.ts';
import { startWorker } from './jobs/worker.ts';
import { api } from './routes/api.ts';

const app = new Hono();

app.route('/api', api);

app.onError((error, c) => {
  console.error('[miso]', error);
  return c.json({ error: 'Internal error', detail: error.message }, 500);
});

// In production the service is the whole app: it serves the built client and
// falls back to index.html so client side routes survive a refresh. In
// development Vite serves the client and proxies /api back here instead.
if (isProduction) {
  if (!existsSync(clientDistDir)) {
    console.error(`[miso] no client build at ${clientDistDir}. Run: npm run build`);
    process.exit(1);
  }
  const root = relative(projectRoot, clientDistDir);
  app.use('/*', serveStatic({ root }));
  app.get('/*', serveStatic({ path: `${root}/index.html` }));
}

db();

// Any .tmp- file is an upload whose process is gone, so it can never finish.
void sweepTempFiles().then((removed) => {
  if (removed > 0) console.log(`[miso] swept ${removed} abandoned upload(s)`);
});

// Takes saved before the service could read a waveform have none stored, which
// makes every view of them download the whole file to draw one. New takes
// arrive with theirs, so this finds nothing after the first run.
void backfillWavPeaks(db()).then((filled) => {
  if (filled > 0) console.log(`[miso] read the waveform of ${filled} earlier take(s)`);
});

// Jobs that were mid-flight belong to the process that died with them. The
// worker clears those out and then picks up anything still queued.
startWorker();

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  const where = `http://${host}:${info.port}`;
  console.log(
    isProduction ? `[miso] ready at ${where}` : `[miso] api at ${where}, client at http://${host}:5170`,
  );
});
