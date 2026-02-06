// src/auth/useInactivityLogout.ts

import { useEffect, useMemo, useRef } from "react";

type Options = {
  enabled: boolean;
  timeoutMs: number;
  onTimeout: () => void;
  throttleMs?: number;
};

export function useInactivityLogout({ enabled, timeoutMs, onTimeout, throttleMs = 1000 }: Options) {
  const timeoutRef = useRef<number | null>(null);
  const lastResetAtRef = useRef<number>(0);

  const events = useMemo(
    () =>
      [
        "keydown",
        "mousedown",
        "mousemove",
        "pointerdown",
        "touchstart",
        "wheel",
        "scroll",
      ] as const,
    []
  );

  useEffect(() => {
    if (!enabled) return;

    const clear = () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const arm = () => {
      clear();
      timeoutRef.current = window.setTimeout(() => {
        onTimeout();
      }, timeoutMs);
    };

    const reset = () => {
      const now = Date.now();
      if (now - lastResetAtRef.current < throttleMs) return;
      lastResetAtRef.current = now;
      arm();
    };

    // Arm immediately on enable
    lastResetAtRef.current = Date.now();
    arm();

    const opts: AddEventListenerOptions = { passive: true, capture: true };
    events.forEach((evt) => window.addEventListener(evt, reset, opts));

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, reset, opts));
      clear();
    };
  }, [enabled, events, onTimeout, throttleMs, timeoutMs]);
}

