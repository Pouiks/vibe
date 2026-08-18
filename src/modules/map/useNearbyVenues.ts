"use client";
import { useState, useCallback, useRef } from 'react';
import type { VenueGeoJSON } from './types';

interface Bounds {
  sw_lng: number;
  sw_lat: number;
  ne_lng: number;
  ne_lat: number;
}

export function useNearbyVenues() {
  const [geojson, setGeojson] = useState<VenueGeoJSON | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchByBounds = useCallback(async (bounds: Bounds) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        sw_lng: bounds.sw_lng.toString(),
        sw_lat: bounds.sw_lat.toString(),
        ne_lng: bounds.ne_lng.toString(),
        ne_lat: bounds.ne_lat.toString(),
      });
      const res = await fetch(`/api/venues/nearby?${params}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('Failed to fetch venues');
      const data: VenueGeoJSON = await res.json();
      setGeojson(data);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Error fetching nearby venues:', err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchByLocation = useCallback(async (lng: number, lat: number, radiusMeters = 5000) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        lng: lng.toString(),
        lat: lat.toString(),
        radius: radiusMeters.toString(),
      });
      const res = await fetch(`/api/venues/nearby?${params}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('Failed to fetch venues');
      const data: VenueGeoJSON = await res.json();
      setGeojson(data);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Error fetching nearby venues:', err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return { geojson, loading, fetchByBounds, fetchByLocation };
}
