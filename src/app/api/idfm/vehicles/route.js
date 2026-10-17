import { NextResponse } from 'next/server';
import { fetchStopDepartures } from '@/lib/idfm-client';
import { parseDepartures } from '@/lib/siri-parser';
import { fetchLineData } from '@/lib/line-data';
import { estimateVehiclePositions } from '@/lib/position-interpolator';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const linesParam = searchParams.get('lines');
  const stopsParam = searchParams.get('stops');
  const stopCoordsParam = searchParams.get('stopCoords'); // Format: "lat1,lng1;lat2,lng2"
  const lines = linesParam ? linesParam.split(',') : [];
  const stops = stopsParam ? stopsParam.split(',') : [];

  // Parse stop coordinates
  const stopCoordsList = stopCoordsParam
    ? stopCoordsParam.split(';').map(coord => {
        const [lat, lng] = coord.split(',').map(Number);
        return { lat, lng };
      })
    : [];

  if (stops.length === 0) {
    return NextResponse.json({
      success: true,
      data: [],
      count: 0,
      message: 'No stops provided for vehicle tracking',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    // Fetch line data (shape + ordered stops) for position estimation
    const lineDataMap = new Map();
    await Promise.all(
      lines.map(async (lineId) => {
        try {
          const lineData = await fetchLineData(lineId);
          if (lineData.shape.length > 0 || lineData.stops.length > 0) {
            lineDataMap.set(lineId, lineData);
          }
        } catch (err) {
          console.error(`Error fetching data for line ${lineId}:`, err.message);
        }
      })
    );

    // Fetch departures from each stop and estimate vehicle positions
    const allVehicles = new Map();

    await Promise.all(
      stops.map(async (stopId, index) => {
        try {
          const siriResponse = await fetchStopDepartures(stopId);
          const departures = parseDepartures(siriResponse);

          // Filter departures by tracked lines
          const filteredDepartures = departures.filter(d =>
            lines.length === 0 || lines.includes(d.lineRef)
          );

          // Get stop coordinates
          const stopCoords = stopCoordsList[index] || null;

          // Estimate positions for vehicles heading to this stop
          const vehicles = estimateVehiclePositions(
            filteredDepartures,
            lineDataMap,
            stopId,
            stopCoords
          );

          // Merge vehicles, avoiding duplicates
          vehicles.forEach(v => {
            const existingVehicle = allVehicles.get(v.id);
            // Keep the one with the smallest minutesUntil (closest to a stop)
            if (!existingVehicle || v.minutesUntil < existingVehicle.minutesUntil) {
              allVehicles.set(v.id, v);
            }
          });
        } catch (err) {
          console.error(`Error fetching vehicles for stop ${stopId}:`, err.message);
        }
      })
    );

    const vehicleList = Array.from(allVehicles.values());

    return NextResponse.json({
      success: true,
      data: vehicleList,
      count: vehicleList.length,
      linesWithData: Array.from(lineDataMap.keys()),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('IDFM API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch vehicle positions',
        message: error.message
      },
      { status: 500 }
    );
  }
}
