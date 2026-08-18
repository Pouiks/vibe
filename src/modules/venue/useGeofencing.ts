"use client";
import { useEffect } from 'react';
import { useVibeStore } from '@/core/store/useVibeStore';

export const GEOFENCE_RADIUS_M = 100;

export function isWithinGeofence(distanceMeters: number): boolean {
  return distanceMeters <= GEOFENCE_RADIUS_M;
}

export function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // radius of Earth in metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

// Side-effect hook: keeps store.writePermission in sync with GPS proximity.
// No cleanup reset: writePermission must survive the venue page unmounting,
// otherwise navigating to /event/create would revoke it mid-flow.
export function useGeofencing(venueLat?: number, venueLng?: number) {
  const setGPSStatus = useVibeStore((state) => state.setGPSStatus);

  useEffect(() => {
    if (venueLat === undefined || venueLng === undefined) return;
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const dist = getDistanceInMeters(
          position.coords.latitude,
          position.coords.longitude,
          venueLat,
          venueLng
        );
        setGPSStatus(isWithinGeofence(dist));
      },
      (err) => {
        console.warn('[Geofencing]', err.message);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [venueLat, venueLng, setGPSStatus]);
}
