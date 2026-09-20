import type { SpecPackage } from '../catalog/parse.ts';
import type { TaskDefinition } from './types.ts';

/**
 * The model packages, as against the decoder packages.
 *
 * YuE2 is the first family whose packages are not all the same thing. Three are
 * the model at different precisions and two are the VAE that turns its latents
 * into audio, and a working install needs one of each in the same directory.
 * Offering the decoder in the studio's model list would let somebody pick
 * "Yue2 VAE F16" as the thing to generate a song with.
 */
function isModelPackage(packageId: string): boolean {
  return packageId.startsWith('yue2_main_');
}

/**
 * YuE2, lyrics and a style into a finished song.
 *
 * The only generator here that answers at 48 kHz stereo. Every other family
 * either matches that or sits below it, and Vevo2 next door is 24 kHz mono, so
 * this one needs no apology about rate anywhere in the app.
 *
 * Probed against `full-cuda13` at audio.cpp 9ba8841 on 2026-09-20, package
 * `yue2_main_q8_0` with `yue2_vae_f16`:
 *
 *   cot=off    43.0 s of audio in 37.5 s
 *   cot=full   44.0 s of audio in 56.1 s, rtf 1.28
 *   output     48 kHz stereo
 *   peak VRAM  9189 MiB of a 16 GB card, so no arena tuning was needed
 *
 * Every option except the lyrics and the seed travels nested under `options`.
 * That is the rule from DOCS/ERRORS.md again, and this family is the first one
 * to say so out loud rather than accepting a flat field and ignoring it:
 * `style` sent beside `lyrics` answers `Yue2 requires non-empty style`. The
 * flags are `--lyrics` and `--seed`; everything else is a `--request-option`.
 *
 * The two-package install is the thing to know about this family. Both
 * packages write the same four sidecar files into `Yue2-3B-GGUF/`, and
 * installing them at the same time fails with `package file already exists`.
 * One at a time works. The Models screen serialises installs for this reason,
 * and `requiresPackage` below is what tells it the pair is needed at all.
 */
export const yue2: TaskDefinition = {
  id: 'generate.yue2',
  label: 'YuE2',
  shortLabel: 'YuE2',
  summary: 'Writes a full song from lyrics and a style, and can hand back the score it planned. 48 kHz stereo.',
  family: 'yue2',
  serverTask: 'gen',
  /**
   * It cannot do an instrumental, which the backend settled rather than the
   * spec. An empty lyric answers `Yue2 requires non-empty lyrics`, measured on
   * 2026-09-20. MiniMax Music 3 is declared for the same reason.
   *
   * This matters on the form rather than only in the request. The guided
   * builder offers Instrumental, and with `both` it would skip the lyrics for
   * an instrumental run while the field stayed required: the button locks and
   * the box that would unlock it is not on screen. `required` locks the vocal
   * control off Instrumental instead, which is the honest version of the same
   * fact.
   */
  vocals: 'required',
  inputRoles: [],
  /**
   * The decoder is not something to generate with.
   *
   * `taskPackageIds` sends this list to the browser, so the studio's model list
   * and what the service will accept say the same thing.
   */
  acceptsPackage: isModelPackage,
  /**
   * The decoder this family cannot run without.
   *
   * Nothing else in the registry needs a second package, and YuE2 fails at load
   * rather than at install if the decoder is missing. The Models screen reads
   * this to say so on the card before anybody spends 4 GB finding out.
   */
  requiresPackage: 'yue2_vae_f16',
  /**
   * Names the component files the installed packages actually ship.
   *
   * The same reasoning as MiniMax Music 3: the backend's own defaults name one
   * fixed set, and which precision is on disk depends on which package was
   * installed. Here the model file follows the chosen package and the decoder
   * is the f16 one, which is what `requiresPackage` asks for.
   */
  sessionOptions(pkg: SpecPackage) {
    const model = pkg.files.find((file) => file.endsWith('.gguf'));
    return {
      ...(model === undefined ? {} : { 'yue2.model_gguf': model }),
      'yue2.vae_gguf': 'yue2-vae-f16.gguf',
    };
  },
  fields: [
    /**
     * Named `prompt` although YuE2 calls it a style.
     *
     * The create form keys its whole layout on a field called `prompt`: the
     * guided builder compiles into it, the lyrics card sits above it, "Make the
     * prompt richer" reads it, and saved prompts load into it. Calling this
     * `style` gave YuE2 a form that looked nothing like the other four, with
     * the lyrics box below the style box and no assistant on either. The label
     * still says Style, because that is what the model calls it and what the
     * help describes. `buildRequest` sends it as `style`.
     */
    {
      name: 'prompt',
      label: 'Style',
      kind: 'text',
      required: true,
      help: 'Genre, instruments, voice and production. For example: English, indie pop, bright acoustic guitar, soft drums, warm lead vocal.',
    },
    {
      name: 'lyrics',
      label: 'Lyrics',
      kind: 'lyrics',
      required: true,
      help: 'Use [Verse] and [Chorus] section tags. The song follows the structure you give it.',
    },
    {
      name: 'cot',
      label: 'Planning',
      kind: 'choice',
      required: false,
      default: 'full',
      values: [
        { value: 'full', label: 'Melody and chords' },
        { value: 'melody', label: 'Melody only' },
        { value: 'off', label: 'None' },
      ],
      help: 'Whether it writes a score before the music. Planning gives you the score to download and costs about half again in time.',
    },
    /**
     * An ABC score to sing instead of one the model plans for itself.
     *
     * Probed on 2026-09-20 against `yue2_main_q8_0`, because a request option
     * accepted and ignored is a trap this backend has sprung twice before. See
     * DOCS/ERRORS.md. Two runs at seed 4242 differing only in this field came
     * back as different songs, and two different scores at that same seed came
     * back different again, so the score is read rather than merely counted.
     *
     * Three things follow from that probe and are worth knowing here:
     *
     *   - Supplying one skips the planning stage, so no score artifact comes
     *     back. `storeScores` filters rather than requires, so a take planned
     *     from an external score simply has none of its own to download.
     *   - It is faster for the same reason: 22 s against 36 s.
     *   - The song runs as long as the score does. A four bar melody gave a
     *     15.8 s song where a longer one gave 39.7 s, which is why the help
     *     says to bring the whole tune.
     */
    {
      name: 'abc',
      label: 'Score',
      kind: 'score',
      required: false,
      help: 'An ABC score for it to follow, instead of planning its own. The song lasts as long as the score, so bring the whole tune. Leave it empty to let YuE2 write the melody.',
    },
    {
      name: 'maxTokens',
      label: 'Length limit',
      kind: 'number',
      required: false,
      min: 200,
      max: 9000,
      step: 100,
      // The model's own default, so the song ends where YuE2 decides rather
      // than where Miso does. It was 1200 at first, which is about 45 seconds
      // and cut songs off mid-arrangement: the same prompt at 4000 ran to 55
      // seconds and stopped on its own. Measured on 2026-09-20.
      default: 9000,
      help: 'The ceiling on how long the song runs, not a target. There is no length in seconds: YuE2 ends the song when it is done, and this only stops a runaway. Lower it to cut songs short on purpose.',
    },
    {
      name: 'guidanceScale',
      label: 'Guidance',
      kind: 'number',
      required: false,
      min: 0,
      max: 20,
      step: 0.1,
      advanced: true,
      help: 'How closely it follows the style. Left empty it uses the route default, which is 1.0 with planning and 1.01 without.',
    },
    {
      name: 'steps',
      label: 'Steps',
      kind: 'number',
      required: false,
      min: 1,
      max: 100,
      step: 1,
      default: 8,
      advanced: true,
      help: 'Solver steps for the stage that turns tokens into audio.',
    },
    {
      name: 'seed',
      label: 'Seed',
      kind: 'number',
      required: false,
      min: 0,
      max: 2_147_483_647,
      step: 1,
      default: 1234,
      advanced: true,
      help: 'The same seed and the same words give the same song.',
    },
  ],
  /**
   * A score with the planning turned off.
   *
   * `cot=off` is the route that writes music straight from the lyrics and
   * never looks at a score, so the two together are a contradiction rather
   * than a preference. Caught here because the alternative is a job that
   * queues, loads four gigabytes, runs for half a minute and hands back a song
   * that ignored the tune it was given, which reads as the feature being
   * broken.
   */
  validate(params) {
    const abc = typeof params.abc === 'string' ? params.abc.trim() : '';
    if (abc !== '' && params.cot === 'off') {
      return 'A score needs the planning left on. Choose Melody only, or clear the score.';
    }
    return undefined;
  },
  /**
   * Nested, apart from the two flags.
   *
   * `lyrics` and `seed` are `--lyrics` and `--seed` on the CLI, so they sit at
   * the top level. Everything else is a `--request-option` and belongs under
   * `options`, where a wrong name is refused instead of swallowed.
   */
  buildRequest(params) {
    // `prompt` on the form, `style` on the wire. See the field above.
    const options: Record<string, unknown> = { style: params.prompt };

    if (typeof params.cot === 'string') options.cot = params.cot;
    // Only when there is one. An empty string here is not an empty score, it
    // is the ordinary case of letting the model plan, and sending it would ask
    // the melody route to follow nothing.
    const abc = typeof params.abc === 'string' ? params.abc.trim() : '';
    if (abc !== '') options.abc = abc;
    if (typeof params.maxTokens === 'number') options.semantic_max_tokens = params.maxTokens;
    if (typeof params.guidanceScale === 'number') options.guidance_scale = params.guidanceScale;
    if (typeof params.steps === 'number') options.num_inference_steps = params.steps;

    const request: Record<string, unknown> = { lyrics: params.lyrics, options };
    if (typeof params.seed === 'number') request.seed = params.seed;

    return request;
  },
};
