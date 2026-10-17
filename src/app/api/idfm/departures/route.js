import { NextResponse } from 'next/server';
import { fetchStopDepartures } from '@/lib/idfm-client';
import { parseDepartures } from '@/lib/siri-parser';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const stopId = searchParams.get('stopId');
  const lineId = searchParams.get('lineId');

  if (!stopId) {
    return NextResponse.json(
      { error: 'stopId parameter is required' },
      { status: 400 }
    );
  }

  try {
    const siriResponse = await fetchStopDepartures(stopId, lineId);
    const departures = parseDepartures(siriResponse);

    return NextResponse.json({
      success: true,
      data: departures,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('IDFM API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch departures',
        message: error.message
      },
      { status: 500 }
    );
  }
}
