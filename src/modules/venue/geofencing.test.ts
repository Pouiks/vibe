import { describe, it, expect } from 'vitest';
import { getDistanceInMeters, isWithinGeofence, isFixStale, GEOFENCE_RADIUS_M, FIX_STALE_MS, FIX_INTERVAL_MS } from './useGeofencing';

describe('getDistanceInMeters', () => {
  it('returns 0 for identical points', () => {
    expect(getDistanceInMeters(48.8584, 2.2945, 48.8584, 2.2945)).toBe(0);
  });

  it('measures Tour Eiffel → Louvre at roughly 3.2 km', () => {
    const d = getDistanceInMeters(48.8584, 2.2945, 48.8606, 2.3376);
    expect(d).toBeGreaterThan(3000);
    expect(d).toBeLessThan(3400);
  });
});

describe('isWithinGeofence', () => {
  it('accepts a distance exactly at the radius', () => {
    expect(isWithinGeofence(GEOFENCE_RADIUS_M)).toBe(true);
  });

  it('rejects a distance just beyond the radius', () => {
    expect(isWithinGeofence(GEOFENCE_RADIUS_M + 0.01)).toBe(false);
  });

  it('keeps a point ~89 m away inside the geofence (composed with distance)', () => {
    // 0.0008° of latitude ≈ 89 m
    const d = getDistanceInMeters(48.8584, 2.2945, 48.8584 + 0.0008, 2.2945);
    expect(isWithinGeofence(d)).toBe(true);
  });

  it('puts a point ~111 m away outside the geofence (composed with distance)', () => {
    // 0.001° of latitude ≈ 111 m
    const d = getDistanceInMeters(48.8584, 2.2945, 48.8584 + 0.001, 2.2945);
    expect(isWithinGeofence(d)).toBe(false);
  });
});

describe('isFixStale', () => {
  it('a fix within the window is still valid', () => {
    const now = 1_000_000;
    expect(isFixStale(now - FIX_STALE_MS, now)).toBe(false);
  });

  it('a fix older than the window is stale', () => {
    const now = 1_000_000;
    expect(isFixStale(now - FIX_STALE_MS - 1, now)).toBe(true);
  });

  it('no fix ever (lastFixAt = 0) is stale', () => {
    expect(isFixStale(0, Date.now())).toBe(true);
  });

  it('the polling interval keeps a verified status backed by a fresh fix', () => {
    // Invariant: a fix obtained at each tick never goes stale between ticks
    expect(FIX_INTERVAL_MS).toBeLessThan(FIX_STALE_MS);
  });
});
