import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { runTask, stageAudio } from '../audiocpp/client.ts';
import { readAsset } from '../db/assets.ts';
import { db } from '../db/index.ts';
import {
  failInterruptedJobs,
  forgetStagedPath,
  listJobInputs,
  nextQueuedJob,
  readStagedPath,
  recordStagedPath,
  requeueJob,
  setJobState,
} from '../db/jobs.ts';
import { readSettings } from '../db/settings.ts';
import { resampleChannels } from '../../shared/resample.ts';
import { assetPath } from '../library/storage.ts';
import { readWav, writeWav } from '../library/wav.ts';
import {
  findTask,
  roleIsRequired,
  serverTaskOf,
  validateParams,
  type TaskDefinition,
} from '../tasks/registry.ts';
import { ensureLoaded } from './residency.ts';
import { storeArtifacts, storeResult, storeScores } from './results.ts';
import type { Asset, Job } from '../../shared/types.ts';

/**
 * One worker, one job at a time.
 *
 * There is nothing to gain from a second worker. audio.cpp answers a task
 * request synchronously and refuses a second one with a 503 while it is busy,
 * so concurrency here would only produce retries. The queue exists to make the
 * waiting orderly, not to overlap work.
 *
 * The loop is woken rather than polled. A job posted to the API calls wake(),
 * and the loop then drains everything it can reach before going quiet again.
 */

/** A busy backend is a state to wait out, but not forever. */
const MAX_BUSY_ATTEMPTS = 10;

/**
 * How many times a job may re-upload its source and try again.
 *
 * One. A stale cached path is fixed by uploading the file again, and if that
 * still fails the problem was never the cache. This shares the `attempts`
 * column with the busy retries above, so a job that has already been requeued
 * many times for a busy backend will not also get this. That conflation is
 * deliberate: both counters exist to stop a job looping forever, which is the
 * only thing either of them is for.
 */
const MAX_RESTAGE_ATTEMPTS = 1;
const FIRST_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 2 * 60 * 1000;

let draining = false;

/**
 * The package the last job used, which is only a hint for ordering the queue.
 *
 * What is actually loaded is read from the backend before every load. This
 * variable being stale costs one wasted preference and nothing else.
 */
let lastModelId: string | undefined;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Which reused paths the backend just told us it could not open.
 *
 * Matching is on the path itself, which Miso handed over and therefore knows
 * exactly, rather than on the wording around it. The message reads
 * `could not open WAV input: /tmp/audiocpp-ui-<run>/<name>.wav`, and that
 * wording is audio.cpp's to change while the path is ours.
 *
 * Only paths that came from the cache are ever passed in. A path this job
 * uploaded itself is not a stale cache entry, and re-uploading it would change
 * nothing.
 *
 * Exported for its own test: it is the rule that decides whether a failed job
 * gets a second chance, and the rest of this file cannot be reached without a
 * backend.
 */
export function staleStagedPaths(
  reused: { assetId: string; path: string }[],
  message: string,
): { assetId: string; path: string }[] {
  return reused.filter((entry) => message.includes(entry.path));
}

/** Doubles from five seconds and stops at two minutes. */
function backoffFor(attempts: number): number {
  return Math.min(FIRST_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
}

/**
 * What to call the take this job produces.
 *
 * A title the person typed wins, because it is the only name here that somebody
 * actually chose. Without one the first line of the prompt is the next best
 * thing to recognize a take by, and a task with no prompt falls back to its own
 * label, which still beats a bare id.
 *
 * Exported for its own test. It is the rule that decides what a finished track
 * is called in the library, and the rest of this file cannot be reached without
 * a backend to run against.
 */
/**
 * The first line of a written field that is worth putting on a take.
 *
 * Section tags are skipped. YuE2 and MiniMax both want lyrics that open with
 * `[Verse]`, and taking the first line literally named every YuE2 take
 * "[Verse]". A lyric that is nothing but tags returns undefined and the caller
 * moves on to whatever is next.
 */
function firstWrittenLine(written: string): string | undefined {
  for (const raw of written.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    // A whole line inside brackets is a marker, not words. A line that merely
    // contains brackets is kept, because that is a lyric with an aside in it.
    if (/^\[[^\]]*\]$/.test(line)) continue;
    return line;
  }

  return undefined;
}

export function labelFor(job: Job, task: TaskDefinition, sourceLabel?: string): string {
  if (job.title !== undefined && job.title.trim() !== '') return job.title.trim();

  // Whatever the person actually wrote, in the order a family calls it. Almost
  // every generator has a prompt and it wins, so adding the other two changed
  // nothing for any of them. `generate.yue2` calls its prompt a style, and
  // `generate.sing` has neither: it is given words and a voice, and the words
  // are what the take is. Without this a project fills with takes all called
  // "Sing lyrics in a voice", which is the problem the source rule below
  // solves for separation.
  for (const key of ['prompt', 'style', 'lyrics']) {
    const written = job.params[key];
    if (typeof written !== 'string' || written.trim() === '') continue;

    const line = firstWrittenLine(written);
    if (line === undefined) continue;

    return line.length > 60 ? `${line.slice(0, 57)}...` : line;
  }

  // A task with no prompt is named after what it worked from, because the task
  // label is the same words every time it runs. Separation is the first one
  // like this, and without the source every set of stems in a project is
  // called "Split into stems (vocals)" and cannot be told apart in an export.
  if (sourceLabel !== undefined && sourceLabel.trim() !== '') {
    // The suffix goes on before the length check, so a long song name loses its
    // tail rather than losing the thing that says which take this is.
    const suffix = task.labelSuffix?.(job.params);
    const named =
      suffix === undefined || suffix === '' ? sourceLabel.trim() : `${sourceLabel.trim()} (${suffix})`;
    return named.length > 60 ? `${named.slice(0, 57)}...` : named;
  }

  return task.label;
}

/**
 * The rate a source has to be converted to before this task sees it, if any.
 *
 * Undefined means upload the file as it is, which is every task but separation
 * and every source already at the right rate. Stable Audio writes at 44.1 kHz,
 * so some takes in a library are already there and skip the work.
 *
 * A take whose rate was never recorded is converted rather than trusted. The
 * conversion reads the real rate out of the file and does nothing when it
 * already matches, so the cost of being wrong here is one pass over samples,
 * where trusting a missing value costs a job that fails at the backend.
 *
 * Exported for its own test. The rest of the staging path needs a live backend.
 */
export function conversionRate(task: TaskDefinition, asset: Asset): number | undefined {
  if (task.inputSampleRate === undefined) return undefined;
  return asset.sampleRate === task.inputSampleRate ? undefined : task.inputSampleRate;
}

/**
 * Converts a source to the rate a task demands, when it is not already there.
 *
 * Returns the bytes to upload, or a sentence saying why it could not. Only
 * separation needs this: it refuses anything but 44.1 kHz before it starts any
 * work, and every take audio.cpp generates is 48 kHz.
 *
 * A non-WAV source cannot be converted here. Miso spawns no media subprocess,
 * by a decision recorded in DOCS/MEMORY.md, so an imported mp3 or flac has no
 * decoder on this side. The browser has one and imports use it for waveforms,
 * but a queued job runs with no browser anywhere near it.
 */
async function convertForTask(
  asset: Asset,
  path: string,
  rate: number | undefined,
  leadInSeconds: number,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; message: string }> {
  const audio = readWav(await readFile(path));

  if (!audio) {
    const need =
      rate === undefined
        ? 'This tool needs to put a moment of silence in front of the audio'
        : `This tool needs audio at ${rate / 1000} kHz`;
    return {
      ok: false,
      message:
        `${need} and ${asset.label} is ${asset.format}, ` +
        'which Miso cannot convert on its own. Only WAV takes can be used here for now.',
    };
  }

  const atRate =
    rate === undefined ? audio : { channels: resampleChannels(audio.channels, audio.sampleRate, rate), sampleRate: rate };

  const padded = leadInSeconds > 0 ? withLeadIn(atRate.channels, atRate.sampleRate, leadInSeconds) : atRate.channels;

  return { ok: true, bytes: Buffer.from(writeWav(padded, atRate.sampleRate)) };
}

/**
 * The same audio with silence in front of it.
 *
 * MuScriptor drops a note that starts at t=0, and a clip trimmed in the
 * workbench starts on an onset by design. The silence is taken back off the
 * note times when the result is stored, so nothing downstream sees it.
 */
function withLeadIn(channels: Float32Array[], sampleRate: number, seconds: number): Float32Array[] {
  const pad = Math.round(sampleRate * seconds);
  return channels.map((channel) => {
    const out = new Float32Array(pad + channel.length);
    out.set(channel, pad);
    return out;
  });
}

/**
 * Uploads the assets a task reads, and reuses anything already up there.
 *
 * The recorded path is keyed by backend, so pointing Miso at a different
 * audio.cpp server stages afresh instead of sending a path that server has
 * never heard of.
 */
async function stageInputs(
  job: Job,
  task: TaskDefinition,
  baseUrl: string,
): Promise<
  | {
      ok: true;
      staged: Record<string, string>;
      /**
       * Paths handed to the backend that came from the cache rather than from
       * an upload this job made. If the backend cannot open one of these, the
       * cache is stale and the job is worth trying again. A path this job
       * uploaded itself is not on this list, because re-uploading it would
       * change nothing.
       */
      reused: { assetId: string; path: string }[];
      sourceLabel: string | undefined;
      sourceSampleRate: number | undefined;
    }
  | { ok: false; message: string }
> {
  if (task.inputRoles.length === 0) {
    return {
      ok: true,
      staged: {},
      reused: [],
      sourceLabel: undefined,
      sourceSampleRate: undefined,
    };
  }

  const inputs = listJobInputs(db(), job.id);
  const staged: Record<string, string> = {};
  const reused: { assetId: string; path: string }[] = [];
  let sourceLabel: string | undefined;
  let sourceSampleRate: number | undefined;

  for (const role of task.inputRoles) {
    const input = inputs.find((entry) => entry.role === role);
    if (!input) {
      // An optional role that was left out is how a task says which of two
      // routes it wants. Nothing is staged for it, and `buildRequest` reads the
      // gap in `staged` the same way.
      if (!roleIsRequired(task, role)) continue;
      return { ok: false, message: `This job has no ${role} to work from.` };
    }

    const asset = readAsset(db(), input.assetId);
    if (!asset) return { ok: false, message: `The ${role} this job used is no longer in the library.` };

    if (role === 'source') {
      sourceLabel = asset.label;
      // What a conversion has to come back as, when the task asks for that. A
      // row with no rate recorded leaves this undefined and the result is kept
      // exactly as the model sent it, which is visible in the library rather
      // than silently wrong.
      sourceSampleRate = asset.sampleRate ?? undefined;
    }

    // A task that demands a rate the take is not already in gets a converted
    // copy, and that copy skips the cache entirely, both reading and writing.
    // The cache is keyed by asset and backend, so it cannot tell a 44.1 kHz
    // copy from the 48 kHz original, and handing a cover job the converted one
    // would be silent and wrong.
    const rate = conversionRate(task, asset);

    // Transcription needs silence in front of its source, which is the second
    // reason a task cannot be handed the take as it sits. Both reasons skip the
    // cache, because the cache is keyed by asset and backend and cannot tell a
    // modified copy from the original.
    const leadIn = role === 'source' ? (task.inputLeadInSeconds ?? 0) : 0;
    const asStored = rate === undefined && leadIn === 0;

    if (asStored) {
      const cached = readStagedPath(db(), input.assetId, baseUrl);
      if (cached) {
        staged[role] = cached;
        reused.push({ assetId: input.assetId, path: cached });
        continue;
      }
    }

    const path = assetPath(asset.projectId, asset.id, asset.format);
    let body: ReadableStream<Uint8Array> | Uint8Array;

    if (asStored) {
      body = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
    } else {
      const converted = await convertForTask(asset, path, rate, leadIn);
      if (!converted.ok) return { ok: false, message: converted.message };
      // The bytes themselves, not a stream around them. See stageAudio: a
      // buffer sent as one chunk is refused once it passes eight megabytes,
      // which a resampled take reaches at about 47 seconds.
      body = converted.bytes;
    }

    const uploaded = await stageAudio(baseUrl, body, asset.filename);
    if (!uploaded.ok) return { ok: false, message: uploaded.message };

    if (asStored) recordStagedPath(db(), input.assetId, baseUrl, uploaded.value);
    staged[role] = uploaded.value;
  }

  return { ok: true, staged, reused, sourceLabel, sourceSampleRate };
}

/**
 * Adds what to do about it to a failure that only says what happened.
 *
 * "backend buffer allocation failed" means the card ran out of room partway
 * through. The server's own wording says nothing about why or what to try.
 *
 * What to suggest depends on the task. A task that reads a take allocates on
 * top of the model, and that allocation grows with the length of the take: a
 * cover of a 20 second source passes comfortably on a 16 GB card while the same
 * request against a 3 minute source asks for another 1.4 GB and fails by about
 * 30 MB. Measured on 2026-09-15, see DOCS/ERRORS.md. Suggesting a shorter take
 * is the advice that actually works there.
 *
 * Generation gets the older advice, minus the part about a smaller package.
 * ACE-Step ships Q8 as its smallest quantisation, so on that family there is no
 * smaller package to pick and telling somebody to find one sends them looking
 * for something that does not exist.
 */
function describeRunFailure(message: string, task: TaskDefinition): string {
  if (!/allocation failed|out of memory|cudaMalloc/i.test(message)) return message;

  const advice =
    task.inputRoles.length > 0
      ? 'The card ran out of room. This tool needs memory on top of the model, and how much depends on how long the take is, so a shorter take may fit where this one did not. Unload models frees the card.'
      : 'The card ran out of room. Free it with Unload models, or ask for a shorter track.';

  return `${message} ${advice}`;
}

/**
 * Runs one job to a terminal state, or puts it back in the queue.
 *
 * Returns how long to wait before looking at the queue again. Zero means carry
 * straight on, which is every case except a backend that said it was busy.
 */
async function runOne(job: Job): Promise<number> {
  const task = findTask(job.taskId);
  if (!task) {
    setJobState(db(), job.id, 'failed', `This build of Miso has no task called ${job.taskId}.`);
    return 0;
  }

  // The row is validated again rather than trusted. It was written by this
  // service, but it was written by whichever version of it was running then,
  // and a task's fields can change between releases.
  const params = validateParams(task, job.params);
  if (!params.ok) {
    setJobState(db(), job.id, 'failed', `These parameters are no longer valid: ${params.error}`);
    return 0;
  }

  const baseUrl = readSettings().backendUrl;

  // Staging covers everything that has to be true before the model can start:
  // the source audio is on the backend, and the weights are in memory. Both can
  // take a while and both fail for reasons worth naming separately from a
  // failed generation.
  setJobState(db(), job.id, 'staging');

  const staged = await stageInputs(job, task, baseUrl);
  if (!staged.ok) {
    setJobState(db(), job.id, 'failed', staged.message);
    return 0;
  }

  // Resolved from what staging actually put there, not from the params, and
  // after staging for exactly that reason.
  const loaded = await ensureLoaded(baseUrl, task, job.modelId, serverTaskOf(task, staged.staged));
  if (!loaded.ok) {
    setJobState(db(), job.id, 'failed', loaded.message);
    return 0;
  }

  lastModelId = job.modelId;

  setJobState(db(), job.id, 'running');

  const result = await runTask(baseUrl, `miso:${job.modelId}`, task.buildRequest(params.value, staged.staged));

  if (!result.ok) {
    if (result.reason === 'busy') {
      if (job.attempts + 1 >= MAX_BUSY_ATTEMPTS) {
        setJobState(
          db(),
          job.id,
          'failed',
          'The backend stayed busy through every retry, so this job was given up on.',
        );
        return 0;
      }
      requeueJob(db(), job.id);
      return backoffFor(job.attempts);
    }

    // A path Miso reused from the cache that the backend cannot open means the
    // file behind it is gone. audio.cpp stages uploads into a directory it
    // makes per server start and has no delete route, so every restart strands
    // every path Miso remembers while the address they are keyed by stays the
    // same. Under compose, where the backend restarts on its own, this is
    // ordinary rather than rare.
    //
    const stale = staleStagedPaths(staged.reused, result.message);
    if (stale.length > 0 && job.attempts + 1 <= MAX_RESTAGE_ATTEMPTS) {
      for (const entry of stale) forgetStagedPath(db(), entry.assetId, baseUrl);
      requeueJob(db(), job.id);
      // No backoff. Nothing is busy and nothing is going to settle: the next
      // run uploads the file again, which is the whole fix.
      return 0;
    }

    setJobState(db(), job.id, 'failed', describeRunFailure(result.message, task));
    return 0;
  }

  try {
    if (task.produces === 'artifact') {
      // Transcription writes a MIDI file and note events, not a take. The
      // source is the take it read, which the artifact hangs off so deleting
      // the take takes its transcriptions with it.
      const sourceAssetId = listJobInputs(db(), job.id).find((entry) => entry.role === 'source')?.assetId;
      if (sourceAssetId === undefined) throw new Error('This job has no source to hang its result off.');

      await storeArtifacts(
        db(),
        {
          projectId: job.projectId,
          jobId: job.id,
          sourceAssetId,
          label: labelFor(job, task, staged.sourceLabel),
          leadInSeconds: task.inputLeadInSeconds,
        },
        result.value,
      );
    } else {
      const label = labelFor(job, task, staged.sourceLabel);
      const stored = await storeResult(
        db(),
        {
          projectId: job.projectId,
          jobId: job.id,
          label,
          singleKind: task.resultKind,
          sampleRate: task.matchesSourceSampleRate ? staged.sourceSampleRate : undefined,
        },
        result.value,
      );

      // A take can come back with a score beside it. YuE2 writes one when its
      // planning is on, and this is where it is kept: hung off the take it was
      // planned for, because there is no source to hang it off. Every other
      // family returns no artifacts and this does nothing. A run whose planning
      // was off is the same, which is why it is not an error to find none.
      const take = stored[0];
      if (take !== undefined) {
        await storeScores(
          db(),
          { projectId: job.projectId, jobId: job.id, assetId: take.id, label },
          result.value,
        );
      }
    }
    setJobState(db(), job.id, 'complete');
  } catch (error) {
    setJobState(
      db(),
      job.id,
      'failed',
      error instanceof Error ? error.message : 'The result could not be saved',
    );
  }

  return 0;
}

/**
 * Works through the queue until it is empty.
 *
 * Jobs are ordered to keep the same model for as long as there is work for it,
 * and the load step frees whatever else is resident first. Leaving the last
 * model loaded at the end is deliberate: the next prompt on it starts
 * immediately, and POST /api/backend/unload frees the card when it is wanted
 * back.
 */
async function drain(): Promise<void> {
  if (draining) return;
  draining = true;

  try {
    for (;;) {
      const job = nextQueuedJob(db(), lastModelId);
      if (!job) break;

      const wait = await runOne(job);
      if (wait > 0) await sleep(wait);
    }
  } catch (error) {
    // A throw here would take the loop down and leave every queued job stuck.
    // Logging and stopping means the next wake() tries again.
    console.error('[jobs] the queue stopped unexpectedly', error);
  } finally {
    draining = false;
  }
}

/** Starts the queue if it is not already working. Safe to call on every new job. */
export function wake(): void {
  void drain();
}

/**
 * Clears out jobs the previous process was in the middle of, then starts.
 *
 * Called once at startup. Anything left staging or running belongs to a process
 * that is gone, and no result is coming back for it.
 */
export function startWorker(): void {
  const interrupted = failInterruptedJobs(db());
  if (interrupted > 0) {
    console.log(`[jobs] failed ${interrupted} job(s) interrupted by a restart`);
  }
  wake();
}
