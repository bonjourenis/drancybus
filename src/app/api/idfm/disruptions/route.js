import { getDisruptions } from '@/lib/disruptions-service';
import { failureResponse, internalErrorResponse, successResponse } from '@/lib/api-response';
import { IdfmApiError, safeErrorMessage } from '@/lib/idfm-client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/idfm/disruptions
 * Current and upcoming (7 days) disruptions for every tracked line.
 */
export async function GET() {
  try {
    const result = await getDisruptions();
    return successResponse({
      data: result.lines,
      sourceUpdatedAt: result.sourceUpdatedAt,
      fetchedAt: result.fetchedAt,
      stale: result.stale,
    });
  } catch (error) {
    if (error instanceof IdfmApiError) {
      console.error(`[disruptions] ${error.message}`);
      return failureResponse([{ message: safeErrorMessage(error), code: error.code }]);
    }
    return internalErrorResponse(error);
  }
}
