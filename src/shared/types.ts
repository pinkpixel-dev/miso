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
 * what a restarted audio.cpp looks like. Miso offers to resume rather than
 * resuming on its own, because this is a multi-gigabyte download.
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
