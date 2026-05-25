// ✨ NEW: src/hooks/useQRVerification.js
// Purpose: USB + camera QR scanner with hash verification
// Features:
//   - USB scanner: keyboard buffer listener (150ms auto-complete)
//   - Camera scanner: html5-qrcode / jsQR
//   - Hash verification via qrHashService
//   - Auto-opens PaymentModal on valid scan

import { useState, useEffect, useCallback, useRef } from 'react';
import { decodeAndVerifyQR, verifyAmountMatch } from '../services/qrHashService';

// ── USB scanner buffer timeout (ms) ───────────────────────────
const USB_BUFFER_TIMEOUT = 150;

// ══════════════════════════════════════════════════════════════
// HOOK
// ══════════════════════════════════════════════════════════════

/**
 * useQRVerification — handles QR scan from USB scanner or camera
 *
 * @param {function} onValidScan  — called with { billId, amount } on success
 * @param {function} onMismatch   — called with mismatch data
 * @param {boolean}  isActive     — only listen when QR modal is open
 */
export const useQRVerification = (onValidScan, onMismatch, isActive = false) => {
  const [scanMode, setScanMode] = useState('usb');    // 'usb' | 'camera'
  const [scanState, setScanState] = useState('idle'); // 'idle' | 'scanning' | 'success' | 'error'
  const [lastScanResult, setLastScanResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [manualInput, setManualInput] = useState('');

  const bufferRef = useRef('');
  const timerRef = useRef(null);
  const isActiveRef = useRef(isActive);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // ── Process raw QR string ──────────────────────────────────
  const processQRString = useCallback(async (raw) => {
    if (!raw || !raw.trim()) return;

    setScanState('scanning');
    setErrorMessage('');

    try {
      const parsed = decodeAndVerifyQR(raw.trim());

      if (!parsed.valid && !parsed.billId) {
        // Completely invalid — not a POS QR code
        setScanState('error');
        setErrorMessage(parsed.error || 'Invalid QR code');
        setLastScanResult({ valid: false, error: parsed.error });
        return;
      }

      if (parsed.valid) {
        // Hash matches — success
        setScanState('success');
        setLastScanResult(parsed);
        onValidScan?.({
          billId: parsed.billId,
          amount: parsed.amount,
          fromQR: true,
        });
      } else {
        // Hash mismatch — show warning modal
        setScanState('error');
        setErrorMessage('QR data mismatch detected');
        setLastScanResult(parsed);
        onMismatch?.({
          billId: parsed.billId,
          qrAmount: parsed.amount,
          hash: parsed.hash,
          expectedHash: parsed.expectedHash,
          raw,
        });
      }
    } catch (err) {
      setScanState('error');
      setErrorMessage('QR processing failed: ' + err.message);
    }
  }, [onValidScan, onMismatch]);

  // ── USB keyboard buffer listener ───────────────────────────
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e) => {
      if (!isActiveRef.current) return;

      // Ignore modifier-only keys and function keys while scanning
      if (e.key === 'Enter') {
        // Buffer complete
        clearTimeout(timerRef.current);
        const captured = bufferRef.current.trim();
        bufferRef.current = '';
        if (captured.length > 5) {
          processQRString(captured);
        }
        return;
      }

      // Accumulate printable characters
      if (e.key.length === 1) {
        bufferRef.current += e.key;

        // Auto-complete on timeout
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          const captured = bufferRef.current.trim();
          bufferRef.current = '';
          if (captured.length > 5) {
            processQRString(captured);
          }
        }, USB_BUFFER_TIMEOUT);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      clearTimeout(timerRef.current);
      bufferRef.current = '';
    };
  }, [isActive, processQRString]);

  // ── Manual text submission ─────────────────────────────────
  const submitManual = useCallback(() => {
    if (!manualInput.trim()) return;
    processQRString(manualInput.trim());
    setManualInput('');
  }, [manualInput, processQRString]);

  // ── Camera scan result handler ─────────────────────────────
  const onCameraScan = useCallback((rawText) => {
    if (rawText) processQRString(rawText);
  }, [processQRString]);

  // ── Reset state ────────────────────────────────────────────
  const reset = useCallback(() => {
    setScanState('idle');
    setLastScanResult(null);
    setErrorMessage('');
    setManualInput('');
    bufferRef.current = '';
    clearTimeout(timerRef.current);
  }, []);

  return {
    scanMode,
    setScanMode,
    scanState,
    lastScanResult,
    errorMessage,
    manualInput,
    setManualInput,
    submitManual,
    onCameraScan,
    processQRString,
    reset,
    verifyAmountMatch,
  };
};

export default useQRVerification;
