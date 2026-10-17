'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for fetching and auto-refreshing vehicle positions
 * @param {Array} lines - Array of line configurations
 * @param {Array} stops - Array of stop configurations (needed to query the API)
 * @param {number} refreshInterval - Refresh interval in ms (default: 60000)
 * @returns {Object} Vehicle positions and status
 */
export function useVehicles(lines, stops = [], refreshInterval = 60000) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchVehicles = useCallback(async () => {
    if (!stops || stops.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const lineIds = lines.map(l => l.lineId).join(',');
      const stopIds = stops.map(s => s.id).join(',');
      // Include stop coordinates for position estimation
      const stopCoords = stops
        .filter(s => s.coordinates)
        .map(s => `${s.coordinates.lat},${s.coordinates.lng}`)
        .join(';');

      let url = `/api/idfm/vehicles?lines=${lineIds}&stops=${encodeURIComponent(stopIds)}`;
      if (stopCoords) {
        url += `&stopCoords=${encodeURIComponent(stopCoords)}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setVehicles(data.data || []);
        setLastUpdated(new Date());
        setError(null);
      } else {
        throw new Error(data.message || 'Failed to fetch vehicles');
      }
    } catch (err) {
      console.error('Error fetching vehicles:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [lines, stops]);

  useEffect(() => {
    fetchVehicles();

    const interval = setInterval(fetchVehicles, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchVehicles, refreshInterval]);

  return {
    vehicles,
    loading,
    error,
    lastUpdated,
    refresh: fetchVehicles,
  };
}
