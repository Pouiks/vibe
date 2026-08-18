import { describe, it, expect } from 'vitest';
import { getDistanceInMeters, isWithinGeofence, GEOFENCE_RADIUS_M } from './useGeofencing';

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
