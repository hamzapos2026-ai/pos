import localDB, { getSyncQueue, enqueueSync } from './localDB';
import {
  db as firestore,
  isFirebaseReady,
  doc,
  setDoc,
  writeBatch,
  serverTimestamp,
} from './firebase';

let running = false;

export const enqueue = async (type, payload) => {
  const op = {
    opId: `${type}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    type,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    status: 'pending',
  };
  await enqueueSync(op);
  // trigger processing
  processQueue().catch(() => {});
};

export const processQueue = async () => {
  if (running) return;
  running = true;
  try {
    const items = await getSyncQueue();
    if (!items || items.length === 0) return;

    // If Firestore is not ready, skip processing
    if (!isFirebaseReady() || !firestore) {
      // mark nothing; caller can retry later
      return;
    }

    // Batch write to Firestore using idempotent document ids (opId)
    const batch = writeBatch(firestore);
    const toUpdate = [];

    for (const it of items) {
      try {
        const ref = doc(firestore, 'sync_ops', it.opId);
        const payload = {
          type: it.type,
          payload: it.payload,
          clientOpId: it.opId,
          createdAt: it.createdAt || Date.now(),
          clientUpdatedAt: Date.now(),
          attempts: (it.attempts || 0) + 1,
          syncedAt: serverTimestamp(),
        };
        batch.set(ref, payload, { merge: true });
        toUpdate.push(it);
      } catch (e) {
        // skip this item
        await localDB.syncQueue.update(it.id, { status: 'error', lastError: String(e) });
      }
    }

    // Commit batch
    try {
      await batch.commit();

      // Mark local entries as synced
      for (const it of toUpdate) {
        try {
          await localDB.syncQueue.where('opId').equals(it.opId).modify({ status: 'synced', syncedAt: Date.now() });
        } catch (e) {
          await localDB.syncQueue.update(it.id, { status: 'error', lastError: String(e) });
        }
      }
    } catch (commitErr) {
      const msg = (commitErr && (commitErr.message || commitErr.code)) || String(commitErr);
      console.warn('[syncService] batch.commit failed:', msg);

      // Permission errors: mark these ops as forbidden and don't keep retrying
      const isPermError = msg && (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('missing or insufficient')) || commitErr.code === 'permission-denied' || commitErr.code === 'PERMISSION_DENIED';

      if (isPermError) {
        for (const it of toUpdate) {
          try {
            await localDB.syncQueue.update(it.id, { status: 'forbidden', lastError: String(commitErr) });
          } catch (e) {
            console.warn('[syncService] failed to mark forbidden:', e?.message || e);
          }
        }
      } else {
        // Transient error: increment attempts and mark failed so retry can occur later
        for (const it of toUpdate) {
          try {
            await localDB.syncQueue.update(it.id, { status: 'failed', attempts: (it.attempts || 0) + 1, lastError: String(commitErr) });
          } catch (e) {
            console.warn('[syncService] failed to mark failed:', e?.message || e);
          }
        }
      }
    }

  } catch (err) {
    console.warn('[syncService] processQueue error:', err?.message || err);
  } finally {
    running = false;
  }
};

export const status = () => ({ running });

export default { enqueue, processQueue, status };
