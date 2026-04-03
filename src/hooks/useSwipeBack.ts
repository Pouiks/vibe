"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function useSwipeBack(threshold = 70) {
  const router = useRouter();

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let endX = 0;

    const handleTouchStart = (e: TouchEvent) => {
      // Initialize touch positions
      startX = e.changedTouches[0].screenX;
      startY = e.changedTouches[0].screenY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      endX = e.changedTouches[0].screenX;
      const endY = e.changedTouches[0].screenY;
      
      const deltaX = endX - startX;
      const deltaY = Math.abs(endY - startY);

      // Conditions for Swipe-To-Back:
      // 1. Gesture started from the extreme left edge (<= 40 pixels from edge)
      // 2. Swiped to the right further than threshold (e.g. 70px)
      // 3. Movement was mostly horizontal (not much vertical scroll variance)
      if (startX <= 40 && deltaX > threshold && deltaY < 60) {
        router.back();
      }
    };

    // Add passive listeners to not degrade scroll performance
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [router, threshold]);
}
