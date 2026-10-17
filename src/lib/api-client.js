/**
 * Browser-side helper for our own API routes.
 */

// Set by public/sw.js when it answers with a saved response because the
// network failed, was too slow or returned an error.
export const SW_CACHE_HEADER = 'x-drancybus-cache';

export async function fetchApi(path, { signal } = {}) {
  let response;
  try {
    response = await fetch(path, {
      signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error('Connexion au serveur impossible');
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok || !body?.success) {
    throw new Error(body?.error || `Erreur serveur (HTTP ${response.status})`);
  }

  if (response.headers.get(SW_CACHE_HEADER) === 'hit') {
    return { ...body, stale: true, fromCache: true };
  }
  return body;
}
