import { describe, expect, it } from 'vitest';
import { findTask, validateParams } from './registry.ts';

const vevo = findTask('voice.vevo2');
if (!vevo) throw new Error('voice.vevo2 is missing from the registry');

/** Validated params, or a failure saying what the registry refused. */
function paramsFor(raw: Record<string, unknown>) {
  const result = validateParams(vevo!, raw);
  if (!result.ok) throw new Error(`validateParams refused this: ${result.error}`);
  return result.value;
}

const staged = { source: '/staged/vocals.wav', voiceRef: '/staged/singer.wav' };

describe('voice.vevo2', () => {
  it('runs on vevo2 under the svc task kind', () => {
    // Not `vc`. Vevo2 registers separately under each and the route names
    // differ, so loading it as `vc` and asking for style_preserved_svc is
    // refused by the backend.
    expect(vevo.family).toBe('vevo2');
    expect(vevo.serverTask).toBe('svc');
  });

  it('reads two tracks and labels the one that has to be picked', () => {
    expect(vevo.inputRoles).toEqual(['source', 'voiceRef']);
    // The source is the take the page opened on, so it needs no label. The
    // reference is chosen, and "voiceRef" is not a thing to show somebody.
    expect(vevo.inputRoleLabels?.source).toBeUndefined();
    expect(vevo.inputRoleLabels?.voiceRef?.label).toBeTruthy();
    expect(vevo.inputRoleLabels?.voiceRef?.help).toBeTruthy();
  });

  it('sends both staged paths flat, beside the route', () => {
    // The opposite of RVC next door, and the rule that tells them apart is in
    // DOCS/ERRORS.md: a CLI flag is a top level field, a --request-option is
    // nested. Every field this task sends is a flag upstream, so nothing here
    // belongs under `options`. Both halves were re-checked against the running
    // container on 2026-09-20: an invented task_route and an invented voice_ref
    // were each refused rather than swallowed.
    const request = vevo.buildRequest(paramsFor({}), staged);

    expect(request.task_route).toBe('style_preserved_svc');
    expect(request.audio).toBe('/staged/vocals.wav');
    expect(request.voice_ref).toBe('/staged/singer.wav');
    expect(request.options).toBeUndefined();
  });

  it('leaves a zero semitone shift out rather than sending it', () => {
    // Unset means the model estimates the shift between the two voices, which
    // is the route's own default. Sending 0 tells it not to shift at all, and
    // those are different instructions.
    const request = vevo.buildRequest(paramsFor({ semitoneShift: 0 }), staged);
    expect(request.source_shift_steps).toBeUndefined();
  });

  it('carries a real semitone shift under the name the CLI uses', () => {
    const request = vevo.buildRequest(paramsFor({ semitoneShift: -12 }), staged);
    expect(request.source_shift_steps).toBe(-12);
  });

  it('carries the seed, which is what makes a result repeatable', () => {
    // Measured on 2026-09-20: the same seed and the same inputs returned byte
    // for byte identical audio, and no seed returned something different every
    // run. Seed-VC failed this test in phase 6b.
    const request = vevo.buildRequest(paramsFor({ seed: 99 }), staged);
    expect(request.seed).toBe(99);
  });

  it('defaults the flow steps rather than leaving them to the backend', () => {
    const request = vevo.buildRequest(paramsFor({}), staged);
    expect(request.num_inference_steps).toBe(32);
  });

  it('comes back as a stem at the source rate', () => {
    // 24 kHz mono out against 44.1 kHz stems. The mix route refuses a set whose
    // rates disagree, so the conversion is put back to its source's rate on the
    // way out. That restores the rate, not the content above 12 kHz.
    expect(vevo.resultKind).toBe('stem');
    expect(vevo.matchesSourceSampleRate).toBe(true);
  });

  it('names the model in the label, because the voice is another track', () => {
    // RVC names the voice it used, which is one of four and means something.
    // Here the reference is a track whose name could be anything, so two
    // conversions of one stem are told apart by what did them.
    expect(vevo.labelSuffix?.({})).toBe('vevo2');
  });

  it('asks nothing about lyrics or an instrumental', () => {
    expect(vevo.vocals).toBe('required');
    expect(vevo.fields.some((field) => field.kind === 'lyrics')).toBe(false);
  });

  it('keeps every field in the advanced drawer', () => {
    // Nothing here is part of an ordinary run. The two things that decide the
    // result are the stem and the voice, and both are inputs rather than
    // fields.
    expect(vevo.fields.every((field) => field.advanced === true)).toBe(true);
  });
});
