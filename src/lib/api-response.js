import { NextResponse } from 'next/server';
import favorites from '@/config/favorites.json';
import { getProfile, scopeConfig } from './profiles';

const NO_STORE = { 'Cache-Control': 'no-store' };

const STATUS_BY_CODE = { NO_API_KEY: 503, TIMEOUT: 504, NETWORK: 502, UPSTREAM: 502 };
const MESSAGE_BY_CODE = {
  NO_API_KEY: 'Clé API IDFM non configurée sur le serveur',
  TIMEOUT: 'Le service IDFM ne répond pas',
  NETWORK: 'Le service IDFM est injoignable',
  UPSTREAM: 'Le service IDFM a renvoyé une erreur',
};

export function successResponse(payload) {
  return NextResponse.json(
    { success: true, ...payload, timestamp: new Date().toISOString() },
    { headers: NO_STORE }
  );
}

/** Every configured stop failed: no data at all to show. */
export function failureResponse(errors) {
  const code = errors[0]?.code ?? 'UPSTREAM';
  return NextResponse.json(
    {
      success: false,
      error: MESSAGE_BY_CODE[code] ?? MESSAGE_BY_CODE.UPSTREAM,
      errors,
      timestamp: new Date().toISOString(),
    },
    { status: STATUS_BY_CODE[code] ?? 502, headers: NO_STORE }
  );
}

export function internalErrorResponse(error) {
  console.error('[api] unexpected error:', error);
  return NextResponse.json(
    { success: false, error: 'Erreur interne du serveur', timestamp: new Date().toISOString() },
    { status: 500, headers: NO_STORE }
  );
}

export function badRequestResponse(message) {
  return NextResponse.json(
    { success: false, error: message, timestamp: new Date().toISOString() },
    { status: 400, headers: NO_STORE }
  );
}

/**
 * Resolve ?profile= to a config scoped to that profile.
 * @returns {{ config: Object } | { response: NextResponse }}
 */
export function resolveProfile(request, config = favorites) {
  const id = new URL(request.url).searchParams.get('profile');
  const profile = getProfile(config, id);
  if (!profile) {
    const known = (config.profiles ?? []).map((p) => p.id).join(', ');
    return { response: badRequestResponse(`Profil inconnu : ${id}. Profils disponibles : ${known}`) };
  }
  return { config: scopeConfig(config, profile) };
}
