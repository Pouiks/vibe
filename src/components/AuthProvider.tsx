"use client";
import { useEffect } from 'react';
import { useAuth } from '@/modules/auth/useAuth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth(); // This hook internally calls checkSession and updates the store

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-vibe-dark text-white">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-sm font-medium tracking-widest text-brand-500 uppercase">Synchronisation VIBE...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
