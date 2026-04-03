import { create } from 'zustand';

export interface UserVibe {
  id: string;
  username: string; // The specific reddit-style name e.g., "PandaEclatant42"
  isPremium: boolean;
  avatarId?: number;
  firstName?: string;
  age?: string;
  gender?: string;
}

interface VibeState {
  user: UserVibe | null;
  activeVenueSlug: string | null;
  writePermission: boolean;
  isInRange: boolean;
  isBypassPayment: boolean; // For the POC

  setUser: (user: UserVibe | null) => void;
  updateUserProfile: (data: Partial<UserVibe>) => void;
  setActiveVenue: (slug: string | null) => void;
  setGPSStatus: (isInRange: boolean) => void;
  toggleBypassPayment: () => void;
}

export const useVibeStore = create<VibeState>((set) => ({
  user: null,
  activeVenueSlug: null,
  writePermission: false, 
  isInRange: false,
  isBypassPayment: true, // Activated by default for POC

  setUser: (user) => set({ user }),
  updateUserProfile: (data) => set((state) => ({ user: state.user ? { ...state.user, ...data } : null })),
  setActiveVenue: (slug) => set({ activeVenueSlug: slug }),
  setGPSStatus: (isInRange) => set((state) => ({ 
    isInRange, 
    writePermission: isInRange || state.isBypassPayment // Premium could also bypass
  })),
  toggleBypassPayment: () => set((state) => ({ isBypassPayment: !state.isBypassPayment })),
}));
