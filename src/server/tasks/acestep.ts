import type { ParamField, TaskDefinition } from './types.ts';

/**
 * ACE-Step 1.5, every route Miso offers on it.
 *
 * This family is the only generation family with routes, and the routes do not
 * behave the way their names suggest. Nothing in this file about what a field
 * does came from the upstream manual: every claim was measured against a live
 * container, because /v1/tasks/run fills in a default for each field it does
 * not recognise, so a wrong name returns a perfectly good track that ignored
 * you. The measurements are in src/server/audiocpp/fixtures/README.md and the
 * failures are in DOCS/ERRORS.md.
 *
 * Three routes upstream documents are deliberately absent, each measured rather
 * than assumed. `complete` and `lego` accept source audio and discard it,
 * returning byte-identical output with and without it, and they are not offered
 * as generation either: against text2music on the same prompt, seed and lyrics
 * they land 8.7 and 51.0 apart on a brightness measure where adding lyrics to
 * that same request moves it 1443, so they are another seed of this entry
 * rather than another capability. `extract` claims to pull a named part out and
 * instead returns a re-rendered mix, louder than the source it came from, so
 * phase 6 owns separation.
 *
 * mem_saver is on for every entry because a 16 GB card cannot hold ACE-Step
 * twice: the Turbo Q8 package is 6.19 GB on disk and about 13.1 GB resident,
 * and a second request after a generation failed to allocate until mem_saver
 * brought the resident figure down to 530 MB. It is a requirement, not an
 * option.
 */

const MEM_SAVER = () => ({ 'ace_step.mem_saver': 'true' });

/** Shared by every route here, because the sampler questions do not change. */
const STEPS: ParamField = {
  name: 'steps',
  label: 'Steps',
  kind: 'number',
  required: false,
  min: 1,
  max: 100,
  step: 1,
  default: 8,
  advanced: true,
  help: 'More steps take longer and change the result more than they improve it.',
};

export const text2music: TaskDefinition = {
  id: 'generate.text2music',
  label: 'ACE-Step 1.5',
  shortLabel: 'ACE-Step',
  summary: 'Writes a new track from a prompt, with optional lyrics.',
  family: 'ace_step',
  serverTask: 'gen',
  route: 'text2music',
  vocals: 'both',
  sessionOptions: MEM_SAVER,
  inputRoles: [],
  fields: [
    {
      name: 'prompt',
      label: 'Prompt',
      kind: 'text',
      required: true,
      help: 'Describe the music: genre, mood, instruments, and the kind of vocal.',
    },
    {
      name: 'lyrics',
      label: 'Lyrics',
      kind: 'lyrics',
      required: false,
      help: 'Leave this empty for an instrumental.',
    },
    {
      name: 'durationSeconds',
      label: 'Length in seconds',
      kind: 'number',
      required: false,
      min: 5,
      max: 300,
      step: 5,
      default: 180,
      help: 'Three minutes by default, which is a song. Generation time scales with this.',
    },
    {
      name: 'bpm',
      label: 'Tempo in BPM',
      kind: 'number',
      required: false,
      min: 40,
      max: 220,
      step: 1,
      help: 'Leave this empty and the model picks a tempo to suit the prompt.',
    },
    {
      name: 'keyscale',
      label: 'Key',
      kind: 'text',
      required: false,
      help: 'For example C major or A minor. Empty lets the model choose.',
    },
    {
      name: 'negativePrompt',
      label: 'Negative prompt',
      kind: 'text',
      required: false,
      advanced: true,
      help: 'What to keep out of the track, such as distorted vocals or crowd noise.',
    },
    STEPS,
    {
      name: 'guidanceScale',
      label: 'Guidance',
      kind: 'number',
      required: false,
      min: 0,
      max: 20,
      step: 0.1,
      default: 1,
      advanced: true,
      help: 'How closely the model follows the prompt.',
    },
    {
      name: 'seed',
      label: 'Seed',
      kind: 'number',
      required: false,
      min: 0,
      max: 2_147_483_647,
      step: 1,
      advanced: true,
      help: 'Leave this empty for a different result every time.',
    },
  ],
  buildRequest(params) {
    // Field names are the CLI's, which is what /v1/tasks/run takes inside its
    // request object. Anything the person left empty is left out rather than
    // sent as null, so the model's own default applies.
    const request: Record<string, unknown> = {
      task_route: 'text2music',
      text: params.prompt,
    };

    if (params.lyrics !== undefined && params.lyrics !== '') request.lyrics = params.lyrics;
    if (params.durationSeconds !== undefined) request.duration_seconds = params.durationSeconds;
    if (params.steps !== undefined) request.num_inference_steps = params.steps;
    if (params.guidanceScale !== undefined) request.guidance_scale = params.guidanceScale;
    if (params.seed !== undefined) request.seed = params.seed;

    // bpm, keyscale, and negative_prompt are request options on the CLI and
    // plain fields of the same request object over HTTP. Left out rather than
    // sent empty: unset means the planner chooses the tempo and the key, which
    // is not the same instruction as being told to use nothing.
    if (params.bpm !== undefined) request.bpm = params.bpm;
    if (params.keyscale !== undefined && params.keyscale !== '') request.keyscale = params.keyscale;
    if (params.negativePrompt !== undefined && params.negativePrompt !== '') {
      request.negative_prompt = params.negativePrompt;
    }

    return request;
  },
};

/**
 * ACE-Step 1.5, repaint.
 *
 * The first task that reads an existing asset. `inputRoles` names the source,
 * the worker stages it to the backend before the run, and buildRequest receives
 * the path the backend gave back.
 *
 * Every field name below was confirmed against a live container on 2026-09-13
 * rather than taken from the CLI manual, because this route cannot be checked
 * by its status code: /v1/tasks/run defaults every field it does not recognise,
 * so a wrong name returns a perfectly good track that ignored you. The proof is
 * that the returned audio was identical to the source outside the window and
 * completely different inside it. See src/server/audiocpp/fixtures/README.md.
 *
 * There is no duration field. Repaint locks the length to the source, measured
 * at 20.00 seconds in and 20.00 seconds out, so a box asking for a length would
 * be a control the model ignores.
 *
 * What this route does and does not listen to was measured, and it is not what
 * the field names suggest:
 *
 *   - `lyrics` are the only content control here that does anything, and even
 *     they are unreliable. Across several runs a repainted section followed
 *     them some of the time and went its own way the rest, so the field
 *     promises nothing and tells people to try a few seeds.
 *
 *     Leaving them out does not reliably silence the vocal, it loses the words.
 *     One run came back with no singing at all, another sang invented syllables
 *     in place of the line that was there. What both share, and what the form
 *     therefore says, is that the original words are never carried over.
 *   - `repaint_strength` and `seed` steer it. The same seed repeats exactly.
 *   - `text` does not steer it. It perturbs the result without directing it.
 *     It is still mandatory: omitting the key answers HTTP 500 "ACE-Step
 *     requires text_input", while an empty string is accepted. So the field is
 *     optional on the form and the request always carries it. Repeated runs
 *     with the prompt left blank have all succeeded.
 *   - `audio_cover_strength` does nothing here. Every value from 1.0 down to
 *     0.0 returned byte-identical audio. The suspicion at the time was that
 *     audio.cpp wires it into the cover routes instead. It does not: the same
 *     test on `cover` in phase 5b returned byte-identical audio too.
 *
 * The prompt is therefore optional and says so on the form. Opposite prompts,
 * "solo piano" against "distorted metal guitar", produced audio 4 to 13 apart
 * on a brightness measure, while the same two prompts through text2music on the
 * same package came out 1098 apart. Confirmed on ACE-Step Turbo and again on
 * Base, so it is a property of the route rather than of guidance distillation.
 * See DOCS/ERRORS.md.
 *
 * The manual explains this with a `Planner | Not used` line on the route, and
 * that explanation does not generalise. `cover` carries the same line and
 * follows a prompt better than anything else measured on this family, so do not
 * predict a new route's behaviour from that column.
 *
 * repaint_mode stays out while repaint_strength covers the same idea. Three
 * named presets beside a 0 to 1 dial are two controls for one question.
 */
export const repaint: TaskDefinition = {
  id: 'remix.repaint',
  label: 'Repaint a section',
  shortLabel: 'Repaints',
  summary: 'Replaces the part of a take you select, and leaves the rest alone.',
  family: 'ace_step',
  serverTask: 'gen',
  route: 'repaint',
  vocals: 'both',
  sessionOptions: MEM_SAVER,
  inputRoles: ['source'],
  fields: [
    {
      name: 'regionStart',
      label: 'Region start in seconds',
      kind: 'number',
      required: true,
      min: 0,
      max: 3600,
      step: 0.1,
      help: 'Set by dragging on the waveform, or typed here.',
    },
    {
      name: 'regionEnd',
      label: 'Region end in seconds',
      kind: 'number',
      required: true,
      min: 0,
      max: 3600,
      step: 0.1,
      help: 'Has to land after the start, and inside the track.',
    },
    // Lyrics lead the form because they are the one content control that
    // works on this route. They reach the model down a different path from the
    // text prompt, and a repainted vocal section sings what they say.
    {
      name: 'lyrics',
      label: 'Lyrics',
      kind: 'lyrics',
      required: false,
      help: 'The words this section should sing. It follows them on some runs and not others, and without them it does not keep the words that were there. Give it the lyrics for the part you are replacing, and expect to try a few seeds.',
    },
    // Optional, and honest about why. Requiring it would make people type
    // something meaningless before the button would unlock.
    {
      name: 'prompt',
      label: 'Prompt',
      kind: 'text',
      required: false,
      help: 'A nudge rather than an instruction. This route rebuilds the section from the music around it, so the prompt changes the result without deciding what you get.',
    },
    {
      name: 'strength',
      label: 'Strength',
      kind: 'number',
      required: false,
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.5,
      help: 'Low nudges what is already there. High replaces it.',
    },
    STEPS,
    {
      name: 'seed',
      label: 'Seed',
      kind: 'number',
      required: false,
      min: 0,
      max: 2_147_483_647,
      step: 1,
      advanced: true,
      help: 'A repaint repeats exactly for the same seed, so this is how a good one is kept.',
    },
  ],
  validate(params) {
    const { regionStart: start, regionEnd: end } = params;
    // Both are required fields, so anything other than two numbers here has
    // already been refused and the per-field message is the better one.
    if (typeof start !== 'number' || typeof end !== 'number') return undefined;
    if (end <= start) return 'The region has to end after it starts.';
    return undefined;
  },
  buildRequest(params, staged) {
    const request: Record<string, unknown> = {
      task_route: 'repaint',
      // The staged path the worker uploaded, under the one name that works.
      audio: staged.source,
      repaint_start: params.regionStart,
      repaint_end: params.regionEnd,
    };

    // Always sent, even when empty. This is the one field on the route with no
    // server-side default: leaving the key out answers HTTP 500 "ACE-Step
    // requires text_input". An empty string is accepted, and that is what lets
    // the form leave the prompt optional.
    request.text = params.prompt ?? '';
    if (params.lyrics !== undefined && params.lyrics !== '') request.lyrics = params.lyrics;
    if (params.strength !== undefined) request.repaint_strength = params.strength;
    if (params.steps !== undefined) request.num_inference_steps = params.steps;
    if (params.seed !== undefined) request.seed = params.seed;

    return request;
  },
};

/**
 * The two cover routes, which differ only in the route name and what to say
 * about them.
 *
 * Built from one function because they are one task with a switch. Sending the
 * same body to each produced audio 308 apart on a brightness measure, so they
 * are genuinely two routes rather than one with two names, but every field,
 * rule and validation below is shared.
 *
 * What was measured on 2026-09-14, on ACE-Step Turbo with a 20 second source:
 *
 *   - **The prompt steers these, hard.** The piano and metal pair came out
 *     2244.9 apart, wider than text2music's own 1098 on the same package. This
 *     is the opposite of repaint, so the prompt is required here and its help
 *     can promise something.
 *   - **Duration locks to the source**, 20 seconds in and 20 out, so there is
 *     no length field.
 *   - **They read the source.** Both fall silent where the source falls silent.
 *   - **`audio_cover_strength` does nothing.** 1.0 and 0.0 returned
 *     byte-identical audio. The upstream tutorial calls it the freedom dial for
 *     exactly this kind of edit and phase 5a suspected it was wired into these
 *     routes rather than into repaint. It is wired into neither, so there is no
 *     strength control here.
 *   - **`cover` reworks and `cover-nofsq` stays close.** Against the source,
 *     cover differs by 3400 to 7000 per second while nofsq differs by around
 *     1300. That difference is the whole reason both are offered, so each
 *     summary has to say which one it is.
 *
 * **These need room for the whole take, and that is a real ceiling.** On top of the
 * model they allocate a timbre encoder buffer, and a source long enough makes
 * that allocation fail. Measured on 2026-09-15 on a 16 GB card with ACE-Step
 * Turbo Q8 resident: 20, 60, 120 and 150 second sources all succeed, 180
 * seconds fails asking for 1389.49 MiB with 1359 MiB free, missing by about 30
 * MB. `cover-nofsq` fails at 180 seconds too, so dropping the FSQ tokenizer
 * does not drop the timbre encoder with it.
 *
 * The threshold is not a number to hardcode. It is whatever is free once the
 * model is resident, so a busier card fails sooner and a larger one fails
 * later. The summaries say a long take may not fit, and the job failure says to
 * try a shorter one, which is the advice that works. Note that the create
 * form's own default is 180 seconds, so a track generated with defaults is on
 * the wrong side of this. See DOCS/ERRORS.md.
 *
 * Not measured: whether lyrics are followed here. Every cover probe sent the
 * same lyrics and none compared against sending none, so the field is offered
 * because this family sings and a cover is a performance, not because anybody
 * proved it. Its help promises nothing for that reason. Measuring it is two
 * runs with `scripts/probe-routes.mjs`.
 */
function coverTask(options: {
  id: string;
  route: string;
  label: string;
  shortLabel: string;
  summary: string;
}): TaskDefinition {
  return {
    id: options.id,
    label: options.label,
    shortLabel: options.shortLabel,
    summary: options.summary,
    family: 'ace_step',
    serverTask: 'gen',
    route: options.route,
    vocals: 'both',
    sessionOptions: MEM_SAVER,
    inputRoles: ['source'],
    fields: [
      // Required, unlike repaint's. This route genuinely follows what it is
      // told, so an empty box would be throwing away the main control.
      {
        name: 'prompt',
        label: 'Prompt',
        kind: 'text',
        required: true,
        help: 'What the cover should sound like: the genre, the instruments, and the kind of voice. This route follows it closely.',
      },
      // Optional, and the help has to say what leaving it empty does. This
      // route does not hear the words in the source, so an empty box is not
      // "keep the original words", it is an instrumental. Confirmed by ear on
      // September 15, 2026.
      {
        name: 'lyrics',
        label: 'Lyrics',
        kind: 'lyrics',
        required: false,
        help: 'The words this cover should sing. Leave it empty and the cover comes back instrumental: this route does not read the words out of the take you gave it.',
      },
      STEPS,
      {
        name: 'seed',
        label: 'Seed',
        kind: 'number',
        required: false,
        min: 0,
        max: 2_147_483_647,
        step: 1,
        advanced: true,
        help: 'A cover repeats exactly for the same seed, so this is how a good one is kept.',
      },
    ],
    buildRequest(params, staged) {
      const request: Record<string, unknown> = {
        task_route: options.route,
        audio: staged.source,
      };

      // Always sent, as on repaint: `text` is the one ACE-Step field with no
      // server-side default and omitting it answers HTTP 500. The prompt is
      // required here, so this is belt and braces rather than the load-bearing
      // line it is on repaint.
      request.text = params.prompt ?? '';
      if (params.lyrics !== undefined && params.lyrics !== '') request.lyrics = params.lyrics;
      if (params.steps !== undefined) request.num_inference_steps = params.steps;
      if (params.seed !== undefined) request.seed = params.seed;

      return request;
    },
  };
}

export const cover = coverTask({
  id: 'remix.cover',
  route: 'cover',
  label: 'Cover a take',
  shortLabel: 'Covers',
  summary:
    'Performs a take again in a style you describe, keeping its structure and length. A long take may not fit in video memory.',
});

export const coverNoFsq = coverTask({
  id: 'remix.covernofsq',
  route: 'cover-nofsq',
  label: 'Light cover',
  shortLabel: 'Light covers',
  summary:
    'The same idea as a cover, but it stays much closer to the original recording. A long take may not fit in video memory, the same as a cover.',
});
