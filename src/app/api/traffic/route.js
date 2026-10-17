import { getTraffic } from '@/lib/traffic-service';
import { internalErrorResponse, resolveProfile, successResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

/**
 * GET /api/traffic?profile=aller|retour
 * Live road traffic on the profile's routes. Without TOMTOM_API_KEY every
 * route reports status "not-configured".
 */
export async function GET(request) {
  const { config, response } = resolveProfile(request);
  if (response) return response;

  try {
    const result = await getTraffic({ config });
    return successResponse({ profile: config.profileId, configured: result.configured, data: result.routes });
  } catch (error) {
    return internalErrorResponse(error);
  }
}
