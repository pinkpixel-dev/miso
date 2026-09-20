import type {
  ApiError,
  Asset,
  BackendStatus,
  Catalog,
  CleanPartialsResult,
  Job,
  LibraryTake,
  LyricsDraft,
  MidiArtifact,
  Project,
  ProjectDetail,
  PromptSuggestion,
  SavedPrompt,
  SavedPromptKind,
  Settings,
  SettingsPatch,
  StorageUsage,
  StudioState,
  StudioTask,
} from '../../shared/types.ts';

/**
 * Every call the client makes goes through here, and every one targets the Miso
 * service. The client never calls audio.cpp directly: it may be on another
 * machine, and stem responses can be hundreds of megabytes.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    let message = `Request failed with HTTP ${response.status}`;
    try {
      const body = (await response.json()) as ApiError;
      message = body.detail ? `${body.error}: ${body.detail}` : body.error;
    } catch {
      // Response was not JSON. The status line is all we have.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export const api = {
  /**
   * Sums a separation's stems back into one take.
   *
   * The gains are what you can hear, solo and mute already applied, so the mix
   * that is saved is the mix that was playing.
   */
  mixStems: (projectId: string, jobId: string, gains: Record<string, number>) =>
    request<{ asset: Asset; clipped: number }>(
      `/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/mix`,
      { method: 'POST', body: JSON.stringify({ gains }) },
    ),

  getSettings: () => request<Settings>('/settings'),

  saveSettings: (patch: SettingsPatch) =>
    request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(patch) }),

  /** Omit `url` to check the saved backend, pass one to test before saving. */
  getBackendStatus: (url?: string) =>
    request<BackendStatus>(`/backend/status${url ? `?url=${encodeURIComponent(url)}` : ''}`),

  getCatalog: () => request<Catalog>('/catalog'),

  installPackage: (id: string) =>
    request<Catalog>(`/catalog/packages/${encodeURIComponent(id)}/install`, { method: 'POST' }),

  stopInstall: (id: string) =>
    request<Catalog>(`/catalog/packages/${encodeURIComponent(id)}/install/stop`, { method: 'POST' }),

  /** Sweeps abandoned downloads for every package at once, not one model. */
  cleanPartials: () => request<CleanPartialsResult>('/catalog/partials/clean', { method: 'POST' }),

  removePackage: (id: string) =>
    request<Catalog>(`/catalog/packages/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getProjects: () => request<Project[]>('/projects'),

  createProject: (name: string) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify({ name }) }),

  getProject: (id: string) => request<ProjectDetail>(`/projects/${encodeURIComponent(id)}`),

  /** Every take across every project, metadata only. Peaks are not included. */
  getLibrary: () => request<LibraryTake[]>('/library'),

  renameProject: (id: string, name: string) =>
    request<Project>(`/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  deleteProject: (id: string) =>
    request<Project[]>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  setAssetPeaks: (projectId: string, assetId: string, peaks: number[][]) =>
    request<Asset>(
      `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/peaks`,
      { method: 'PUT', body: JSON.stringify({ peaks }) },
    ),

  /** Asks the service to read a stored WAV's waveform. Refuses other formats. */
  readAssetPeaks: (projectId: string, assetId: string) =>
    request<Asset>(
      `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/peaks/read`,
      { method: 'POST' },
    ),

  /** One take with its peaks, for handing a library take to the player. */
  getAsset: (projectId: string, assetId: string) =>
    request<Asset>(
      `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`,
    ),

  renameAsset: (projectId: string, assetId: string, label: string) =>
    request<Asset>(
      `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`,
      { method: 'PATCH', body: JSON.stringify({ label }) },
    ),

  deleteAsset: (projectId: string, assetId: string) =>
    request<Asset[]>(
      `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`,
      { method: 'DELETE' },
    ),

  getStorage: () => request<StorageUsage>('/storage'),

  getTasks: () => request<StudioTask[]>('/tasks'),

  getJobs: (projectId: string) => request<Job[]>(`/projects/${encodeURIComponent(projectId)}/jobs`),

  createJob: (
    projectId: string,
    body: {
      taskId: string;
      modelId: string;
      params: Record<string, string | number>;
      title?: string;
      studio?: StudioState;
      originalPrompt?: string;
      inputs?: { assetId: string; role: string }[];
    },
  ) =>
    request<Job>(`/projects/${encodeURIComponent(projectId)}/jobs`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  cancelJob: (projectId: string, jobId: string) =>
    request<Job>(`/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`, {
      method: 'DELETE',
    }),

  /**
   * Clears the queue by hiding finished jobs. Answers with the whole list,
   * hidden rows included, because nothing was deleted.
   */
  dismissJobs: (projectId: string) =>
    request<Job[]>(`/projects/${encodeURIComponent(projectId)}/jobs/dismiss`, { method: 'POST' }),

  /** Asks the configured language model for a lyric sheet and a title. */
  writeLyrics: (body: { description: string; studio?: StudioState }) =>
    request<LyricsDraft>('/lyrics/write', { method: 'POST', body: JSON.stringify(body) }),

  /** Asks for a richer prompt. Offered, never applied. */
  enhancePrompt: (body: { prompt: string; studio?: StudioState }) =>
    request<PromptSuggestion>('/lyrics/enhance', { method: 'POST', body: JSON.stringify(body) }),

  getSaved: (kind?: SavedPromptKind) =>
    request<SavedPrompt[]>(`/saved${kind ? `?kind=${kind}` : ''}`),

  /** Saving over a name replaces what was under it. */
  savePrompt: (body: { kind: SavedPromptKind; name: string; body: string }) =>
    request<SavedPrompt>('/saved', { method: 'POST', body: JSON.stringify(body) }),

  deleteSaved: (id: string) =>
    request<SavedPrompt[]>(`/saved/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /** Every transcription in a project, newest first, with its notes. */
  getMidi: (projectId: string) =>
    request<MidiArtifact[]>(`/projects/${encodeURIComponent(projectId)}/midi`),

  /** Answers with what is left, the same way deleting a saved prompt does. */
  deleteMidi: (projectId: string, midiId: string) =>
    request<MidiArtifact[]>(
      `/projects/${encodeURIComponent(projectId)}/midi/${encodeURIComponent(midiId)}`,
      { method: 'DELETE' },
    ),

  /** Frees every model on the backend, for when the GPU is wanted elsewhere. */
  unloadModels: () => request<{ unloaded: boolean }>('/backend/unload', { method: 'POST' }),
};

/**
 * Addresses rather than calls. An <audio> element and a download link need a
 * URL, not a promise.
 */
export function audioUrl(projectId: string, assetId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/audio`;
}

export function downloadUrl(projectId: string, assetId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/download`;
}

/** A transcription's MIDI file, for a download link. */
export function midiDownloadUrl(projectId: string, midiId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/midi/${encodeURIComponent(midiId)}/download`;
}

/** Every take one job produced, in one zip. Separation is what this is for. */
export function outputsZipUrl(projectId: string, jobId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/outputs.zip`;
}
