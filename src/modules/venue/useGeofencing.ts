"use client";
import { useEffect, useState } from 'react';
import { useVibeStore } from '@/core/store/useVibeStore';

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

export function useGeofencing(venueLat?: number, venueLng?: number) {
  const setGPSStatus = useVibeStore((state) => state.setGPSStatus);
  const isBypassPayment = useVibeStore((state) => state.isBypassPayment); // For POC demo
  const [distance, setDistance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (venueLat === undefined || venueLng === undefined) return;

    if (!navigator.geolocation) {
       setError("Geolocation not supported");
       if (isBypassPayment) setGPSStatus(true); // Bypass for POC
       return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const dist = getDistanceInMeters(
          position.coords.latitude, 
          position.coords.longitude, 
          venueLat, 
          venueLng
        );
        setDistance(dist);
        setGPSStatus(dist <= 100); // 100 meters radius
      },
      (err) => {
        setError(err.message);
        if (isBypassPayment) setGPSStatus(true); // Always allow in POC if GPS fails but bypassed
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [venueLat, venueLng, setGPSStatus, isBypassPayment]);

  return { distance, error };
}
