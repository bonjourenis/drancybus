import { getDepartures } from '@/lib/departures-service';
import { failureResponse, internalErrorResponse, successResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

/**
 * GET /api/idfm/departures
 * Next departures for every stop configured in src/config/favorites.json.
 */
export async function GET() {
  try {
    const result = await getDepartures();
    if (result.allFailed) {
      return failureResponse(result.errors);
    }
    return successResponse({ data: result.stops, stale: result.stale, errors: result.errors });
  } catch (error) {
    return internalErrorResponse(error);
  }
}
