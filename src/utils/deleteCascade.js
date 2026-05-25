// ═══════════════════════════════════════════════════════════════════════════
// File: src/utils/deleteCascade.js
// Purpose: Bill delete cascade — Firebase ↔ IndexedDB ↔ localStorage
// ═══════════════════════════════════════════════════════════════════════════

import { doc, deleteDoc, collection, query, where, getDocs } from '../services/firebase';
import { db as firebaseDb } from '../services/firebase';
import { db } from '../db/index';

// ── BroadcastChannel for cross-tab sync ──────────────────
const ORDERS_CHANNEL = 'aone_pos_orders';

/**
 * Delete bill from ALL locations (Firebase + IndexedDB + localStorage)
 * Called by Super Admin delete action
 *
 * @param {string} orderId - localId or firebaseId
 * @param {boolean} isSuperAdmin - if true, cascade to all locations
 * @param {string} deletedBy - UID of user performing delete
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const cascadeDeleteBill = async (orderId, isSuperAdmin = false, deletedBy = 'system') => {
  try {
    if (!orderId) {
      return { success: false, error: 'Order ID required' };
    }

    let localId = orderId;
    let firebaseId = null;

    // Step 1: Find the order in IndexedDB
    const localOrder = await db.orders.where('localId').equals(orderId).first();

    if (!localOrder) {
      // Try finding by firebaseId
      const allOrders = await db.orders.toArray();
      const found = allOrders.find(o => o.firebaseId === orderId);

      if (found) {
        localId = found.localId;
        firebaseId = found.firebaseId;
      } else {
        // Order not found in local — might already be deleted
        console.warn('[cascadeDelete] Order not found locally:', orderId);
        // Continue to try Firebase delete anyway
      }
    } else {
      localId = localOrder.localId;
      firebaseId = localOrder.firebaseId;
    }

    // Step 2: Delete from Firebase (if has firebaseId)
    if (firebaseId) {
      try {
        await deleteDoc(doc(firebaseDb, 'orders', firebaseId));
        console.log(`[cascadeDelete] ✅ Deleted from Firebase: ${firebaseId}`);
      } catch (fbErr) {
        console.warn('[cascadeDelete] Firebase delete failed:', fbErr?.message);
        // Continue with local delete — don't fail the cascade
      }
    }

    // Also try deleting by localId (in case firebaseId is different)
    try {
      await deleteDoc(doc(firebaseDb, 'orders', localId));
    } catch {
      // Ignore — might not exist
    }

    // Step 3: Delete from IndexedDB
    try {
      await db.orders.where('localId').equals(localId).delete();
      console.log(`[cascadeDelete] ✅ Deleted from IndexedDB: ${localId}`);
    } catch (idbErr) {
      console.warn('[cascadeDelete] IndexedDB delete failed:', idbErr?.message);
    }

    // Step 4: Delete from sync_queue
    try {
      const queueItems = await db.sync_queue.where('queueId').equals(localId).toArray();
      for (const item of queueItems) {
        await db.sync_queue.delete(item.id);
      }
    } catch { /* ignore */ }

    // Step 5: Clear localStorage cache for this order
    try {
      const cacheKeys = Object.keys(localStorage).filter(k =>
        k.includes(`order_${localId}`) || k.includes(`bill_${localId}`)
      );
      cacheKeys.forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }

    // Step 6: Broadcast deletion to all tabs
    try {
      const channel = new BroadcastChannel(ORDERS_CHANNEL);
      channel.postMessage({
        type: 'order_deleted',
        orderId: localId,
        firebaseId,
        deletedBy,
        deletedAt: Date.now(),
      });
      channel.close();
    } catch { /* ignore */ }

    // Step 7: Audit log entry
    try {
      await db.activity_logs_local.add({
        action: 'bill_deleted',
        orderId: localId,
        firebaseId,
        deletedBy,
        deletedAt: new Date().toISOString(),
        synced: false,
      });
    } catch { /* ignore */ }

    return { success: true };

  } catch (err) {
    console.error('[cascadeDelete] Fatal error:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Listen for Firebase deletions and cascade to local
 * Call this once in App.jsx
 *
 * @param {Function} onBillDeleted - Callback when bill is deleted (for UI refresh)
 * @returns {Function} Cleanup function
 */
export const setupDeleteListener = (onBillDeleted) => {
  if (typeof BroadcastChannel === 'undefined') return () => { };

  const channel = new BroadcastChannel(ORDERS_CHANNEL);

  channel.addEventListener('message', async (e) => {
    const { type, orderId } = e.data || {};

    if (type === 'order_deleted' && orderId) {
      console.log('[deleteListener] Received order_deleted:', orderId);

      // Delete locally
      try {
        await db.orders.where('localId').equals(orderId).delete();
      } catch { /* already deleted or not found */ }

      // Trigger UI callback
      if (typeof onBillDeleted === 'function') {
        onBillDeleted(orderId);
      }
    }

    // Handle new order broadcast
    if (type === 'new_order' || type === 'SYNC_COMPLETE') {
      console.log('[deleteListener] Order sync event:', type);
      // Top5 will auto-refresh via Firebase onSnapshot
    }
  });

  return () => {
    channel.removeEventListener('message', () => { });
    channel.close();
  };
};

/**
 * Broadcast order deletion to all tabs
 * Call this when Super Admin deletes from Admin panel
 *
 * @param {string} orderId - localId of deleted order
 * @param {string} deletedBy - UID of user who deleted
 */
export const broadcastOrderDeletion = (orderId, deletedBy = 'system') => {
  try {
    const channel = new BroadcastChannel(ORDERS_CHANNEL);
    channel.postMessage({
      type: 'order_deleted',
      orderId,
      deletedBy,
      deletedAt: Date.now(),
    });
    channel.close();
  } catch (err) {
    console.warn('[broadcastOrderDeletion] Failed:', err);
  }
};

export default {
  cascadeDeleteBill,
  setupDeleteListener,
  broadcastOrderDeletion,
};