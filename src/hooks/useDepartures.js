'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for fetching and auto-refreshing departure data
 * @param {Array} stops - Array of stop configurations
 * @param {number} refreshInterval - Refresh interval in ms (default: 60000)
 * @returns {Object} Departures data and status
 */
export function useDepartures(stops, refreshInterval = 60000) {
  const [departures, setDepartures] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAllDepartures = useCallback(async () => {
    if (!stops || stops.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const results = {};

      await Promise.all(
        stops.map(async (stop) => {
          const stopDepartures = [];

          // Fetch for each line at this stop
          for (const line of stop.lines) {
            try {
              const params = new URLSearchParams({
                stopId: stop.id,
                lineId: line.lineId,
              });

              const response = await fetch(`/api/idfm/departures?${params}`);
              const data = await response.json();

              if (data.success && data.data) {
                // Filter by direction if specified
                // Supports: directionRef (exact match), excludeDirectionRef (exclude),
                // or direction/excludeDirection (partial match on destination name)
                let filtered = data.data;
                if (line.directionRef) {
                  const refs = Array.isArray(line.directionRef) ? line.directionRef : [line.directionRef];
                  filtered = data.data.filter(d => refs.includes(d.destinationRef));
                } else if (line.excludeDirectionRef) {
                  const excludeRefs = Array.isArray(line.excludeDirectionRef) ? line.excludeDirectionRef : [line.excludeDirectionRef];
                  filtered = data.data.filter(d => !excludeRefs.includes(d.destinationRef));
                } else if (line.direction) {
                  // Filter by destination name (partial match, case-insensitive)
                  const dirs = Array.isArray(line.direction) ? line.direction : [line.direction];
                  filtered = data.data.filter(d =>
                    dirs.some(dir => d.destination?.toLowerCase().includes(dir.toLowerCase()))
                  );
                } else if (line.excludeDirection) {
                  // Exclude by destination name (partial match, case-insensitive)
                  const excludeDirs = Array.isArray(line.excludeDirection) ? line.excludeDirection : [line.excludeDirection];
                  filtered = data.data.filter(d =>
                    !excludeDirs.some(dir => d.destination?.toLowerCase().includes(dir.toLowerCase()))
                  );
                }
                stopDepartures.push(...filtered);
              }
            } catch (err) {
              console.error(`Error fetching departures for ${stop.name}:`, err);
            }
          }

          // Merge departures and lines for stops with the same ID
          if (results[stop.id]) {
            results[stop.id].stop.lines = [
              ...results[stop.id].stop.lines,
              ...stop.lines,
            ];
            results[stop.id].departures = [
              ...results[stop.id].departures,
              ...stopDepartures,
            ].sort((a, b) => (a.minutesUntil ?? 999) - (b.minutesUntil ?? 999))
             .slice(0, 5);
          } else {
            results[stop.id] = {
              stop: { ...stop, lines: [...stop.lines] },
              departures: stopDepartures.slice(0, 5),
            };
          }
        })
      );

      setDepartures(results);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Error fetching departures:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [stops]);

  useEffect(() => {
    fetchAllDepartures();

    const interval = setInterval(fetchAllDepartures, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchAllDepartures, refreshInterval]);

  return {
    departures,
    loading,
    error,
    lastUpdated,
    refresh: fetchAllDepartures,
  };
}
