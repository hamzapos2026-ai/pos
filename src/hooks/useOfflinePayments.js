// ✨ NEW: src/hooks/useOfflinePayments.js
// Purpose: Manage offline payments — save, sync, track mismatch queue
// Triggers: On reconnect, auto-syncs pending offline payments

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  saveOfflinePayment,
  syncOfflinePayments,
  getMismatchRecords,
  resolveMismatch,
} from '../services/offlinePaymentService';
import { useSettings } from '../context/SettingsContext';
import toast from 'react-hot-toast';

// ══════════════════════════════════════════════════════════════
// HOOK
// ══════════════════════════════════════════════════════════════

export const useOfflinePayments = (storeId) => {
  const [mismatches, setMismatches] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState(null);
  const syncTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const { getSetting } = useSettings();

  // ── Load mismatch records ──────────────────────────────────
  const loadMismatches = useCallback(async () => {
    if (!storeId) return;
    try {
      const records = await getMismatchRecords(storeId);
      if (mountedRef.current) setMismatches(records);
    } catch (err) {
      console.error('[useOfflinePayments] loadMismatches error:', err);
    }
  }, [storeId]);

  // ── Save payment offline ───────────────────────────────────
  const savePaymentOffline = useCallback(async (paymentData) => {
    const disableOffline = getSetting('disableCashierOffline', false);
    if (disableOffline) {
      toast.error('Offline cashier mode is disabled');
      return { success: false, error: 'disabled' };
    }

    const result = await saveOfflinePayment({ ...paymentData, storeId });
    if (result.success) {
      toast('💾 Payment saved offline. Will sync when online.', {
        icon: '🔵',
        duration: 3000,
      });
    }
    return result;
  }, [storeId]);

  // ── Sync all pending offline payments ─────────────────────
  const syncNow = useCallback(async () => {
    if (!storeId || !navigator.onLine || isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await syncOfflinePayments(storeId);
      if (mountedRef.current) {
        setLastSyncResult(result);

        if (result.synced > 0) {
          toast.success(`✅ ${result.synced} offline payment(s) synced`, { duration: 3000 });
        }
        if (result.mismatches.length > 0) {
          toast(`⚠ ${result.mismatches.length} payment(s) need manual review`, {
            icon: '⚠️',
            duration: 5000,
          });
          await loadMismatches();
        }
      }
    } catch (err) {
      console.error('[useOfflinePayments] syncNow error:', err);
    } finally {
      if (mountedRef.current) setIsSyncing(false);
    }
  }, [storeId, isSyncing, loadMismatches]);

  // ── Auto-sync on reconnect ────────────────────────────────
  useEffect(() => {
    const handleOnline = () => {
      // Debounce: wait 1s after reconnect
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => {
        syncNow();
      }, 1000);
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
      clearTimeout(syncTimerRef.current);
    };
  }, [syncNow]);

  // ── Load mismatches on mount ───────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    loadMismatches();
    return () => { mountedRef.current = false; };
  }, [loadMismatches]);

  // ── Resolve mismatch (admin action) ───────────────────────
  const resolveRecord = useCallback(async (recordId, resolution, resolvedBy) => {
    const result = await resolveMismatch(recordId, resolution, resolvedBy);
    if (result.success) {
      toast.success(resolution === 'mark_paid' ? '✅ Marked as paid' : '❌ Rejected');
      await loadMismatches();
    } else {
      toast.error('Failed to resolve: ' + result.error);
    }
    return result;
  }, [loadMismatches]);

  return {
    mismatches,
    isSyncing,
    lastSyncResult,
    savePaymentOffline,
    syncNow,
    resolveRecord,
    loadMismatches,
  };
};

export default useOfflinePayments;
