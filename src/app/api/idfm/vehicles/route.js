import { getVehicles } from '@/lib/vehicles-service';
import { failureResponse, internalErrorResponse, resolveProfile, successResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

/**
 * GET /api/idfm/vehicles?profile=aller|retour
 * Estimated positions of the vehicles heading to the profile's stops.
 */
export async function GET(request) {
  const { config, response } = resolveProfile(request);
  if (response) return response;

  try {
    const result = await getVehicles({ config });
    if (result.allFailed) {
      return failureResponse(result.errors);
    }
    return successResponse({
      profile: config.profileId,
      data: result.vehicles,
      count: result.vehicles.length,
      unplaced: result.unplaced,
      stale: result.stale,
      errors: result.errors,
      timetable: result.timetable,
    });
  } catch (error) {
    return internalErrorResponse(error);
  }
}
