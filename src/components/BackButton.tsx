"use client";
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { goBack, useSwipeBack } from '@/hooks/useSwipeBack';

// Flèche de retour cohérente avec le geste swipe : même destination
// (écran précédent, sinon fallbackHref). withSwipe monte aussi le geste,
// pour les pages qui n'appellent pas déjà useSwipeBack elles-mêmes.
export function BackButton({
  fallbackHref = '/',
  label = 'Retour',
  withSwipe = false,
  className = 'inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 text-sm',
}: {
  fallbackHref?: string;
  label?: string;
  withSwipe?: boolean;
  className?: string;
}) {
  const router = useRouter();
  useSwipeBack(fallbackHref, withSwipe);

  return (
    <button type="button" onClick={() => goBack(router, fallbackHref)} className={className} aria-label={label || 'Retour'}>
      <ArrowLeft className="w-4 h-4" />{label ? <span>{label}</span> : null}
    </button>
  );
}
