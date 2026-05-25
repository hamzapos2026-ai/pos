// src/hooks/useSessionTimeout.js
// ✅ FIXED v2
// ✅ FIX-1: resetTimer NOT called in activity handler (infinite loop)
// ✅ FIX-2: Activity handler only updates lastActivityRef
// ✅ FIX-3: Single interval checks elapsed vs lastActivity
// ✅ FIX-4: Warning timer — correct ms calculation
// ✅ FIX-5: timeoutMinutes <= 2 guard (warning before timeout)
// ✅ Both named + default export

import {
  useState, useEffect,
  useRef, useCallback,
} from "react";

export const useSessionTimeout = ({
  timeoutMinutes = 30,
  onTimeout,
  onWarning,
} = {}) => {
  const totalSeconds = timeoutMinutes * 60;

  const [timeRemaining, setTimeRemaining] = useState(totalSeconds);
  const [isWarning, setIsWarning] = useState(false);

  const intervalRef = useRef(null);
  const warningFiredRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const onTimeoutRef = useRef(onTimeout);
  const onWarningRef = useRef(onWarning);

  // Keep callbacks fresh
  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);
  useEffect(() => { onWarningRef.current = onWarning; }, [onWarning]);

  // ──────────────────────────────────────────────────────────
  // RESET TIMER (call this manually when session should reset)
  // ──────────────────────────────────────────────────────────
  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    warningFiredRef.current = false;
    setTimeRemaining(totalSeconds);
    setIsWarning(false);
  }, [totalSeconds]);

  // ──────────────────────────────────────────────────────────
  // MAIN INTERVAL — checks elapsed time
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    // ✅ FIX-3: Single interval, checks lastActivityRef each tick
    intervalRef.current = setInterval(() => {
      const elapsedSec = Math.floor(
        (Date.now() - lastActivityRef.current) / 1000,
      );
      const remaining = Math.max(0, totalSeconds - elapsedSec);

      setTimeRemaining(remaining);

      // ✅ FIX-4: Warning at 2 min before timeout (or half if < 4 min total)
      const warnAt = timeoutMinutes > 4 ? 2 * 60 : Math.floor(totalSeconds / 2);

      if (
        remaining <= warnAt &&
        remaining > 0 &&
        !warningFiredRef.current
      ) {
        warningFiredRef.current = true;
        setIsWarning(true);
        onWarningRef.current?.();
      }

      if (remaining <= 0) {
        clearInterval(intervalRef.current);
        onTimeoutRef.current?.();
      }
    }, 1_000);

    return () => clearInterval(intervalRef.current);
  }, [totalSeconds, timeoutMinutes]);

  // ──────────────────────────────────────────────────────────
  // ACTIVITY LISTENERS
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    // ✅ FIX-1: handler ONLY updates lastActivityRef (no resetTimer call)
    // resetTimer would re-render + recreate interval = infinite loop
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      // Reset warning if user became active again
      if (warningFiredRef.current) {
        warningFiredRef.current = false;
        setIsWarning(false);
      }
    };

    const events = ["mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach((ev) =>
      document.addEventListener(ev, handleActivity, { passive: true }),
    );

    return () => {
      events.forEach((ev) =>
        document.removeEventListener(ev, handleActivity),
      );
    };
  }, []); // ✅ no deps — handler is stable via ref

  return { timeRemaining, isWarning, resetTimer };
};

export default useSessionTimeout;