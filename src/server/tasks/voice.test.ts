import { describe, expect, it } from 'vitest';
import { findTask, validateParams } from './registry.ts';

const rvc = findTask('voice.rvc');
if (!rvc) throw new Error('voice.rvc is missing from the registry');

/** Validated params, or a failure saying what the registry refused. */
function paramsFor(raw: Record<string, unknown>) {
  const result = validateParams(rvc!, raw);
  if (!result.ok) throw new Error(`validateParams refused this: ${result.error}`);
  return result.value;
}

describe('voice.rvc', () => {
  it('runs on rvc under the vc task kind', () => {
    expect(rvc.family).toBe('rvc');
    expect(rvc.serverTask).toBe('vc');
    expect(rvc.inputRoles).toEqual(['source']);
  });

  it('sends every option nested under options', () => {
    // The whole reason this task exists as its own module. Sent at the top
    // level these are accepted and silently ignored: four different voices came
    // back byte for byte identical during the probe on 2026-09-18.
    const request = rvc.buildRequest(paramsFor({ voiceId: 'manthos' }), { source: '/staged/a.wav' });

    expect(request.audio).toBe('/staged/a.wav');
    expect(request.options).toMatchObject({ voice_id: 'manthos' });
    expect(request.voice_id).toBeUndefined();
    expect(request.semitone_shift).toBeUndefined();
  });

  it('carries the pitch and blend options in the shape the spec names', () => {
    const request = rvc.buildRequest(
      paramsFor({ voiceId: 'chocola', semitoneShift: -12, retrievalBlend: 0.5, pitchFilterRadius: 0 }),
      { source: '/staged/a.wav' },
    );

    expect(request.options).toEqual({
      voice_id: 'chocola',
      semitone_shift: -12,
      retrieval_blend: 0.5,
      pitch_filter_radius: 0,
    });
  });

  it('defaults to the voice that was chosen by ear', () => {
    expect(paramsFor({}).voiceId).toBe('default');
  });

  it('refuses a voice the model does not have', () => {
    // RVC answers `unknown RVC voice id: x`, but only after the job has queued
    // and the weights are in memory.
    const result = validateParams(rvc, { voiceId: 'notarealvoice' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('manthos');
  });

  it('holds the semitone shift inside a musical range', () => {
    expect(validateParams(rvc, { semitoneShift: 48 }).ok).toBe(false);
    expect(validateParams(rvc, { semitoneShift: 12 }).ok).toBe(true);
  });

  it('names a conversion after the voice it used', () => {
    expect(rvc.labelSuffix?.({ voiceId: 'fraise' })).toBe('fraise');
    expect(rvc.labelSuffix?.({})).toBeUndefined();
  });

  it('asks for a stem back at the rate its source came in at', () => {
    // Both halves of putting a converted vocal back in the mix: the mix route
    // reaches stems, and it refuses a set whose rates disagree.
    expect(rvc.resultKind).toBe('stem');
    expect(rvc.matchesSourceSampleRate).toBe(true);
  });

  it('needs nothing converted on the way in', () => {
    // RVC took 44.1 kHz and 48 kHz stereo in the probe and answered at 40 kHz
    // either way, unlike separation which refuses anything but 44.1 kHz.
    expect(rvc.inputSampleRate).toBeUndefined();
  });
});
