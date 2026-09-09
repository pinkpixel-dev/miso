import type { ApiError, BackendStatus, Catalog, Settings } from '../../shared/types.ts';

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
  getSettings: () => request<Settings>('/settings'),

  saveSettings: (patch: Partial<Settings>) =>
    request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(patch) }),

  /** Omit `url` to check the saved backend, pass one to test before saving. */
  getBackendStatus: (url?: string) =>
    request<BackendStatus>(`/backend/status${url ? `?url=${encodeURIComponent(url)}` : ''}`),

  getCatalog: () => request<Catalog>('/catalog'),

  installPackage: (id: string) =>
    request<Catalog>(`/catalog/packages/${encodeURIComponent(id)}/install`, { method: 'POST' }),

  stopInstall: (id: string) =>
    request<Catalog>(`/catalog/packages/${encodeURIComponent(id)}/install/stop`, { method: 'POST' }),

  cleanPartial: (id: string) =>
    request<Catalog>(`/catalog/packages/${encodeURIComponent(id)}/clean`, { method: 'POST' }),

  removePackage: (id: string) =>
    request<Catalog>(`/catalog/packages/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
