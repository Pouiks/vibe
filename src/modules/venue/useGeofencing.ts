"use client";
import { useEffect, useRef, useState, useCallback } from 'react';
import { useVibeStore } from '@/core/store/useVibeStore';

export const GEOFENCE_RADIUS_M = 100;
// Without a successful GPS fix within this window, "sur place" is revoked:
// presence at the venue must be currently verifiable, never assumed.
export const FIX_STALE_MS = 60 * 1000;
// One position check at a time, GPS idle in between. Must stay below
// FIX_STALE_MS so a verified status is always backed by a fresh fix.
export const FIX_INTERVAL_MS = 45 * 1000;

export function isWithinGeofence(distanceMeters: number): boolean {
  return distanceMeters <= GEOFENCE_RADIUS_M;
}

export function isFixStale(lastFixAt: number, now: number): boolean {
  return now - lastFixAt > FIX_STALE_MS;
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

export type GeoPermission = 'granted' | 'prompt' | 'denied' | 'unknown';

// Side-effect hook: keeps store.writePermission in sync with GPS proximity.
// No cleanup reset: writePermission must survive the venue page unmounting,
// otherwise navigating to /event/create would revoke it mid-flow. In exchange,
// each venue mount starts unverified (reset below) so the status of venue A
// never leaks onto venue B.
//
// Battery & consent rules: the browser permission prompt is never triggered
// by page load — polling only runs if geolocation is already granted (map,
// previous visit…) or after requestPresence() (user gesture). One fix every
// FIX_INTERVAL_MS, GPS idle in between, everything paused when the tab is
// hidden.
export function useGeofencing(venueLat?: number, venueLng?: number) {
  const setGPSStatus = useVibeStore((state) => state.setGPSStatus);
  const [permission, setPermission] = useState<GeoPermission>('unknown');
  const checkRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (venueLat === undefined || venueLng === undefined) return;

    // Unverified until a GPS fix proves presence at THESE coordinates
    setGPSStatus(false);

    if (!navigator.geolocation) return;

    let cancelled = false;
    let lastFixAt = 0;
    let intervalId: number | undefined;
    let permStatus: PermissionStatus | null = null;

    const checkPosition = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) return;
          lastFixAt = Date.now();
          const dist = getDistanceInMeters(
            position.coords.latitude,
            position.coords.longitude,
            venueLat,
            venueLng
          );
          setGPSStatus(isWithinGeofence(dist));
        },
        (err) => {
          if (cancelled) return;
          console.warn('[Geofencing]', err.message);
          if (err.code === err.PERMISSION_DENIED) {
            setPermission('denied');
            stop();
          }
          // Denied = we can no longer vouch for presence. Transient errors
          // (timeout, no fix) tolerate a short gap to avoid flapping, then revoke.
          if (err.code === err.PERMISSION_DENIED || isFixStale(lastFixAt, Date.now())) {
            setGPSStatus(false);
          }
        },
        // maximumAge: reuse a recent fix (e.g. from the map) instead of waking
        // the GPS chip again
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
      );
    };

    const start = () => {
      if (intervalId !== undefined) return;
      checkPosition();
      intervalId = window.setInterval(checkPosition, FIX_INTERVAL_MS);
    };
    const stop = () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };
    // requestPresence démarre le polling complet : indispensable quand l'API
    // Permissions est absente (pas d'événement onchange pour prendre le relai
    // après l'accord de l'utilisateur).
    checkRef.current = start;

    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((status) => {
        if (cancelled) return;
        permStatus = status;
        const sync = () => {
          if (cancelled) return;
          setPermission(status.state);
          if (status.state === 'granted') {
            start();
          } else {
            stop();
            setGPSStatus(false);
          }
        };
        sync();
        status.onchange = sync;
      }).catch(() => { if (!cancelled) setPermission('prompt'); });
    } else {
      // API Permissions absente (vieux Safari) : impossible de sonder sans
      // déclencher la popup. On expose 'prompt' pour que l'UI propose
      // l'activation volontaire, seule voie d'entrée dans ce cas.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPermission('prompt');
    }

    // Tab hidden: GPS fully off. Back to foreground: revoke if the last fix
    // is stale, then re-verify within seconds.
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
      } else if (permStatus?.state === 'granted') {
        if (isFixStale(lastFixAt, Date.now())) setGPSStatus(false);
        start();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      stop();
      if (permStatus) permStatus.onchange = null;
      document.removeEventListener('visibilitychange', handleVisibility);
      checkRef.current = null;
    };
  }, [venueLat, venueLng, setGPSStatus]);

  // User gesture: may show the browser prompt once. If granted, the
  // permission change listener starts the regular polling.
  const requestPresence = useCallback(() => {
    checkRef.current?.();
  }, []);

  return { permission, requestPresence };
}
