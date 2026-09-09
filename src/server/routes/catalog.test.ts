import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../../shared/types.ts';
import * as client from '../audiocpp/client.ts';
import { clearLiveStatusCache } from '../audiocpp/packageStatus.ts';
import { catalogRoutes } from './catalog.ts';

vi.mock('../audiocpp/client.ts', { spy: true });

function app(): Hono {
  const instance = new Hono();
  instance.route('/api', catalogRoutes);
  return instance;
}

afterEach(() => {
  clearLiveStatusCache();
  vi.restoreAllMocks();
});

describe('GET /api/catalog', () => {
  it('returns the catalog with live sizes', async () => {
    vi.spyOn(client, 'fetchPackageSizes').mockResolvedValue({
      ok: true,
      value: { scanning: false, packages: [] },
    });

    const response = await app().request('/api/catalog');
    expect(response.status).toBe(200);

    const body = (await response.json()) as Catalog;
    expect(body.families.length).toBeGreaterThan(0);
    expect(body.live).toBe('ready');
    expect(body.specVersion).toMatch(/^[0-9a-f]{40}$/);
  });

  it('still lists families when management is switched off', async () => {
    vi.spyOn(client, 'fetchPackageSizes').mockResolvedValue({
      ok: false,
      reason: 'management_disabled',
      message: 'no',
    });

    const body = (await (await app().request('/api/catalog')).json()) as Catalog;
    expect(body.live).toBe('unavailable');
    expect(body.unavailableReason).toBe('management_disabled');
    expect(body.families.length).toBeGreaterThan(0);
  });
});

describe('POST /api/catalog/packages/:id/install', () => {
  it('rejects a package no vendored spec declares', async () => {
    const response = await app().request('/api/catalog/packages/not_a_package/install', { method: 'POST' });
    expect(response.status).toBe(404);
  });

  it('reports the reason when the backend refuses the install', async () => {
    vi.spyOn(client, 'startInstall').mockResolvedValue({
      ok: false,
      reason: 'management_disabled',
      message: 'This server was started without --ui-management, so it cannot manage models.',
    });

    const id = await firstPackageId();
    const response = await app().request(`/api/catalog/packages/${id}/install`, { method: 'POST' });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('ui-management') });
  });
});

async function firstPackageId(): Promise<string> {
  const { loadSpecs } = await import('../catalog/registry.ts');
  const id = loadSpecs()[0]?.packages[0]?.id;
  if (!id) throw new Error('No vendored package to test with');
  return id;
}
