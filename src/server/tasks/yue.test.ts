import { describe, expect, it } from 'vitest';
import { findTask, taskPackageIds, validateParams } from './registry.ts';

const yue = findTask('generate.yue2');
if (!yue) throw new Error('generate.yue2 is missing from the registry');

function paramsFor(raw: Record<string, unknown>) {
  const result = validateParams(yue!, raw);
  if (!result.ok) throw new Error(`validateParams refused this: ${result.error}`);
  return result.value;
}

const SONG = { prompt: 'English, indie pop, warm lead vocal', lyrics: '[Verse]\nSoft morning light' };

describe('generate.yue2', () => {
  it('generates from nothing, like the other song writers', () => {
    expect(yue.family).toBe('yue2');
    expect(yue.serverTask).toBe('gen');
    expect(yue.inputRoles).toEqual([]);
  });

  it('calls its style field prompt, which is what the create form lays out on', () => {
    // Named `style` at first, which gave YuE2 a form unlike the other four:
    // lyrics below the style box and no assistant on either, because the panel
    // keys the guided builder, the lyrics card and the richer-prompt button on
    // a field called `prompt`.
    const names = yue.fields.map((field) => field.name);
    expect(names).toContain('prompt');
    expect(names).not.toContain('style');
    expect(yue.fields.find((field) => field.name === 'prompt')?.label).toBe('Style');
  });

  it('sends the prompt nested as style, and the lyrics flat', () => {
    // The trap. `style` beside `lyrics` is refused outright with `Yue2 requires
    // non-empty style`, measured on 2026-09-20. `--lyrics` and `--seed` are CLI
    // flags so they are top level; everything else is a --request-option.
    const request = yue.buildRequest(paramsFor(SONG), {});

    expect(request.lyrics).toBe(SONG.lyrics);
    expect(request.style).toBeUndefined();
    expect(request.prompt).toBeUndefined();
    expect(request.options).toMatchObject({ style: SONG.prompt });
  });

  it('keeps every knob inside options', () => {
    const request = yue.buildRequest(
      paramsFor({ ...SONG, cot: 'melody', maxTokens: 2000, steps: 12, guidanceScale: 1.5 }),
      {},
    );

    expect(request.options).toEqual({
      style: SONG.prompt,
      cot: 'melody',
      semantic_max_tokens: 2000,
      guidance_scale: 1.5,
      num_inference_steps: 12,
    });
  });

  it('keeps the seed at the top level, where the flag is', () => {
    const request = yue.buildRequest(paramsFor({ ...SONG, seed: 99 }), {});
    expect(request.seed).toBe(99);
    expect((request.options as Record<string, unknown>).seed).toBeUndefined();
  });

  it('plans by default, because the score is the point of it', () => {
    const request = yue.buildRequest(paramsFor(SONG), {});
    expect((request.options as Record<string, unknown>).cot).toBe('full');
  });

  it('refuses a song with no style and no words', () => {
    expect(validateParams(yue, { lyrics: 'words' }).ok).toBe(false);
    expect(validateParams(yue, { prompt: 'pop' }).ok).toBe(false);
  });

  it('offers only the model packages, never the decoder', () => {
    // Five packages ship: three models and two decoders. Without this the
    // studio would offer "Yue2 VAE F16" as a thing to write a song with.
    const offered = taskPackageIds(yue);

    expect(offered).toContain('yue2_main_q8_0');
    expect(offered).toContain('yue2_main_bf16');
    expect(offered.some((id) => id.startsWith('yue2_vae_'))).toBe(false);
  });

  it('names the decoder it cannot run without', () => {
    expect(yue.requiresPackage).toBe('yue2_vae_f16');
  });

  it('names the component files of whichever package was chosen', () => {
    // The backend's own defaults name one fixed set, and which precision is on
    // disk depends on the package installed. Same reasoning as MiniMax.
    const q8 = { id: 'yue2_main_q8_0', label: '', precision: 'q8_0', directory: 'Yue2-3B-GGUF', files: ['sidecars/yue2-model-config.json', 'yue2-3b-q8_0.gguf'] };
    const bf16 = { ...q8, id: 'yue2_main_bf16', files: ['sidecars/yue2-model-config.json', 'yue2-3b-bf16.gguf'] };

    expect(yue.sessionOptions?.(q8)).toEqual({
      'yue2.model_gguf': 'yue2-3b-q8_0.gguf',
      'yue2.vae_gguf': 'yue2-vae-f16.gguf',
    });
    expect(yue.sessionOptions?.(bf16)['yue2.model_gguf']).toBe('yue2-3b-bf16.gguf');
  });

  it('cannot do an instrumental, so the studio locks the vocal control', () => {
    // Settled by the backend, not the spec: an empty lyric answers `Yue2
    // requires non-empty lyrics`. With `both` the guided builder would offer
    // Instrumental, skip the lyrics for it, and leave the button locked with
    // no visible field to unlock it.
    expect(yue.vocals).toBe('required');
    expect(yue.fields.find((field) => field.name === 'lyrics')?.required).toBe(true);
  });

  it('leaves the length to the model rather than capping it low', () => {
    // 1200 at first, which is about 45 seconds and cut songs off
    // mid-arrangement. The same prompt at 4000 ran to 55 seconds and stopped on
    // its own, so the ceiling is the model's default and the song ends where
    // YuE2 decides.
    const request = yue.buildRequest(paramsFor(SONG), {});
    expect((request.options as Record<string, unknown>).semantic_max_tokens).toBe(9000);
  });

  it('has no length in seconds, because the model decides that', () => {
    // Every other generator takes a duration. YuE2 works its length out from
    // the lyrics, and the only control is where to stop.
    const names = yue.fields.map((field) => field.name);
    expect(names).not.toContain('durationSeconds');
    expect(names).toContain('maxTokens');
  });
});

describe('generate.yue2 with a score to follow', () => {
  const MELODY = 'X:1\nM:4/4  L:1/16\nV: Vocal clef=treble\nK:C\nc4c4g4g4|a4a4g8|\n';

  it('sends a supplied score nested under options, like every other knob', () => {
    // Probed on 2026-09-20 before this was built, because two entries in
    // DOCS/ERRORS.md are this backend accepting a field and ignoring it. Two
    // runs at seed 4242 differing only in this came back as different songs.
    const request = yue.buildRequest(paramsFor({ ...SONG, cot: 'melody', abc: MELODY }), {});

    expect(request.abc).toBeUndefined();
    expect(request.options).toMatchObject({ abc: MELODY.trim(), cot: 'melody' });
  });

  it('leaves the score out when there is not one, rather than sending an empty plan', () => {
    // An empty box is the ordinary case of letting YuE2 plan for itself, not a
    // score with no notes in it. Sending it would point the melody route at
    // nothing.
    for (const abc of ['', '   \n  ']) {
      const options = yue.buildRequest(paramsFor({ ...SONG, cot: 'melody', abc }), {})
        .options as Record<string, unknown>;
      expect(options.abc).toBeUndefined();
    }
  });

  it('trims the score, so a trailing newline is not what decides it', () => {
    const options = yue.buildRequest(paramsFor({ ...SONG, cot: 'melody', abc: `\n${MELODY}\n` }), {})
      .options as Record<string, unknown>;
    expect(options.abc).toBe(MELODY.trim());
  });

  it('refuses a score with the planning turned off', () => {
    // `cot=off` never looks at a score. Caught here rather than after four
    // gigabytes have loaded and a song has come back ignoring the tune.
    const result = validateParams(yue, { ...SONG, cot: 'off', abc: MELODY });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('planning left on');
  });

  it('allows the planning routes, and an empty score with planning off', () => {
    for (const cot of ['melody', 'full']) {
      expect(validateParams(yue, { ...SONG, cot, abc: MELODY }).ok).toBe(true);
    }
    expect(validateParams(yue, { ...SONG, cot: 'off' }).ok).toBe(true);
  });

  it('offers the score as its own kind of field, and never demands one', () => {
    const field = yue.fields.find((entry) => entry.name === 'abc');
    expect(field?.kind).toBe('score');
    expect(field?.required).toBe(false);
  });
});
