import { describe, expect, it } from 'vitest';
import { findTask, listTasks, packageRunsTask, validateParams } from './registry.ts';

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

describe('the advanced flag', () => {
  it('keeps the prompt and the length on the form, and the sampler behind the drawer', () => {
    const advanced = new Set(
      text2music.fields.filter((field) => field.advanced).map((field) => field.name),
    );

    expect(advanced).toEqual(new Set(['negativePrompt', 'steps', 'guidanceScale', 'seed']));
  });
});
