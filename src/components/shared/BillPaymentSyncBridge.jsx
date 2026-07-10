/**
 * Global bill payment reconcile — runs on login + reconnect for ALL roles.
 * Keeps Firebase orders + local Dexie aligned across PWA / Netlify / localhost.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';

export default function BillPaymentSyncBridge() {
  const { userData } = useAuth();
  const { isOnline } = useNetwork();
  const lastOnlineReconcileRef = useRef(0);
  const loginDoneRef = useRef(false);

  const storeId = userData?.storeId || userData?.primaryStore || userData?.storeIds?.[0];

  const runReconcile = useCallback(async (force = false) => {
    if (!storeId || !userData?.uid) return null;
    const { reconcilePaidBillsAcrossDevices } = await import('../../services/paidBillIndexService');
    const result = await reconcilePaidBillsAcrossDevices(storeId, { force }).catch(() => null);
    if (result && (result.healed > 0 || result.removed > 0 || result.dupRemoved > 0)) {
      console.log(
        `[BillSync] ✅ healed=${result.healed || 0} removed=${result.removed || 0}`,
      );
    }
    return result;
  }, [storeId, userData?.uid]);

  // Login — force heal stale Firebase rows once per session
  useEffect(() => {
    if (!storeId || !userData?.uid) {
      loginDoneRef.current = false;
      return;
    }
    if (loginDoneRef.current) return;
    loginDoneRef.current = true;
    runReconcile(true);
  }, [storeId, userData?.uid, runReconcile]);

  // Reconnect — lighter reconcile (cooldown inside service)
  useEffect(() => {
    if (!isOnline || !storeId || !userData?.uid) return;
    const now = Date.now();
    if (now - lastOnlineReconcileRef.current < 25_000) return;
    lastOnlineReconcileRef.current = now;
    runReconcile(false);
  }, [isOnline, storeId, userData?.uid, runReconcile]);

  return null;
}
