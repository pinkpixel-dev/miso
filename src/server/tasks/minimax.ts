import type { TaskDefinition } from './types.ts';

/**
 * MiniMax Music 3, a production caption plus lyrics.
 *
 * No task_route, because the family has no routes. The request is the caption
 * and its options, which is true of every generation family except ACE-Step.
 *
 * `duration_sec` is an autoregressive frame budget rather than a final length,
 * and raising it raises VRAM. Its help text says budget for that reason.
 *
 * `vocals` is 'required', which the server settled rather than the spec. The
 * vendored spec marks lyrics required, but every field left out of
 * /v1/tasks/run gets a default, so an instrumental might still have worked. It
 * does not: a job sent without lyrics came back refused, in those words.
 *
 *     MiniMax Music 3 requires lyrics
 *
 * 'required' locks the studio's vocal control off Instrumental and says why,
 * which is the same machinery Stable Audio uses to lock the other way.
 */
export const minimax: TaskDefinition = {
  id: 'generate.minimax',
  label: 'MiniMax Music 3',
  shortLabel: 'MiniMax',
  summary: 'Writes a track from a production caption and tagged lyrics.',
  family: 'minimax_music3',
  serverTask: 'gen',
  vocals: 'required',
  /**
   * Which component GGUFs to load, read off the package that is installed.
   *
   * This family ships its language model, depth decoder and flow transformer as
   * separate files, and their precisions differ per package. The backend's own
   * defaults name one fixed set (language_model_q4_0, rvq_depth_decoder_bf16,
   * transformer_q4_0) that no package ships in full: q4_0 carries a q8_0 depth
   * decoder, and q8_0 and bf16 carry none of the three. Loading without these
   * therefore named a file that was not on disk and answered HTTP 500 before
   * the registration was ever created. See DOCS/ERRORS.md.
   *
   * Reading the filenames from the spec rather than writing them here means a
   * package added upstream loads without another edit to this file.
   */
  sessionOptions(pkg) {
    const component = (prefix: string): string | undefined =>
      pkg.files
        .map((file) => file.slice(file.lastIndexOf('/') + 1))
        .find((name) => name.startsWith(prefix) && name.endsWith('.gguf'));

    const components: [prefix: string, option: string][] = [
      ['language_model_', 'minimax_music3.language_model_gguf'],
      ['rvq_depth_decoder_', 'minimax_music3.rvq_depth_decoder_gguf'],
      ['transformer_', 'minimax_music3.flow_transformer_gguf'],
    ];

    const options: Record<string, string> = {};
    for (const [prefix, option] of components) {
      const file = component(prefix);
      // A component this package does not ship is left to the backend's default
      // rather than sent empty, which it would try to open as a filename.
      if (file !== undefined) options[option] = file;
    }

    return options;
  },
  inputRoles: [],
  fields: [
    {
      name: 'prompt',
      label: 'Prompt',
      kind: 'text',
      required: true,
      help: 'A production caption: the genre, the instruments, the voice, and how it was recorded.',
    },
    {
      name: 'lyrics',
      label: 'Lyrics',
      kind: 'lyrics',
      required: false,
      help: 'Section tags such as [verse] and [chorus] are read by this model.',
    },
    {
      name: 'durationSeconds',
      label: 'Length in seconds',
      kind: 'number',
      required: false,
      min: 5,
      max: 300,
      step: 5,
      default: 120,
      help: 'A budget rather than an exact length. Raising it also raises video memory use.',
    },
    {
      name: 'steps',
      label: 'Steps',
      kind: 'number',
      required: false,
      min: 1,
      max: 100,
      step: 1,
      default: 30,
      advanced: true,
      help: 'Flow matching steps per chunk.',
    },
    {
      name: 'guidanceScale',
      label: 'Guidance',
      kind: 'number',
      required: false,
      min: 0,
      max: 20,
      step: 0.1,
      default: 1.7,
      advanced: true,
      help: 'How closely the flow transformer follows the caption.',
    },
    {
      name: 'arGuidanceScale',
      label: 'Semantic guidance',
      kind: 'number',
      required: false,
      min: 0,
      max: 20,
      step: 0.1,
      default: 1.5,
      advanced: true,
      help: 'Guidance for the autoregressive stage, which decides the structure.',
    },
    {
      name: 'topK',
      label: 'Top K',
      kind: 'number',
      required: false,
      min: 1,
      max: 1000,
      step: 1,
      advanced: true,
      help: 'How many candidates each sampled token chooses between.',
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
    const request: Record<string, unknown> = { text: params.prompt };

    if (params.lyrics !== undefined && params.lyrics !== '') request.lyrics = params.lyrics;
    // duration_seconds, the same name every other family takes. `duration_sec`
    // is the spelling the CLI's --request-option uses, and it is not the field
    // the HTTP request object reads: sending it left this model on its own 20
    // second default while the length asked for was ignored. Confirmed against
    // a live server, 45 seconds asked and 44.93 delivered. See DOCS/ERRORS.md.
    if (params.durationSeconds !== undefined) request.duration_seconds = params.durationSeconds;
    if (params.steps !== undefined) request.num_inference_steps = params.steps;
    if (params.guidanceScale !== undefined) request.guidance_scale = params.guidanceScale;
    if (params.arGuidanceScale !== undefined) request.ar_guidance_scale = params.arGuidanceScale;
    if (params.topK !== undefined) request.top_k = params.topK;
    if (params.seed !== undefined) request.seed = params.seed;

    return request;
  },
};
