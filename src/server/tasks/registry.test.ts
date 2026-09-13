import { describe, expect, it } from 'vitest';
import { findPackage } from '../catalog/registry.ts';
import {
  findTask,
  listTasks,
  packageRunsTask,
  taskPackageIds,
  validateParams,
} from './registry.ts';

/** A vendored package, or a failure naming the one that went missing. */
function packageOf(id: string) {
  const found = findPackage(id);
  if (!found) throw new Error(`${id} is missing from the vendored specs`);
  return found.pkg;
}

/** A task, or a failure naming the one that went missing. */
function taskOf(id: string) {
  const found = findTask(id);
  if (!found) throw new Error(`${id} is missing from the registry`);
  return found;
}

const text2music = findTask('generate.text2music');
if (!text2music) throw new Error('generate.text2music is missing from the registry');

describe('the registry', () => {
  it('offers generate.text2music on the ACE-Step family', () => {
    expect(listTasks().map((task) => task.id)).toContain('generate.text2music');
    expect(text2music.family).toBe('ace_step');
  });

  it('uses the runtime task kind, not the spec task word', () => {
    // Sending "music" here is rejected by the server. See DOCS/ERRORS.md.
    expect(text2music.serverTask).toBe('gen');
  });

  it('accepts a package from its own family and refuses another', () => {
    expect(packageRunsTask(text2music, 'ace_step_turbo_q8_0')).toBe(true);
    expect(packageRunsTask(text2music, 'htdemucs_q8_0')).toBe(false);
    expect(packageRunsTask(text2music, 'nothing_like_this')).toBe(false);
  });

  it('offers every generation family on its own task', () => {
    const families = listTasks().map((task) => task.family);

    expect(families).toEqual(
      expect.arrayContaining(['ace_step', 'minimax_music3', 'heartmula', 'stable_audio']),
    );
  });

  it('knows which families can sing', () => {
    // Declared here rather than read from the vendored spec, which claims
    // Stable Audio does lyrics and is wrong. See DOCS/MEMORY.md.
    expect(findTask('generate.stableaudio')?.vocals).toBe('never');
    expect(findTask('generate.text2music')?.vocals).toBe('both');
  });

  it('keeps Stable Audio SFX packages off the music task', () => {
    const stableAudio = findTask('generate.stableaudio');
    if (!stableAudio) throw new Error('generate.stableaudio is missing from the registry');

    expect(packageRunsTask(stableAudio, 'stable_audio_3_small_music_q8_0')).toBe(true);
    expect(packageRunsTask(stableAudio, 'stable_audio_3_medium_q8_0')).toBe(true);
    expect(packageRunsTask(stableAudio, 'stable_audio_3_small_sfx_q8_0')).toBe(false);

    const offered = taskPackageIds(stableAudio);
    expect(offered).toContain('stable_audio_3_small_music_q8_0');
    expect(offered.some((id) => id.includes('_sfx_'))).toBe(false);
  });

  it('offers every package of a family that has only precisions', () => {
    expect(taskPackageIds(text2music)).toContain('ace_step_turbo_q8_0');
    expect(taskPackageIds(text2music).length).toBeGreaterThan(1);
  });
});

describe('session options', () => {
  /**
   * The regression these cover is a real HTTP 500. MiniMax Music 3 loads its
   * language model, depth decoder and flow transformer as separate files, and
   * the backend's defaults name one fixed set (language_model_q4_0,
   * rvq_depth_decoder_bf16, transformer_q4_0) that no package ships in full.
   * Sending nothing meant the loader opened a file that was not on disk.
   */
  it('names the component GGUFs a MiniMax package actually ships', () => {
    const minimax = taskOf('generate.minimax');

    expect(minimax.sessionOptions?.(packageOf('minimax_music3_q8_0'))).toEqual({
      'minimax_music3.language_model_gguf': 'language_model_q8_0.gguf',
      'minimax_music3.rvq_depth_decoder_gguf': 'rvq_depth_decoder_q8_0.gguf',
      'minimax_music3.flow_transformer_gguf': 'transformer_q8_0.gguf',
    });
  });

  it('follows the package rather than assuming one precision throughout', () => {
    const minimax = taskOf('generate.minimax');

    // The q4_0 package ships a q8_0 depth decoder beside its q4_0 language
    // model, which is exactly the mismatch the backend default gets wrong.
    expect(minimax.sessionOptions?.(packageOf('minimax_music3_q4_0'))).toMatchObject({
      'minimax_music3.language_model_gguf': 'language_model_q4_0.gguf',
      'minimax_music3.rvq_depth_decoder_gguf': 'rvq_depth_decoder_q8_0.gguf',
      'minimax_music3.flow_transformer_gguf': 'transformer_q4_0.gguf',
    });

    expect(minimax.sessionOptions?.(packageOf('minimax_music3_bf16'))).toMatchObject({
      'minimax_music3.language_model_gguf': 'language_model_bf16.gguf',
      'minimax_music3.flow_transformer_gguf': 'transformer_bf16.gguf',
    });
  });

  it('keeps mem_saver on for ACE-Step, which a 16 GB card needs', () => {
    // Not an option. A second request after a generation failed to allocate
    // until mem_saver brought the resident figure down. See DOCS/ERRORS.md.
    expect(text2music.sessionOptions?.(packageOf('ace_step_turbo_q8_0'))).toEqual({
      'ace_step.mem_saver': 'true',
    });
  });

  it('sends none at all for a family that needs none', () => {
    expect(taskOf('generate.heartmula').sessionOptions).toBeUndefined();
    expect(taskOf('generate.stableaudio').sessionOptions).toBeUndefined();
  });
});

describe('validateParams', () => {
  it('fills in defaults for everything left out', () => {
    const result = validateParams(text2music, { prompt: 'synth pop' });
    expect(result.ok && result.value).toMatchObject({
      prompt: 'synth pop',
      durationSeconds: 180,
      steps: 8,
      guidanceScale: 1,
    });
  });

  it('refuses a missing prompt', () => {
    expect(validateParams(text2music, {})).toMatchObject({ ok: false });
    expect(validateParams(text2music, { prompt: '' })).toMatchObject({ ok: false });
  });

  it('holds numbers to their range', () => {
    expect(validateParams(text2music, { prompt: 'x', durationSeconds: 4 })).toMatchObject({ ok: false });
    expect(validateParams(text2music, { prompt: 'x', durationSeconds: 301 })).toMatchObject({ ok: false });
    expect(validateParams(text2music, { prompt: 'x', durationSeconds: 300 })).toMatchObject({ ok: true });
  });

  it('reads a number that arrived as a string', () => {
    const result = validateParams(text2music, { prompt: 'x', steps: '12' });
    expect(result.ok && result.value.steps).toBe(12);
  });

  it('refuses a number that is not one', () => {
    expect(validateParams(text2music, { prompt: 'x', steps: 'loads' })).toMatchObject({ ok: false });
  });

  it('drops a field this build does not know rather than refusing', () => {
    const result = validateParams(text2music, { prompt: 'x', fromALaterVersion: 'hello' });
    expect(result.ok && 'fromALaterVersion' in result.value).toBe(false);
  });
});

describe('buildRequest', () => {
  it('sends the route and the prompt under the names the CLI uses', () => {
    const params = validateParams(text2music, { prompt: 'synth pop', lyrics: 'we rise' });
    const request = text2music.buildRequest(params.ok ? params.value : {}, {});

    expect(request).toMatchObject({
      task_route: 'text2music',
      text: 'synth pop',
      lyrics: 'we rise',
      duration_seconds: 180,
      num_inference_steps: 8,
      guidance_scale: 1,
    });
  });

  it('leaves out what was not set rather than sending an empty value', () => {
    const params = validateParams(text2music, { prompt: 'synth pop' });
    const request = text2music.buildRequest(params.ok ? params.value : {}, {});

    expect('lyrics' in request).toBe(false);
    expect('seed' in request).toBe(false);
  });

  it('sends the tempo, the key, and the negative prompt under their request-option names', () => {
    const params = validateParams(text2music, {
      prompt: 'synth pop',
      bpm: 128,
      keyscale: 'A minor',
      negativePrompt: 'crowd noise',
    });
    const request = text2music.buildRequest(params.ok ? params.value : {}, {});

    expect(request).toMatchObject({ bpm: 128, keyscale: 'A minor', negative_prompt: 'crowd noise' });
  });

  it('leaves the tempo and the key out when they are set to auto', () => {
    // Empty means the planner chooses, which is not the same instruction as
    // being told to use nothing.
    const params = validateParams(text2music, { prompt: 'synth pop', keyscale: '' });
    const request = text2music.buildRequest(params.ok ? params.value : {}, {});

    expect('bpm' in request).toBe(false);
    expect('keyscale' in request).toBe(false);
    expect('negative_prompt' in request).toBe(false);
  });

  it('holds the tempo to a range a song could actually be', () => {
    expect(validateParams(text2music, { prompt: 'x', bpm: 39 })).toMatchObject({ ok: false });
    expect(validateParams(text2music, { prompt: 'x', bpm: 221 })).toMatchObject({ ok: false });
    expect(validateParams(text2music, { prompt: 'x', bpm: 128 })).toMatchObject({ ok: true });
  });
});

describe('the duration field', () => {
  /**
   * `duration_sec` is the spelling the CLI's `--request-option` takes. The HTTP
   * request object does not read it, so MiniMax ignored the length asked for
   * and stayed on its own 20 second default. Every family takes
   * `duration_seconds` over HTTP, confirmed live at 45 asked and 44.93
   * delivered. See DOCS/ERRORS.md.
   */
  it('asks for the length under the one name the server reads', () => {
    const ids = [
      'generate.text2music',
      'generate.minimax',
      'generate.heartmula',
      'generate.stableaudio',
    ];

    for (const id of ids) {
      const task = taskOf(id);
      const params = validateParams(task, {
        prompt: 'synth pop',
        tags: 'pop, bright',
        lyrics: 'we rise',
        durationSeconds: 45,
      });
      const request = task.buildRequest(params.ok ? params.value : {}, {});

      expect(request, `${id} sends duration_seconds`).toMatchObject({ duration_seconds: 45 });
      expect(`duration_sec` in request, `${id} does not send duration_sec`).toBe(false);
    }
  });
});

describe('the advanced flag', () => {
  it('keeps the prompt and the length on the form, and the sampler behind the drawer', () => {
    const advanced = new Set(
      text2music.fields.filter((field) => field.advanced).map((field) => field.name),
    );

    expect(advanced).toEqual(new Set(['negativePrompt', 'steps', 'guidanceScale', 'seed']));
  });
});

describe('remix.repaint', () => {
  const repaint = taskOf('remix.repaint');

  /** Valid params, so each test can change one thing and say what it broke. */
  function params(overrides: Record<string, unknown> = {}) {
    return validateParams(repaint, {
      prompt: 'a brighter chorus',
      regionStart: 5,
      regionEnd: 10,
      ...overrides,
    });
  }

  it('reads a source track, which no generation task does', () => {
    expect(repaint.inputRoles).toEqual(['source']);
    expect(taskOf('generate.text2music').inputRoles).toEqual([]);
  });

  it('runs on ACE-Step packages and refuses another family', () => {
    expect(packageRunsTask(repaint, 'ace_step_turbo_q8_0')).toBe(true);
    expect(packageRunsTask(repaint, 'minimax_music3_q8_0')).toBe(false);
  });

  /**
   * These four names were measured against a live container, not read off the
   * CLI manual. The route defaults anything it does not recognise, so a wrong
   * name returns a good track that ignored the request. Changing any of them
   * without re-running that check is how this silently stops repainting.
   */
  it('sends the request shape confirmed against the server', () => {
    const staged = { source: '/tmp/audiocpp-ui-1/1-take.wav' };
    const result = params();
    const request = repaint.buildRequest(result.ok ? result.value : {}, staged);

    expect(request).toMatchObject({
      task_route: 'repaint',
      text: 'a brighter chorus',
      audio: '/tmp/audiocpp-ui-1/1-take.wav',
      repaint_start: 5,
      repaint_end: 10,
      repaint_strength: 0.5,
    });
  });

  it('asks for no duration, because repaint locks it to the source', () => {
    const result = params();
    const request = repaint.buildRequest(result.ok ? result.value : {}, { source: '/tmp/a.wav' });

    expect('duration_seconds' in request).toBe(false);
    expect(repaint.fields.some((field) => field.name === 'durationSeconds')).toBe(false);
  });

  it('leaves out the lyrics and the seed when they were not set', () => {
    const result = params();
    const request = repaint.buildRequest(result.ok ? result.value : {}, { source: '/tmp/a.wav' });

    expect('lyrics' in request).toBe(false);
    expect('seed' in request).toBe(false);
  });

  it('keeps strength on the form rather than behind the advanced drawer', () => {
    // It decides whether the section is nudged or replaced, which is the
    // second question everybody asks.
    expect(repaint.fields.find((field) => field.name === 'strength')?.advanced).toBeUndefined();
  });

  it('needs both ends of the region', () => {
    expect(validateParams(repaint, { prompt: 'x', regionStart: 5 })).toMatchObject({ ok: false });
    expect(validateParams(repaint, { prompt: 'x', regionEnd: 10 })).toMatchObject({ ok: false });
  });

  it('refuses a region that ends before it starts', () => {
    const result = params({ regionStart: 10, regionEnd: 5 });
    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.error).toMatch(/end after it starts/i);
  });

  it('refuses a region of no length', () => {
    expect(params({ regionStart: 7, regionEnd: 7 })).toMatchObject({ ok: false });
  });

  it('accepts a region the right way round', () => {
    expect(params({ regionStart: 0, regionEnd: 0.5 })).toMatchObject({ ok: true });
  });
});

describe('cross-field validation', () => {
  it('is left alone by every task that does not need it', () => {
    for (const id of ['generate.text2music', 'generate.minimax', 'generate.stableaudio']) {
      expect(taskOf(id).validate).toBeUndefined();
    }
  });

  it('runs only after the per-field pass, so it never sees a bad value', () => {
    // regionStart is below its minimum, so the field message wins and the
    // cross-field check is never reached with a number it cannot trust.
    const result = validateParams(taskOf('remix.repaint'), {
      prompt: 'x',
      regionStart: -5,
      regionEnd: -10,
    });

    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.error).toMatch(/cannot be below/i);
  });
});
