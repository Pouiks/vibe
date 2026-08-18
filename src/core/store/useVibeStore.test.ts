import { describe, it, expect, beforeEach } from 'vitest';
import { useVibeStore } from './useVibeStore';

describe('useVibeStore', () => {
  beforeEach(() => {
    useVibeStore.setState({ user: null, activeVenueSlug: null, writePermission: false, isInRange: false });
  });

  it('grants writePermission only when in GPS range', () => {
    useVibeStore.getState().setGPSStatus(true);
    expect(useVibeStore.getState().writePermission).toBe(true);
    expect(useVibeStore.getState().isInRange).toBe(true);

    useVibeStore.getState().setGPSStatus(false);
    expect(useVibeStore.getState().writePermission).toBe(false);
    expect(useVibeStore.getState().isInRange).toBe(false);
  });

  it('has no payment bypass left in the store', () => {
    expect('isBypassPayment' in useVibeStore.getState()).toBe(false);
  });

  it('updates profile fields without dropping the user', () => {
    useVibeStore.getState().setUser({ id: 'u1', username: 'CosmicPanda42', isPremium: false });
    useVibeStore.getState().updateUserProfile({ firstName: 'Alex' });
    expect(useVibeStore.getState().user).toMatchObject({ id: 'u1', username: 'CosmicPanda42', firstName: 'Alex' });
  });
});
