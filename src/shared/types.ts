/**
 * Types shared by the Miso service and the Miso client.
 *
 * Nothing here may import from either side. If a type is only meaningful to one
 * of them, it belongs over there instead.
 */

/**
 * Which engine writes lyrics and expands prompts.
 *
 * Both speak the same protocol. llama.cpp's server exposes an OpenAI-compatible
 * chat completions route, so "dual engine" is one client with two
 * configurations, and the only real difference is that the local one needs no
 * key. Both stay configured, and this says which one is used.
 */
export type LyricsEngine = 'external' | 'local';

/** Settings the user can change, stored in the Miso database. */
export interface Settings {
  /** Base URL of the audio.cpp server, no trailing slash. */
  backendUrl: string;
  lyricsEngine: LyricsEngine;
  /** An OpenAI-compatible base URL, including the version path. */
  lyricsExternalUrl: string;
  lyricsExternalModel: string;
  /**
   * Whether a key is stored, never the key itself. The key goes into the
   * database and does not come back out to the browser: a settings screen that
   * renders it puts it in a phone's memory, a screenshot, and a page source,
   * for no benefit to anyone who already typed it once.
   */
  lyricsExternalKeySet: boolean;
  /** A llama.cpp server, which needs no key. */
  lyricsLocalUrl: string;
  lyricsLocalModel: string;
}

/**
 * What a settings update may carry.
 *
 * The key is write only. An empty string clears it, which is how a key is
 * removed without a route of its own.
 */
export type SettingsPatch = Partial<Omit<Settings, 'lyricsExternalKeySet'>> & {
  lyricsExternalKey?: string;
};

/**
 * What the Miso service knows about the audio.cpp server right now.
 *
 * `reachable` is the only field guaranteed to be meaningful. Everything else is
 * absent when the backend did not answer.
 */
export interface BackendStatus {
  reachable: boolean;
  /** The URL that was checked, echoed back so the UI never guesses. */
  url: string;
  /** Round trip time of the health check in milliseconds. */
  latencyMs?: number;
  /** Compute backend the server reports: cuda, cpu, vulkan, metal, or hip. */
  backend?: string;
  /** Number of models currently registered on the server. */
  models?: number;
  /**
   * Whether the server was started with --ui-management. Without it the model
   * catalog, installs, uploads, and dynamic model loading are all unavailable,
   * so Miso degrades rather than failing.
   */
  managementEnabled?: boolean;
  /** Human readable reason the check failed. Present only when unreachable. */
  error?: string;
}

export type SavedPromptKind = 'prompt' | 'lyrics';

/**
 * A prompt or a lyric sheet kept by name.
 *
 * Separate from job history, which records what was used. This records what
 * somebody thought was worth using again, and it is not tied to a project.
 */
export interface SavedPrompt {
  id: string;
  kind: SavedPromptKind;
  name: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** A lyric sheet the assistant wrote, with the title it gave the song. */
export interface LyricsDraft {
  /** Absent when the model ignored the instruction to name the song. */
  title?: string;
  lyrics: string;
}

/**
 * A richer prompt, offered rather than applied.
 *
 * `original` comes back with it so the browser can show what was sent against
 * what came back, and so accepting one is a choice between two things on
 * screen rather than a replacement that already happened.
 */
export interface PromptSuggestion {
  original: string;
  suggestion: string;
}

/** Shape of every error the Miso API returns. */
export interface ApiError {
  error: string;
  detail?: string;
}

/** Where an install Miso started has got to. */
export type InstallState = 'running' | 'complete' | 'failed' | 'cancelled' | 'interrupted';

/**
 * `interrupted` means the job stopped reporting without finishing, which is
 * what a restarted audio.cpp looks like. audio.cpp cannot resume a download,
 * so Miso says so and leaves starting over to the person, because this is a
 * multi-gigabyte download.
 */
export interface InstallProgress {
  state: InstallState;
  phase?: string;
  downloadedBytes?: number;
  totalBytes?: number;
  error?: string;
  startedAt: string;
  updatedAt: string;
}

/** One installable package as the catalog screen sees it: spec, live size, and any install in flight. */
export interface CatalogPackage {
  id: string;
  label: string;
  precision: string;
  /** The precision the model authors suggest. Exactly one per family, and it leads the card. */
  recommended: boolean;
  /** Download size in bytes. Absent until the backend has finished scanning. */
  bytes?: number;
  /**
   * Not optional on purpose. With no live data this is false and the screen
   * says the state is unknown, rather than claiming the package is absent.
   */
  installed: boolean;
  /** Present only while Miso has a record of installing this package. */
  install?: InstallProgress;
}

/**
 * One note the transcription found.
 *
 * Times are seconds from the start of the source take, with the lead-in silence
 * Miso added already taken back off. `instrument` is the model's own guess and
 * is carried rather than used: an isolated drum stem came back labelled
 * acoustic guitar, so nothing in Miso decides anything from it.
 */
export interface MidiNote {
  pitch: number;
  start: number;
  end: number;
  instrument: string;
}

/**
 * A transcription: the MIDI file and the notes that are in it.
 *
 * Not an `Asset`, on purpose. A MIDI file cannot be played by the dock, drawn
 * as a waveform, exported as WAV or MP3, separated or mixed, and
 * music-metadata cannot read it at all. See the comment on the
 * `midi_artifacts` table.
 *
 * `notes` is what the preview plays. The `.mid` file is what you download, and
 * it is fetched separately rather than carried in this row.
 */
export interface MidiArtifact {
  id: string;
  projectId: string;
  sourceAssetId: string;
  jobId?: string;
  label: string;
  filename: string;
  bytes: number;
  noteCount: number;
  durationSeconds?: number;
  notes: MidiNote[];
  createdAt: string;
}

/** A model family and its precisions, one card on the catalog screen. */
export interface CatalogFamily {
  /**
   * What identifies this card, which is not always the spec family.
   *
   * One spec can produce more than one card: Stable Audio 3 ships its sound
   * effect packages in the same spec as its music ones, and they get a card of
   * their own so they are not folded away under eight other versions. Both
   * cards keep `family: 'stable_audio'`, because that is what the packages
   * actually belong to and what a task matches on. Only this field tells the
   * two cards apart.
   */
  id: string;
  /**
   * The spec family these packages belong to.
   *
   * Not unique across cards, and not a React key. A task names the families it
   * runs on and `installedPackages` matches against this, so changing it to
   * make a card unique would hide those packages from their own task.
   */
  family: string;
  displayName: string;
  summary: string;
  tasks: string[];
  languages: string[];
  packages: CatalogPackage[];
}

/**
 * Everything the catalog screen needs in one response.
 *
 * `live` says how much to trust the sizes and installed flags. Families are
 * listed either way, because the vendored specs are what exists and a backend
 * that cannot answer should not empty the screen.
 */
/**
 * The answer to a partial-download sweep. `removed` is undefined when the
 * server did not say how many directories it took, which is a wording change
 * away rather than a failure, so the UI reports it as done without a number.
 */
export interface CleanPartialsResult {
  removed: number | undefined;
  catalog: Catalog;
}

export interface Catalog {
  families: CatalogFamily[];
  live: 'ready' | 'scanning' | 'unavailable';
  unavailableReason?: 'management_disabled' | 'unreachable' | 'error';
  unavailableMessage?: string;
  /** The vendored spec commit, echoed so the UI never guesses which specs it is showing. */
  specVersion: string;
  /** The backend these sizes and installs describe. */
  backendUrl: string;
}

/** A project as the client sees it, with its rollup counts already summed. */
export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  assetCount: number;
  bytes: number;
}

export type AssetFormat = 'wav' | 'flac' | 'mp3' | 'm4a';
/**
 * Where a take came from.
 *
 * `mix` is a recombined set of stems. It is neither generated nor a stem:
 * audio.cpp never saw it, and it is a whole track rather than a part of one.
 */
export type AssetKind = 'source' | 'generated' | 'stem' | 'mix';

/**
 * One piece of audio. `peaks` is null until the browser that imported it, or a
 * later viewer, computes and uploads them. An asset without peaks is complete
 * and playable, it just has no waveform drawn yet.
 */
export interface Asset {
  id: string;
  projectId: string;
  kind: AssetKind;
  label: string;
  filename: string;
  format: AssetFormat;
  bytes: number;
  checksum: string;
  durationSeconds?: number;
  sampleRate?: number;
  channels?: number;
  peaks?: number[][];
  createdAt: string;
}

/**
 * One take as the library sees it: the audio, the project it lives in, and
 * what made it.
 *
 * This is deliberately not an `Asset`. Peaks are the reason. They are about
 * 23 KB of JSON per take and the library draws no waveforms, so a list of a
 * few hundred takes carrying them would be megabytes of data nothing reads.
 * `hasPeaks` is what the list actually needs, and the one take being played
 * is fetched whole through `GET /projects/:id/assets/:assetId`.
 *
 * `prompt` and `lyrics` are lifted out of the producing job's parameters so
 * the browser can search them without holding every job in every project.
 * They are absent on an imported take, which had no job.
 */
export interface LibraryTake {
  assetId: string;
  projectId: string;
  projectName: string;
  label: string;
  kind: AssetKind;
  format: AssetFormat;
  bytes: number;
  durationSeconds?: number;
  createdAt: string;
  /** Whether a waveform is stored. The peaks themselves are not sent. */
  hasPeaks: boolean;
  /** The task that produced this take, absent when nothing did. */
  taskId?: string;
  /** What the song was called when it was generated. */
  title?: string;
  prompt?: string;
  lyrics?: string;
}

/** A project together with its assets, newest first. */
export interface ProjectDetail {
  project: Project;
  assets: Asset[];
}

/**
 * What Miso is holding. Figures are summed from the recorded byte counts, not
 * measured by walking the directory: the count was taken during the upload
 * stream, so it is the same number, and a sum is cheap where a walk is not.
 */
export interface StorageUsage {
  totalBytes: number;
  projects: Project[];
}

/**
 * Where a job has got to.
 *
 * `staging` is its own state because uploading a source asset to audio.cpp
 * happens before any GPU work and fails for its own reasons, usually a backend
 * that went away. `cancelled` only ever applies to a job that had not started:
 * a GPU call in flight cannot be interrupted, so Miso does not pretend it can.
 */
export type JobState = 'queued' | 'staging' | 'running' | 'complete' | 'failed' | 'cancelled';

/**
 * What the guided prompt builder cannot get back from a finished job.
 *
 * The builder compiles chips and toggles into one sentence, and a sentence
 * cannot be taken apart into the chips it came from. Everything here is
 * therefore stored beside the job. Everything that survives compilation is not:
 * the tempo, the key, and the lyrics are all job parameters in their own right,
 * and reading them from two places would eventually mean reading two different
 * answers.
 */
export interface StudioState {
  /**
   * Style words as typed: "synthwave, warm analogue tape".
   *
   * Until 2026-09-12 this was a list of genre chips with a separate free text
   * box beside it. Both fold into this one field. Jobs written before then
   * still open in the builder, because the service converts the old shape on
   * the way in and again on the way back out.
   */
  style: string;
  mood: string;
  vocalMode: VocalMode;
  /** Words for the voice itself: raspy, airy, soulful. */
  vocalStyle: string;
}

/**
 * Who is singing.
 *
 * `duet` is a legacy value. The builder stopped offering it once it was clear
 * the models could not hold two voices apart, and nothing writes it any more,
 * but stored jobs still carry it so everything that reads a job still accepts
 * it. See VOCAL_MODES in src/client/lib/studio.ts.
 */
export type VocalMode = 'female' | 'male' | 'duet' | 'instrumental';

/** One queued or finished piece of work. */
export interface Job {
  id: string;
  projectId: string;
  /** Registry task id, for example generate.text2music. */
  taskId: string;
  /** The catalog package the task runs on, for example ace_step_turbo_q8_0. */
  modelId: string;
  /** The parameters the person chose, as the task registry validated them. */
  params: Record<string, unknown>;
  /** What the person called the song. The take is named after it. */
  title?: string;
  /** Present when the guided builder wrote this job, absent when the form did. */
  studio?: StudioState;
  /**
   * What the person wrote, when the prompt that ran was an expansion of it.
   *
   * Absent on a job whose prompt was sent as written, which is how a take shows
   * the idea as well as the paragraph the assistant made of it.
   */
  originalPrompt?: string;
  /**
   * When the queue was last cleared past this job.
   *
   * The row survives either way. It is the only record of the prompt, the
   * lyrics and the settings that made the take, and the take detail panel
   * reads it back. Clearing hides finished work from the queue, it never
   * deletes it.
   */
  dismissedAt?: string;
  state: JobState;
  error?: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  /** Assets this job produced. Empty until it completes. */
  outputAssetIds: string[];
  /**
   * Assets this job read, and what each one was to it.
   *
   * Empty for a task that reads nothing, which is every generation task. Also
   * empty when the take a job read has since been deleted, because the lineage
   * row is removed with the asset it points at. Those two cases look identical
   * here and are told apart by the task: `StudioTask.inputRoles` is non-empty
   * for a task that reads audio, so a job whose task reads audio and whose
   * inputs are empty had a source that is gone.
   */
  inputs: { assetId: string; role: string }[];
}

/** One parameter of a task, as the studio form renders it. */
export interface TaskField {
  name: string;
  label: string;
  kind: 'text' | 'lyrics' | 'number' | 'choice';
  required: boolean;
  min?: number;
  max?: number;
  step?: number;
  /** The only values a `choice` field accepts, in the order they are offered. */
  values?: { value: string; label: string }[];
  default?: string | number;
  help?: string;
  /** Shown inside the advanced drawer, closed until somebody opens it. */
  advanced?: boolean;
}

/**
 * A task the studio can offer, with the model family it runs on.
 *
 * Which packages of that family are installed is not in here on purpose. The
 * catalog endpoint already answers that, and it needs the backend, while this
 * list is the same whether the backend is up or not.
 */
export interface StudioTask {
  id: string;
  /**
   * Whether the studio offers the guided prompt builder for this task.
   *
   * The builder writes songs from a genre, a mood and a voice, so a task that
   * does not produce a song says no. The family alone cannot answer it: Stable
   * Audio writes both music and sound effects.
   */
  guidedPrompt: boolean;
  /**
   * Which page offers this task, when `inputRoles` would put it in the wrong
   * one.
   *
   * Absent for almost everything, and absent means the old rule: no input roles
   * puts a task on the create form, a source role puts it on the remix picker.
   * `sound` moves it to the sound page, which is where the two phase 7 tools
   * live. A task must land on exactly one of the three, and a route test checks
   * that none of them falls through the gaps.
   */
  surface?: 'sound';
  label: string;
  /**
   * The same task named as a thing rather than an action.
   *
   * `label` is how a tool is offered, which is usually an instruction:
   * "Repaint a section". The project page groups takes under headings, where
   * that reads as a command when it is only naming what sits below it, so a
   * heading uses this instead.
   */
  shortLabel: string;
  summary: string;
  /**
   * Spec families this task runs on.
   *
   * A list because separation is one task over three families, which all answer
   * the same request. Every generation task names exactly one. Package choice
   * does not read this: `packageIds` is the service's own answer and is
   * authoritative. The prompt builder reads the first entry, which is the only
   * entry on every task that has a prompt.
   */
  families: string[];
  /**
   * Whether this family can sing.
   *
   * `required` means it cannot produce an instrumental, `never` means it cannot
   * produce a vocal, and `both` means the choice is the person's. The builder
   * locks its vocal control to match, rather than offering a setting the model
   * will ignore. Declared by the task registry, not by the vendored spec, for
   * the reason recorded in DOCS/MEMORY.md.
   */
  vocals: 'both' | 'required' | 'never';
  /**
   * The catalog packages this task can run on, by id.
   *
   * Usually every package of the family, because they are precisions of one
   * model. Stable Audio is the exception: its SFX packages belong to a
   * different task, so they are not in here and the studio does not offer them.
   * Which of these are installed still comes from the catalog endpoint.
   */
  packageIds: string[];
  /**
   * Source audio this task reads, by role. Empty means it generates from
   * nothing.
   *
   * This is what separates the Create form from the remix tools. Both draw
   * their fields the same way and both run on the same families, so without it
   * the create column offers every remix route as though it were another model
   * to generate with.
   */
  inputRoles: string[];
  fields: TaskField[];
}
