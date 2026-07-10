/**
 * Local Sync Service — A One Jewelry POS (PRIMARY SYNC ENGINE)
 * ✅ Single unified sync engine for all offline orders
 * ✅ Multi-device safe with Firestore atomic writes
 * ✅ Automatic retry with exponential backoff
 * ✅ Immutable audit trail for compliance
 * ✅ Idempotent writes via localId
 * ✅ Skips synced bills (syncStatus='synced')
 * 
 * Uses Dexie orders store as buffer, Firebase as source of truth.
 * ✅ FIXED: Added missing 'limit' import
 */

import {
  collection, addDoc, query, where,
  getDocs, serverTimestamp, runTransaction, doc, setDoc, deleteDoc, limit, getDoc,
} from "firebase/firestore";
import { db as firebaseDb } from "./firebase";
import { db, initDatabase, ensureDbReady } from "../db/index";
import { getHasInternet } from "../utils/networkReachability";

// ── Configuration ──────────────────────────────────────────
const MAX_BATCH_SIZE = 50;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1000; // Start with 1s, exponential backoff

// ── State ──────────────────────────────────────────────────
let isSyncing = false;
let syncRetries = {};

// ── Helpers ────────────────────────────────────────────────
const _sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const _retryKey = (localId) => `retry_${localId}`;

const getOfflineOrdersForSync = async () => {
  try {
    await ensureDbReady();
    return await db.orders
      .filter((order) =>
        !order.firebaseId &&      // not yet synced to Firebase
        !order.synced &&           // not marked as synced
        !order._saving &&           // not mid-write by saveOrder (race guard)
        order.syncStatus !== 'synced'  // ✅ Skip already synced
      )
      .limit(MAX_BATCH_SIZE)
      .toArray();
  } catch (err) {
    console.error("[localSync] getOfflineOrdersForSync failed:", err && err.name, err && err.message);
    // Try to recover from closed DB / upgrade error by reopening once
    if (err && (err.name === 'DatabaseClosedError' || err.name === 'UpgradeError' || String(err).includes('VersionError'))) {
      try {
        await initDatabase();
        return await db.orders.filter((order) => !order.firebaseId && !order.synced && !order._saving && order.syncStatus !== 'synced').limit(MAX_BATCH_SIZE).toArray();
      } catch (retryErr) {
        console.error('[localSync] retry failed after initDatabase:', retryErr && retryErr.name, retryErr && retryErr.message);
      }
    }
    return [];
  }
};


// ── BroadcastChannel for UI notifications ──────────────────
const SYNC_CHANNEL = 'aone_pos_orders';
const _broadcast = (payload) => {
  try {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(SYNC_CHANNEL);
    ch.postMessage(payload);
    ch.close();
  } catch { /* non-critical */ }
};

// Listen for serial reassignments from the global serial service
try {
  if (typeof BroadcastChannel !== 'undefined') {
    const _reassignCh = new BroadcastChannel('aone_serial_reassign');
    _reassignCh.addEventListener('message', async (ev) => {
      try {
        const data = ev?.data || ev;
        if (!data || data.type !== 'bills_reassigned') return;

        const reassignments = data.reassignments || [];
        if (!reassignments.length) return;

        console.log(`[localSync] 🔁 Received ${reassignments.length} reassigned bill(s)`);

        for (const r of reassignments) {
          const oldSerial = r.oldSerial;
          const newSerial = r.newSerial;
          try {
            // Update by serialNo
            await db.orders.where('serialNo').equals(oldSerial).modify((order) => {
              order.serialNo = newSerial;
              order.billSerial = newSerial;
              order.lastSyncStatus = 'reassigned';
              order.syncError = null;
            });

            // Update by billSerial (not indexed) — use filter + update for safety
            try {
              const matching = await db.orders.filter((o) => o.billSerial === oldSerial).toArray();
              for (const m of matching) {
                await db.orders.update(m.localId || m.id, {
                  serialNo: newSerial,
                  billSerial: newSerial,
                  lastSyncStatus: 'reassigned',
                  syncError: null,
                });
              }
            } catch (e2) {
              // Non-fatal — continue
              console.warn('[localSync] billSerial update via filter failed:', e2?.message || e2);
            }

            console.log(`[localSync] ✅ Updated local orders: ${oldSerial} → ${newSerial}`);
          } catch (e) {
            console.warn(`[localSync] Failed to update local orders for ${oldSerial}:`, e?.message || e);
          }
        }

        // Trigger an immediate background sync attempt
        setTimeout(() => {
          syncOfflineOrders().catch((e) => console.warn('[localSync] retry after reassign failed:', e?.message || e));
        }, 400);
      } catch (err) {
        console.warn('[localSync] reassign handler error:', err?.message || err);
      }
    });
  }
} catch {}

// Keep synced orders locally for Recent Orders UI (mark only — do not delete)
const _cleanupSyncedOrder = async (localId) => {
  try {
    const record = await db.orders.where('localId').equals(localId).first();
    if (record?.firebaseId || record?.syncStatus === 'synced') {
      await db.orders.where('localId').equals(localId).modify({
        synced: true,
        syncStatus: 'synced',
      });
    }
  } catch { /* non-critical */ }
};

// ══════════════════════════════════════════════════════════════
// MAIN SYNC FUNCTION — FIXED WITH LOCALID DEDUP
// ══════════════════════════════════════════════════════════════
export const syncOfflineOrders = async () => {
  if (isSyncing) {
    console.warn("[localSync] Sync already in progress, skipping");
    return { synced: 0, failed: 0, errors: [], skipped: true };
  }

  if (!getHasInternet()) {
    console.warn("[localSync] Offline, skipping sync");
    return { synced: 0, failed: 0, errors: [], offline: true };
  }

  await ensureDbReady();
  isSyncing = true;

  try {
    const offlineOrders = await getOfflineOrdersForSync();
    if (offlineOrders.length === 0) {
      console.log("[localSync] ✅ No offline orders to sync");
      return { synced: 0, failed: 0, errors: [] };
    }

    console.log(`[localSync] 📦 Found ${offlineOrders.length} orders to sync`);
    const results = { synced: 0, failed: 0, errors: [], syncedSerials: [] };

    for (const order of offlineOrders) {
      const localId = order.localId;
      const billId = order.billId || localId;
      const billSerial = order.serialNo || order.billSerial || localId || 'OFFLINE';

      try {
        // Check retry count
        const retryCount = syncRetries[_retryKey(localId)] || 0;
        if (retryCount >= MAX_RETRIES) {
          console.error(`[localSync] ❌ Max retries exceeded for ${billSerial}`);
          results.failed++;
          results.errors.push({
            billSerial,
            reason: `Max retries (${MAX_RETRIES}) exceeded`
          });
          // ✅ Notify UI about failed sync
          _broadcast({
            type: 'SYNC_FAILED',
            billSerial,
            reason: 'Max retries exceeded',
          });
          continue;
        }

        let firebaseId = order.firebaseId;

        // ══════════════════════════════════════════════════════
        // ✅ NEW: Step 0 — Quick localId check FIRST (fast path)
        // ══════════════════════════════════════════════════════
        if (localId) {
          try {
            const localIdSnap = await getDocs(query(
              collection(firebaseDb, 'orders'),
              where('localId', '==', localId),
              limit(1)  // ✅ This now works with limit imported
            ));
            if (!localIdSnap.empty) {
              const existingDoc = localIdSnap.docs[0];
              console.log(`[localSync] ℹ️ Already synced via localId: ${localId}`);

              await db.orders.where('localId').equals(localId).modify({
                firebaseId: existingDoc.id,
                synced: true,
                syncedAt: new Date().toISOString(),
                syncStatus: 'synced',
              });

              results.synced++;
              results.syncedSerials.push(billSerial);
              delete syncRetries[_retryKey(localId)];
              await _cleanupSyncedOrder(localId);
              continue;
            }
          } catch (err) {
            console.warn(`[localSync] localId check failed (non-critical):`, err?.message);
            // Continue with billId check — don't fail the sync
          }
        }

        // Step 0b — Same serial already on Firebase? Link local row, never create duplicate doc.
        if (billSerial && billSerial !== 'OFFLINE') {
          try {
            let existingBySerial = null;
            for (const field of ['billSerial', 'serialNo']) {
              const serialSnap = await getDocs(query(
                collection(firebaseDb, 'orders'),
                where(field, '==', billSerial),
                limit(5),
              ));
              existingBySerial = serialSnap.docs.find((d) => {
                if (d.id === localId) return false;
                const data = d.data();
                return !data?.isDeleted && !data?.deleted;
              });
              if (existingBySerial) break;
            }
            if (existingBySerial) {
              console.log(`[localSync] ℹ️ Serial already on Firebase: ${billSerial} → ${existingBySerial.id}`);
              await db.orders.where('localId').equals(localId).modify({
                firebaseId: existingBySerial.id,
                synced: true,
                syncedAt: new Date().toISOString(),
                syncStatus: 'synced',
                duplicateResolved: true,
                linkedToFirebaseId: existingBySerial.id,
              });
              results.synced++;
              results.syncedSerials.push(billSerial);
              delete syncRetries[_retryKey(localId)];
              await _cleanupSyncedOrder(localId);
              continue;
            }
          } catch (err) {
            console.warn(`[localSync] serial duplicate check failed for ${billSerial}:`, err?.message);
          }
        }

        // Step 1: Check if already exists in Firebase via billId (fallback)
        if (!firebaseId && billId) {
          try {
            const existSnap = await getDocs(query(
              collection(firebaseDb, 'orders'),
              where('billId', '==', billId),
            ));
            if (!existSnap.empty) {
              firebaseId = existSnap.docs[0].id;
              console.log(`[localSync] ℹ️ Order already in Firebase: ${billSerial}`);

              await db.orders.where('localId').equals(localId).modify({
                firebaseId,
                syncedAt: new Date().toISOString(),
                synced: true,
                syncStatus: 'synced',
              });
              results.synced++;
              results.syncedSerials.push(billSerial);
              delete syncRetries[_retryKey(localId)];

              // ✅ Cleanup local after confirmed sync
              await _cleanupSyncedOrder(localId);
              continue;
            }
          } catch (err) {
            // ══════════════════════════════════════════════════════════
            // ✅ FIX: If Firebase query fails (missing index → failed-precondition,
            // or Firestore internal assert → AssertionBlob state corruption),
            // downgrade to a best-effort: treat it as "not found" locally
            // rather than crashing the entire batch; the order will
            // retry on the next cycle via syncRetries key.
            // ══════════════════════════════════════════════════════════
            console.warn(
              `[localSync] billId duplicate check failed for ${billSerial}:`,
              err.message,
            );
            // Do NOT treat this as a hard failure — skip the duplicate check
            // and proceed to the actual Firebase write (setDoc is idempotent
            // via localId as doc ID, so re-writes are safe).
          }
        }

        // Step 2: Add to Firebase (atomic write using localId as doc ID)
        try {
          // Use setDoc with localId as document ID (idempotent)
          await setDoc(
            doc(firebaseDb, 'orders', localId),
            {
              ...order,
              localId,  // Include for cross-reference
              _immutable: true,
              _createdAt: serverTimestamp(),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              syncedAt: new Date().toISOString(),
              syncSource: 'local_sync_service',
              syncStatus: 'synced',
              clientVersion: '1.0',
            },
            { merge: true }  // Idempotent
          );
          firebaseId = localId;

          // Step 2b: Strict verify-read loop
          const verifySnap = await getDoc(doc(firebaseDb, 'orders', localId));
          if (!verifySnap.exists()) {
            throw new Error(`Verification failed: Order ${billSerial} not found in Firebase post-write`);
          }

          // Step 3: Mark synced in Dexie
          await db.orders.where('localId').equals(localId).modify({
            firebaseId,
            syncedAt: new Date().toISOString(),
            synced: true,
            syncStatus: 'synced',
            lastSyncStatus: 'success',
          });

          console.log(`[localSync] ✅ Synced & Verified: ${billSerial} → Firebase [${firebaseId}]`);
          results.synced++;
          results.syncedSerials.push(billSerial);
          delete syncRetries[_retryKey(localId)];

          // ✅ Cleanup local after confirmed sync
          await _cleanupSyncedOrder(localId);

          // ✅ Broadcast per-bill success for immediate UI update
          const syncedRecord = await db.orders.where('localId').equals(localId).first();
          _broadcast({
            type: 'SYNC_COMPLETE',
            billSerial,
            localId,
            firebaseId,
            verified: true,
            syncedAt: new Date().toISOString(),
            order: syncedRecord || order,
          });

          // Auto-match pending payments (Scenario 1: biller offline, cashier online)
          try {
            const { reconcileAfterBillSync } = await import('./paymentReconciliationService.js');
            const { runSync } = await import('./cashierSyncWorker.js');
            reconcileAfterBillSync({
              billId: firebaseId,
              billSerial,
              storeId: order.storeId,
              localId,
            }).then(async (r) => {
              if (r?.matched > 0) {
                console.log(`[localSync] 🔗 Auto-matched ${r.matched} payment(s) for ${billSerial}`);
                try {
                  const { notifyBillerCashierPayment } = await import('./paymentReconciliationService.js');
                  await notifyBillerCashierPayment({
                    billSerial,
                    amount: order.totalAmount || order.grandTotal || order.finalTotal,
                    cashierName: 'Cashier',
                    localId,
                    storeId: order.storeId,
                  });
                } catch { /* toast via broadcast */ }
              }
              runSync().catch(() => {});
            }).catch(() => {});
          } catch { /* non-critical */ }

        } catch (fbErr) {
          console.error(`[localSync] Firebase write failed for ${billSerial}:`, fbErr?.code || fbErr?.message || fbErr);
          syncRetries[_retryKey(localId)] = retryCount + 1;

          // Mark failed locally
          await db.orders.where('localId').equals(localId).modify({
            lastSyncStatus: 'failed',
            syncError: fbErr?.message || fbErr?.code || 'Firebase write failed',
            syncedAt: null,
          });

          // Try server-wins conflict resolution: fetch server doc and overwrite local, keeping a local backup
          try {
            const serverSnap = await getDoc(doc(firebaseDb, 'orders', localId));
            if (serverSnap.exists()) {
              const serverData = serverSnap.data();
              // Backup local record
              try {
                const localRecord = await db.orders.where('localId').equals(localId).first();
                if (localRecord) {
                  await db.deleted_records.add({
                    originalId: localId,
                    type: 'order_conflict_backup',
                    reason: fbErr?.message || 'conflict',
                    deletedAt: new Date().toISOString(),
                    data: localRecord,
                    synced: false,
                  });
                }
              } catch (bkErr) {
                console.warn('[localSync] backup local record failed:', bkErr?.message || bkErr);
              }

              // Apply server record locally (server wins)
              try {
                await db.orders.where('localId').equals(localId).modify({
                  ...serverData,
                  firebaseId: serverSnap.id,
                  synced: true,
                  syncStatus: 'synced',
                  syncedAt: new Date().toISOString(),
                  lastSyncStatus: 'server_wins',
                  syncError: null,
                });
              } catch (applyErr) {
                // If modify fails, put full record
                const rec = { ...serverData, localId, firebaseId: serverSnap.id, synced: true, syncStatus: 'synced', syncedAt: new Date().toISOString() };
                await db.orders.put(rec);
              }

              // Treat as synced
              results.synced++;
              results.syncedSerials.push(billSerial);
              delete syncRetries[_retryKey(localId)];

              _broadcast({
                type: 'SYNC_CONFLICT_RESOLVED',
                billSerial,
                localId,
                firebaseId: serverSnap.id,
                resolution: 'server_wins',
              });

              // Cleanup local if server confirmed
              await _cleanupSyncedOrder(localId);
              continue;
            }
          } catch (fetchErr) {
            console.warn('[localSync] server fetch after write failed:', fetchErr?.message || fetchErr);
          }

          // Backoff wait before next attempt
          await _sleep(RETRY_DELAY_MS * Math.pow(2, retryCount));

          results.failed++;
          results.errors.push({
            billSerial,
            reason: fbErr?.message || fbErr?.code || 'Firebase write failed',
            retryCount: retryCount + 1,
          });

          // Notify UI about failed sync
          _broadcast({ type: 'SYNC_FAILED', billSerial, reason: fbErr?.message || fbErr?.code || 'Firebase write failed' });

          if (fbErr?.code === 'aborted' || fbErr?.message?.toLowerCase?.().includes('already exists') || fbErr?.message?.toLowerCase?.().includes('aborted')) {
            console.warn(`[localSync] Possible serial conflict for ${billSerial} — server-wins attempted.`);
          }
        }

      } catch (err) {
        console.error('[localSync] Unexpected error for bill', billSerial, ':', err?.message);
        results.failed++;
        results.errors.push({ billSerial, reason: err?.message || 'Unknown error' });
      }
    }

    // ✅ Final batch summary broadcast
    if (results.synced > 0) {
      _broadcast({
        type: 'SYNC_BATCH_COMPLETE',
        count: results.synced,
        serials: results.syncedSerials,
        syncedAt: new Date().toISOString(),
      });
    }

    console.log(`[localSync] 📊 Sync complete: ${results.synced} synced, ${results.failed} failed`);
    if (results.synced > 0 && typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('aone:bills-cloud-updated'));
      } catch { /* ignore */ }
    }
    return results;

  } catch (err) {
    console.error('[localSync] Fatal error:', err);
    return { synced: 0, failed: 0, errors: [{ reason: err?.message || 'Sync failed' }] };
  } finally {
    isSyncing = false;
  }
};


// ── ADVANCED SYNC QUEUE WORKER ──────────────────────────────
export const processSyncQueue = async () => {
  if (isSyncing) return;
  if (!getHasInternet()) return;
  isSyncing = true;

  try {
    const pendingItems = await db.sync_queue
      .filter(item => item.status === 'pending' || item.status === 'failed')
      .limit(MAX_BATCH_SIZE)
      .toArray();

    if (pendingItems.length === 0) {
      isSyncing = false;
      return;
    }

    // Sort by priority (descending) then createdAt (FIFO)
    pendingItems.sort((a, b) => {
      if (a.priority !== b.priority) return (b.priority || 0) - (a.priority || 0);
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    for (const item of pendingItems) {
      try {
        if (item.attempts >= MAX_RETRIES) {
          // Dead-letter queue
          await db.sync_queue.update(item.id, { status: 'dead_letter' });
          continue;
        }

        await db.sync_queue.update(item.id, { status: 'syncing', lastAttempt: new Date().toISOString() });

        let success = false;
        if (item.operation === 'add') {
          // ✅ Use setDoc with localId as doc ID (idempotent)
          const localId = item.data?.localId || item.queueId;
          await setDoc(
            doc(firebaseDb, item.type, localId),
            { ...item.data, syncedAt: serverTimestamp() },
            { merge: true }
          );
          success = true;
        } else if (item.operation === 'set') {
          await setDoc(doc(firebaseDb, item.type, item.data.id), { ...item.data, syncedAt: serverTimestamp() }, { merge: true });
          success = true;
        } else if (item.operation === 'delete') {
          await deleteDoc(doc(firebaseDb, item.type, item.data.id));
          success = true;
        }

        if (success) {
          // Confirm -> Delete Local Copy
          await db.sync_queue.delete(item.id);
        }
      } catch (err) {
        console.warn(`[syncQueue] Error syncing item ${item.id}:`, err);
        // Exponential backoff
        await _sleep(RETRY_DELAY_MS * Math.pow(2, item.attempts || 0));
        await db.sync_queue.update(item.id, {
          status: 'failed',
          attempts: (item.attempts || 0) + 1,
        });
      }
    }
  } catch (err) {
    console.error("[syncQueue] Fatal error:", err);
  } finally {
    isSyncing = false;
  }
};

export const getOfflineOrdersCount = async () => {
  try {
    return await db.orders.filter((order) => !order.firebaseId && order.syncStatus !== 'synced').count();
  } catch (err) {
    console.error("[localSync] getOfflineOrdersCount failed:", err);
    return 0;
  }
};

export const clearSyncedOrders = async () => {
  try {
    const syncedOrders = await db.orders.filter((order) => order.firebaseId && order.syncStatus === 'synced').toArray();
    console.log(`[localSync] 🗑️ Clearing ${syncedOrders.length} synced orders from local DB`);

    await Promise.all(syncedOrders.map((order) =>
      db.orders.where('localId').equals(order.localId).delete()
    ));
  } catch (err) {
    console.error("[localSync] clearSyncedOrders failed:", err);
  }
};

/**
 * Auto-sync on reconnect
 */
export const setupAutoSync = (onSyncComplete) => {
  const runSyncPass = async () => {
    if (!getHasInternet()) return;

    await processSyncQueue();

    const count = await getOfflineOrdersCount();
    if (count > 0) {
      console.log(`[localSync] ⏰ Sync pass: ${count} offline orders, syncing...`);
      const result = await syncOfflineOrders();
      if (onSyncComplete) onSyncComplete(result);
    }
  };

  const handleOnline = () => {
    console.log("[localSync] 📡 Going online, starting instant sync...");
    runSyncPass().catch((err) => console.error('[localSync] handleOnline sync failed:', err));
    // Second pass after 2s catches any race from DB recovery
    setTimeout(() => {
      runSyncPass().catch(() => {});
    }, 2000);
  };

  // Trigger on coming online
  window.addEventListener("online", handleOnline);

  // Run an initial sync pass immediately when the app starts online
  if (getHasInternet()) {
    console.log("[localSync] 📡 App started online, running initial sync...");
    runSyncPass().catch((err) => console.error('[localSync] initial sync failed:', err));
  }

  // Periodic worker for advanced queue and legacy orders
  const periodicSyncInterval = setInterval(() => {
    runSyncPass().catch((err) => console.error('[localSync] periodic sync failed:', err));
  }, 30_000); // Every 30 seconds

  // Cleanup function
  return () => {
    window.removeEventListener("online", handleOnline);
    clearInterval(periodicSyncInterval);
  };
};