import { getDepartures } from '@/lib/departures-service';
import { failureResponse, internalErrorResponse, resolveProfile, successResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

/**
 * GET /api/idfm/departures?profile=aller|retour
 * Next departures for every stop of the profile (default: the first one).
 */
export async function GET(request) {
  const { config, response } = resolveProfile(request);
  if (response) return response;

  try {
    const result = await getDepartures({ config });
    if (result.allFailed) {
      return failureResponse(result.errors);
    }
    return successResponse({
      profile: config.profileId,
      data: result.stops,
      stale: result.stale,
      errors: result.errors,
    });
  } catch (error) {
    return internalErrorResponse(error);
  }
}
