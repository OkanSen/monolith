import { useState, useEffect, useCallback } from 'react';

interface EdgeRevealOptions {
  triggerHeight?: number; // Distance in px from the top edge to trigger reveal
  leaveDelay?: number;     // Grace period (ms) before sliding back up
  enabled?: boolean;       // Active state (e.g. true only when in clean desktop mode)
}

export function useEdgeReveal({
  triggerHeight = 18,
  //leaveDelay = 350,
  enabled = true,
}: EdgeRevealOptions = {}) {
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsRevealed(false);
      return;
    }

    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      // If cursor touches top trigger strip
      if (e.clientY <= triggerHeight) {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
        setIsRevealed(true);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [enabled, triggerHeight]);

  // Handler to attach to the target element's onMouseLeave
  const handleElementMouseLeave = useCallback(() => {
    if (!enabled) return;
    setIsRevealed(false);
  }, [enabled]);

  return {
    isRevealed,
    setIsRevealed,
    handleElementMouseLeave,
  };
}