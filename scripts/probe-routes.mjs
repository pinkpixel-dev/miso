#!/usr/bin/env node
/**
 * Finds out what an audio.cpp route actually does, rather than what it is
 * documented to do.
 *
 * Every finding in src/server/audiocpp/fixtures/README.md was produced with
 * this, and every one of them expires when the audio.cpp image changes. Re-run
 * the probes there against a new image before trusting the numbers again.
 *
 * Why this exists rather than curl: /v1/tasks/run fills in a default for every
 * field it does not recognise, so a misspelled option returns a perfectly good
 * track that ignored you. Status codes prove nothing. The only reliable test
 * compares the audio itself, which means decoding it, and doing that by hand
 * every time is how a wrong field name survives a whole phase.
 *
 * The one thing it cannot do is tell you whether a route followed you. A field
 * can change every byte and still sound identical, which is true of
 * `track_name` on lego and of the prompt on repaint. Measure to rule things
 * out, then listen.
 *
 * Needs ffmpeg and ffprobe on PATH. No npm dependencies.
 *
 *   node scripts/probe-routes.mjs stage samples/phase0-original.wav
 *   node scripts/probe-routes.mjs run cover-a \
 *     --model miso:ace_step_turbo_q8_0 \
 *     --set task_route=cover --set text="bright piano" --set seed=12345 \
 *     --audio /tmp/audiocpp-ui-123/1-phase0-original.wav
 *   node scripts/probe-routes.mjs compare out/cover-a.wav out/cover-b.wav \
 *     --source samples/phase0-original.wav
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, join } from 'node:path';

const BASE = process.env.AUDIOCPP_URL ?? 'http://localhost:8080';
const OUT_DIR = process.env.PROBE_OUT ?? 'probe-out';
const RATE = 48000;

// ------------------------------------------------------------------ measuring

/** Decodes anything ffmpeg reads into mono PCM at one rate, so two takes line up. */
function decode(bytes) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-v', 'error', '-i', 'pipe:0',
      '-f', 's16le', '-ac', '1', '-ar', String(RATE), 'pipe:1',
    ]);
    const out = [];
    const err = [];
    ff.stdout.on('data', (d) => out.push(d));
    ff.stderr.on('data', (d) => err.push(d));
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg failed: ${Buffer.concat(err)}`));
      const buf = Buffer.concat(out);
      resolve(new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2)));
    });
    ff.stdin.on('error', () => {});
    ff.stdin.end(bytes);
  });
}

/**
 * Zero crossings per second, a crude brightness measure.
 *
 * Crude is the point: a piano and a distorted guitar land far apart on it, so
 * two prompts that should sound nothing alike can be compared with one number.
 * Always read it next to a known-good contrast rather than on its own. On this
 * package text2music separates those two prompts by about 1098 and repaint by
 * about 10, which is the difference between a route that reads a prompt and one
 * that does not.
 */
function zcr(samples) {
  if (samples.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < samples.length; i += 1) {
    if ((samples[i - 1] < 0) !== (samples[i] < 0)) crossings += 1;
  }
  return Number((crossings / (samples.length / RATE)).toFixed(1));
}

/** Mean absolute difference per second, which locates a change in time. */
function perSecond(a, b) {
  const seconds = Math.floor(Math.max(a.length, b.length) / RATE);
  const rows = [];
  for (let s = 0; s < seconds; s += 1) {
    let sum = 0;
    for (let i = s * RATE; i < (s + 1) * RATE; i += 1) sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    rows.push(Number((sum / RATE).toFixed(1)));
  }
  return rows;
}

/** A take's own level per second. Compare a difference against this, not against zero. */
function level(samples) {
  const seconds = Math.floor(samples.length / RATE);
  const rows = [];
  for (let s = 0; s < seconds; s += 1) {
    let sum = 0;
    for (let i = s * RATE; i < (s + 1) * RATE; i += 1) sum += Math.abs(samples[i]);
    rows.push(Number((sum / RATE).toFixed(1)));
  }
  return rows;
}

function duration(path) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', path,
    ]);
    let out = '';
    ff.stdout.on('data', (d) => { out += d; });
    ff.on('close', (c) => (c === 0 ? resolve(Number(out.trim())) : reject(new Error('ffprobe failed'))));
  });
}

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

// ----------------------------------------------------------------- the server

/**
 * Uploads a file and returns the path the server wants back.
 *
 * Stage once and reuse the path for every probe in a session. Re-staging the
 * same file gives a new path each time, which is harmless but wastes time, and
 * there is no route to delete what you staged.
 */
async function stage(path) {
  const res = await fetch(`${BASE}/v1/ui/upload`, {
    method: 'POST',
    body: await readFile(path),
    headers: {
      'content-type': 'application/octet-stream',
      'x-audiocpp-filename': encodeURIComponent(basename(path)),
    },
  });
  const payload = await res.json();
  if (!payload?.path) throw new Error(`upload returned no path: ${JSON.stringify(payload)}`);
  return payload.path;
}

async function runTask(model, request) {
  const started = Date.now();
  const res = await fetch(`${BASE}/v1/tasks/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ model, request }),
    signal: AbortSignal.timeout(900_000),
  });

  const elapsed = (Date.now() - started) / 1000;
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);

  const body = await res.json();
  const audio = body.audio ?? body.named_audio_outputs?.[0]?.audio;
  if (!audio) throw new Error(`finished with no audio, keys: ${Object.keys(body).join(', ')}`);

  return {
    bytes: Buffer.from(audio, 'base64'),
    sampleRate: body.sample_rate,
    channels: body.channels,
    names: (body.named_audio_outputs ?? []).map((o) => o.id),
    elapsed,
  };
}

// -------------------------------------------------------------------- the CLI

/** Reads --set key=value pairs. Numbers become numbers, JSON values with --set-json. */
function parseArgs(argv) {
  const opts = { set: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--set' || arg === '--set-json') {
      const raw = argv[i + 1] ?? '';
      const eq = raw.indexOf('=');
      if (eq < 0) throw new Error(`${arg} wants key=value, got ${raw}`);
      const key = raw.slice(0, eq);
      const value = raw.slice(eq + 1);
      opts.set[key] = arg === '--set-json'
        ? JSON.parse(value)
        : (value !== '' && !Number.isNaN(Number(value)) ? Number(value) : value);
      i += 1;
    } else if (arg.startsWith('--')) {
      opts[arg.slice(2)] = argv[i + 1]?.startsWith('--') === false ? argv[++i] : true;
    }
  }
  return opts;
}

async function cmdStage([path]) {
  if (!path) throw new Error('stage wants a file path');
  console.log(await stage(path));
}

async function cmdRun([label, ...rest]) {
  if (!label) throw new Error('run wants a label, then --model and --set pairs');
  const opts = parseArgs(rest);
  if (!opts.model) throw new Error('run wants --model, for example --model miso:ace_step_turbo_q8_0');

  const request = { ...opts.set };
  // --audio takes either an already staged container path or a local file to
  // stage now. A local path would be meaningless to the server on its own.
  if (typeof opts.audio === 'string') {
    request.audio = opts.audio.startsWith('/tmp/audiocpp-') ? opts.audio : await stage(opts.audio);
  }

  const result = await runTask(opts.model, request);
  await mkdir(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, `${label}.wav`);
  await writeFile(path, result.bytes);

  const samples = await decode(result.bytes);
  console.log(JSON.stringify({
    label,
    path,
    seconds: Number((await duration(path)).toFixed(2)),
    sampleRate: result.sampleRate,
    channels: result.channels,
    zcr: zcr(samples),
    sha: sha(result.bytes),
    elapsed: Number(result.elapsed.toFixed(1)),
    ...(result.names.length ? { namedOutputs: result.names } : {}),
  }, null, 2));
}

async function cmdCompare([a, b, ...rest]) {
  if (!a || !b) throw new Error('compare wants two wav paths');
  const opts = parseArgs(rest);

  const [rawA, rawB] = await Promise.all([readFile(a), readFile(b)]);
  const [sampA, sampB] = await Promise.all([decode(rawA), decode(rawB)]);

  console.log(`identical: ${sha(rawA) === sha(rawB)}`);
  console.log(`zcr: ${zcr(sampA)} vs ${zcr(sampB)}, gap ${Math.abs(zcr(sampA) - zcr(sampB)).toFixed(1)}`);
  console.log(`per-second difference: ${JSON.stringify(perSecond(sampA, sampB).slice(0, 30))}`);

  // Against the source is where the real answer usually is. A difference that
  // tracks the source's own level means the output kept nothing of it, and the
  // giveaway is silence: a route that reads the source goes quiet where it does.
  if (typeof opts.source === 'string') {
    const src = await decode(await readFile(opts.source));
    console.log(`\nsource level:      ${JSON.stringify(level(src).slice(0, 30))}`);
    console.log(`${basename(a)} vs source: ${JSON.stringify(perSecond(src, sampA).slice(0, 30))}`);
    console.log(`${basename(b)} vs source: ${JSON.stringify(perSecond(src, sampB).slice(0, 30))}`);
  }
}

const commands = { stage: cmdStage, run: cmdRun, compare: cmdCompare };
const [command, ...rest] = process.argv.slice(2);

if (!commands[command]) {
  console.error(`usage: probe-routes.mjs <${Object.keys(commands).join('|')}> ...`);
  console.error('see the comment at the top of this file for examples');
  process.exit(1);
}

try {
  await commands[command](rest);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
