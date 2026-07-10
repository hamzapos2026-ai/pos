// ✨ NEW: src/hooks/useOfflinePayments.js
// Purpose: Manage offline payments — save, sync, track mismatch queue
// Triggers: On reconnect, auto-syncs pending offline payments

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  saveOfflinePayment,
  flushPendingPaymentsToFirebase,
  getManualReviewQueue,
  resolveManualReview,
} from '../services/offlinePaymentService';
import { useSettings } from '../context/SettingsContext';
import { isCashierOfflinePaymentEnabled } from '../utils/roleUiSettings';
import { toast } from 'react-hot-toast';

// ══════════════════════════════════════════════════════════════
// HOOK
// ══════════════════════════════════════════════════════════════

export const useOfflinePayments = (storeId) => {
  const [mismatches, setMismatches] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState(null);
  const syncTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const { settings } = useSettings();

  // ── Load mismatch records ──────────────────────────────────
  const loadMismatches = useCallback(async () => {
    if (!storeId) return;
    try {
      const records = await getManualReviewQueue(storeId, { cashierView: true });
      if (mountedRef.current) setMismatches(records || []);
    } catch (err) {
      console.error('[useOfflinePayments] loadMismatches error:', err);
    }
  }, [storeId]);

  // ── Save payment offline ───────────────────────────────────
  const savePaymentOffline = useCallback(async (paymentData) => {
    if (!isCashierOfflinePaymentEnabled(settings)) {
      toast.error('Manual / offline bill is disabled by Super Admin');
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
  }, [storeId, settings]);

  // ── Sync all pending offline payments ─────────────────────
  const syncNow = useCallback(async () => {
    if (!storeId || !navigator.onLine || isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await flushPendingPaymentsToFirebase();
      if (mountedRef.current) {
        setLastSyncResult(result);

        if (result.synced > 0) {
          toast.success(`✅ ${result.synced} offline payment(s) synced`, { duration: 3000 });
        }
        const reviewItems = await getManualReviewQueue(storeId, { cashierView: true });
        if (reviewItems?.length > 0) {
          toast(`⚠ ${reviewItems.length} payment(s) need manual review`, {
            icon: '⚠️',
            duration: 5000,
          });
          if (mountedRef.current) setMismatches(reviewItems);
        }
      }
    } catch (err) {
      console.error('[useOfflinePayments] syncNow error:', err);
    } finally {
      if (mountedRef.current) setIsSyncing(false);
    }
  }, [storeId, isSyncing]);

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
  const resolveRecord = useCallback(async (recordId, resolution) => {
    const decision = resolution === 'mark_paid' ? 'approve' : (resolution === 'reject' ? 'reject' : 'investigate');
    await resolveManualReview(recordId, decision);
    toast.success(decision === 'approve' ? '✅ Marked as paid' : '❌ Rejected');
    await loadMismatches();
    return { success: true };
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
