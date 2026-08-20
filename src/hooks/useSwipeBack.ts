"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Retour "intelligent" partagé par le geste et les flèches : l'écran
// précédent s'il existe, sinon la page de repli (deep link, QR scanné
// depuis l'appareil photo → l'historique est vide, ne pas sortir de l'app).
export function goBack(
  router: { back: () => void; replace: (href: string) => void },
  fallbackHref = '/'
) {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back();
  } else {
    router.replace(fallbackHref);
  }
}

// Geste "app native" : glisser du bord gauche vers la droite = retour.
export function useSwipeBack(fallbackHref = '/', enabled = true) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    let startX = 0;
    let startY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      startX = e.changedTouches[0].screenX;
      startY = e.changedTouches[0].screenY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const deltaX = e.changedTouches[0].screenX - startX;
      const deltaY = Math.abs(e.changedTouches[0].screenY - startY);

      // Départ depuis le bord gauche (≤40 px), mouvement franc et horizontal
      if (startX <= 40 && deltaX > 70 && deltaY < 60) {
        goBack(router, fallbackHref);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [router, fallbackHref, enabled]);
}
