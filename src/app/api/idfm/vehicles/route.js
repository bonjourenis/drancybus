import { getVehicles } from '@/lib/vehicles-service';
import { failureResponse, internalErrorResponse, successResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

/**
 * GET /api/idfm/vehicles
 * Estimated positions of the vehicles heading to the configured stops.
 */
export async function GET() {
  try {
    const result = await getVehicles();
    if (result.allFailed) {
      return failureResponse(result.errors);
    }
    return successResponse({
      data: result.vehicles,
      count: result.vehicles.length,
      unplaced: result.unplaced,
      stale: result.stale,
      errors: result.errors,
    });
  } catch (error) {
    return internalErrorResponse(error);
  }
}
