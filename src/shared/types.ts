/**
 * Types shared by the Miso service and the Miso client.
 *
 * Nothing here may import from either side. If a type is only meaningful to one
 * of them, it belongs over there instead.
 */

/** Settings the user can change, stored in the Miso database. */
export interface Settings {
  /** Base URL of the audio.cpp server, no trailing slash. */
  backendUrl: string;
}

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

/** A model family and its precisions, one card on the catalog screen. */
export interface CatalogFamily {
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
