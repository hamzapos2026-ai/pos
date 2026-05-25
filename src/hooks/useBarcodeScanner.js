// File: src/hooks/useBarcodeScanner.js
// Purpose: USB barcode scanner detection and parsing
// Features: Scanner detection via keystroke timing, buffer management, prefix/suffix stripping
// Offline: Yes
// Dependencies: react

import { useRef, useCallback } from "react";

/**
 * Hook for detecting USB barcode scanner input
 * USB scanners act as keyboard emulation with fast keystroke timing (< 80ms)
 */
export const useBarcodeScanner = ({
  enabled = true,
  onScan,
  prefix = "",
  suffix = "",
  onCompleteDelay = 200,
}) => {
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);
  const scanCountRef = useRef(0);
  const lastScanRef = useRef(null);

  const isScannerInput = useCallback((timeBetween) => {
    // Scanner: keystrokes come in < 80ms
    // Human: keystrokes are typically > 100ms
    return timeBetween < 80;
  }, []);

  const handleKeyDown = useCallback(
    (e) => {
      if (!enabled || !onScan) return;

      const now = Date.now();
      const timeBetween = now - lastKeyTimeRef.current;

      // Skip if focus is on a normal input AND typing is slow (human)
      const activeTag = document.activeElement?.tagName;
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(activeTag);

      if (isInput && !isScannerInput(timeBetween)) {
        // Human typing in input - clear buffer
        bufferRef.current = "";
        return;
      }

      // Check if this is scanner input or we're building a scanner string
      if (isScannerInput(timeBetween) || bufferRef.current.length > 0) {
        e.preventDefault();
        e.stopPropagation();

        if (e.key === "Enter") {
          // End of scan
          let code = bufferRef.current;

          // Strip prefix/suffix
          if (prefix && code.startsWith(prefix)) {
            code = code.slice(prefix.length);
          }
          if (suffix && code.endsWith(suffix)) {
            code = code.slice(0, -suffix.length);
          }

          if (code) {
            scanCountRef.current += 1;
            lastScanRef.current = code;
            onScan(code);
          }
          bufferRef.current = "";
        } else if (e.key.length === 1) {
          bufferRef.current += e.key;
        }
      } else {
        bufferRef.current = "";
      }

      lastKeyTimeRef.current = now;
    },
    [enabled, onScan, prefix, suffix, isScannerInput],
  );

  // Auto-clear buffer on timeout
  const resetBuffer = useCallback(() => {
    bufferRef.current = "";
    lastKeyTimeRef.current = 0;
  }, []);

  return {
    lastScan: lastScanRef.current,
    scanCount: scanCountRef.current,
    resetScan: resetBuffer,
    handleKeyDown,
  };
};

export default useBarcodeScanner;