import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchApi } from '../api-client';

const respond = (body, init = {}) => vi.fn(async () => new Response(JSON.stringify(body), init));

afterEach(() => vi.unstubAllGlobals());

describe('fetchApi', () => {
  it('returns the body of a successful response', async () => {
    vi.stubGlobal('fetch', respond({ success: true, data: [1], stale: false }));
    expect(await fetchApi('/api/x')).toEqual({ success: true, data: [1], stale: false });
  });

  it('flags a response replayed by the service worker as stale and cached', async () => {
    vi.stubGlobal('fetch', respond({ success: true, data: [1], stale: false }, { headers: { 'x-drancybus-cache': 'hit' } }));
    expect(await fetchApi('/api/x')).toEqual({ success: true, data: [1], stale: true, fromCache: true });
  });

  it('surfaces the server message on errors and a generic one when unreachable', async () => {
    vi.stubGlobal('fetch', respond({ success: false, error: 'Profil inconnu' }, { status: 400 }));
    await expect(fetchApi('/api/x')).rejects.toThrow('Profil inconnu');

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(fetchApi('/api/x')).rejects.toThrow('Connexion au serveur impossible');
  });
});
