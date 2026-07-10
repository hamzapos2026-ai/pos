import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BILLER_STALL_DEFAULTS,
  STALL_TYPE_LABELS,
  logBillerStallAlert,
} from '../services/billerStallService';

const CHECK_INTERVAL_MS = 30_000;

/** Survives Strict Mode remount — prevents duplicate stall banners. */
const globalLastAlertAt = new Map();

const mergeStallConfig = (raw = {}) => ({
  ...BILLER_STALL_DEFAULTS,
  ...raw,
});

/**
 * Monitors biller idle time, long bills, and invoice modal stalls.
 * Shows alert state + logs to Firestore for super admin.
 */
export default function useBillerStallMonitor({
  config,
  enabled: enabledProp,
  billerId,
  billerName,
  storeId,
  activeBill,
  screenLocked,
  billStartTime,
  billSerial,
  tabLabel,
  showPrintModal,
  viewingOrder,
  playSound,
  hasItems = true,
}) {
  const cfg = mergeStallConfig(config);
  const enabled = enabledProp && cfg.enabled;

  const lastActivityRef = useRef(Date.now());
  const invoiceOpenSinceRef = useRef(null);
  const lastAlertRef = useRef({});
  const [stallAlert, setStallAlert] = useState(null);

  const bumpActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const clearStallAlert = useCallback(() => {
    setStallAlert(null);
    bumpActivity();
  }, [bumpActivity]);

  useEffect(() => {
    if (!enabled) return undefined;
    const bump = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('keydown', bump, { passive: true });
    window.addEventListener('mousedown', bump, { passive: true });
    window.addEventListener('touchstart', bump, { passive: true });
    return () => {
      window.removeEventListener('keydown', bump);
      window.removeEventListener('mousedown', bump);
      window.removeEventListener('touchstart', bump);
    };
  }, [enabled]);

  useEffect(() => {
    if (showPrintModal || viewingOrder) {
      if (!invoiceOpenSinceRef.current) invoiceOpenSinceRef.current = Date.now();
    } else {
      invoiceOpenSinceRef.current = null;
    }
  }, [showPrintModal, viewingOrder]);

  useEffect(() => {
    if (!enabled) {
      setStallAlert(null);
      return undefined;
    }

    const cooldownMs = Math.max(1, cfg.alertCooldownMinutes) * 60_000;
    // A threshold of 0 (or blank/negative) means that alert is OFF — super admin can
    // disable any single alert by setting its minutes to 0.
    const toMs = (mins) => (Number(mins) > 0 ? Number(mins) * 60_000 : 0);
    const billIdleMs = toMs(cfg.billIdleMinutes);
    const invoiceOpenMs = toMs(cfg.invoiceOpenMinutes);
    const maxBillMs = toMs(cfg.maxBillMinutes);

    const canAlert = (type) => {
      const key = `${type}:${billSerial || tabLabel || 'tab'}`;
      const last = Math.max(lastAlertRef.current[key] || 0, globalLastAlertAt.get(key) || 0);
      if (Date.now() - last < cooldownMs) return false;
      const now = Date.now();
      lastAlertRef.current[key] = now;
      globalLastAlertAt.set(key, now);
      return true;
    };

    const fireAlert = async (stallType, durationMs) => {
      if (!canAlert(stallType)) return;

      const label = STALL_TYPE_LABELS[stallType] || stallType;
      const mins = Math.max(1, Math.round(durationMs / 60000));

      setStallAlert({
        stallType,
        label,
        durationMs,
        durationLabel: `${mins} min`,
        billSerial: billSerial || '----',
        billerName: billerName || '',
      });

      try { playSound?.('error'); } catch { /* ignore */ }

      await logBillerStallAlert({
        storeId,
        billerId,
        billerName,
        billSerial,
        stallType,
        durationMs,
        billStartTime: billStartTime instanceof Date
          ? billStartTime.toISOString()
          : billStartTime,
        tabLabel,
      });
    };

    const tick = () => {
      const now = Date.now();
      // Only treat a bill as "active" for idle/too-long alerts when it actually has items.
      // An unlocked-but-empty bill = biller ready, no customer yet → no time alert.
      const billActive = !screenLocked && hasItems && (activeBill || (billStartTime && billSerial));

      if (billActive) {
        if (billIdleMs > 0) {
          const idleMs = now - lastActivityRef.current;
          if (idleMs >= billIdleMs) {
            void fireAlert('bill_idle', idleMs);
          }
        }

        if (maxBillMs > 0 && billStartTime) {
          const start = billStartTime instanceof Date
            ? billStartTime.getTime()
            : new Date(billStartTime).getTime();
          if (start && now - start >= maxBillMs) {
            void fireAlert('bill_too_long', now - start);
          }
        }
      }

      if (invoiceOpenMs > 0 && invoiceOpenSinceRef.current) {
        const openMs = now - invoiceOpenSinceRef.current;
        if (openMs >= invoiceOpenMs) {
          void fireAlert('invoice_open', openMs);
        }
      }
    };

    const id = setInterval(tick, CHECK_INTERVAL_MS);
    tick();

    return () => clearInterval(id);
  }, [
    enabled,
    cfg.billIdleMinutes,
    cfg.invoiceOpenMinutes,
    cfg.maxBillMinutes,
    cfg.alertCooldownMinutes,
    activeBill,
    screenLocked,
    billStartTime,
    billSerial,
    tabLabel,
    billerId,
    billerName,
    storeId,
    playSound,
    showPrintModal,
    viewingOrder,
    hasItems,
  ]);

  return { stallAlert, clearStallAlert, bumpActivity };
}
