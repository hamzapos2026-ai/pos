// File: src/services/archiveService.js
// Purpose: Soft delete → archive_records snapshot → restore / permanent delete (Super Admin)

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  limit,
  serverTimestamp,
  db as firestoreDb,
  isFirebaseReady,
} from './firebase';
import { logActivity } from './activityLogger';
import { db as dexieDb } from '../db/index';
import { COLLECTION_NAMES } from '../utils/constants';
import {
  isElevatedRole,
  resolveUserStoreListenIds,
} from '../utils/branchAccess';
import { deleteUser as permanentDeleteUserAccount } from './userSyncService';
import {
  loadBackupFromCloud,
  deleteCloudBackup,
  restoreBackupToHistory,
} from './backupService';

export const ARCHIVE_RECORDS_COLLECTION = 'archive_records';
export const PERMANENT_DELETE_PHRASE = 'PERMANENT DELETE';

export const ENTITY_TYPES = {
  ORDER: 'order',
  CUSTOMER: 'customer',
  USER: 'user',
  BACKUP: 'backup',
};

const COLLECTION_BY_TYPE = {
  [ENTITY_TYPES.ORDER]: COLLECTION_NAMES.orders || 'orders',
  [ENTITY_TYPES.CUSTOMER]: COLLECTION_NAMES.customers || 'customers',
  [ENTITY_TYPES.USER]: 'users',
  [ENTITY_TYPES.BACKUP]: 'backups',
};

const _branchFromData = (data = {}) =>
  String(data.storeId || data.branchId || data.primaryStore || data.storeIds?.[0] || '');

const _requireOnline = () => {
  if (!navigator.onLine) throw new Error('Internet zaroori hai archive ke liye');
  if (!isFirebaseReady() || !firestoreDb) throw new Error('Firebase ready nahi');
};

const _writeArchiveRecord = async ({
  entityType,
  entityId,
  sourceCollection,
  snapshot,
  branchId,
  deletedBy,
  reason,
  label,
}) => {
  const archiveRecordId = `arc_${entityType}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const nowIso = new Date().toISOString();

  await setDoc(doc(firestoreDb, ARCHIVE_RECORDS_COLLECTION, archiveRecordId), {
    id: archiveRecordId,
    entityType,
    entityId,
    sourceCollection,
    branchId: branchId || null,
    label: label || '',
    payload: snapshot,
    reason: reason || '',
    deletedByUid: deletedBy?.uid || deletedBy?.id || '',
    deletedByEmail: deletedBy?.email || deletedBy?.name || 'Admin',
    deletedAt: nowIso,
    timestamp: serverTimestamp(),
    status: 'archived',
    restoredAt: null,
    restoredByUid: null,
    permanentAt: null,
    permanentByUid: null,
  });

  return { archiveRecordId, deletedAt: nowIso };
};

/** List entity archive records — managers see own branch only. */
export const listArchiveRecords = async ({
  userDoc = {},
  storesMap = {},
  entityType = null,
  includeRestored = false,
  includePermanent = false,
  max = 60,
} = {}) => {
  _requireOnline();

  const elevated = isElevatedRole(userDoc);
  const branchIds = elevated ? null : resolveUserStoreListenIds(userDoc, storesMap);

  let snap;
  try {
    // Plain list — avoids composite index; filter/sort client-side
    snap = await getDocs(query(
      collection(firestoreDb, ARCHIVE_RECORDS_COLLECTION),
      limit(Math.min(max, 200)),
    ));
  } catch (e) {
    const msg = String(e?.message || e?.code || '');
    if (msg.includes('permission') || msg.includes('insufficient')) {
      throw new Error(
        'Firestore permission — terminal mein chalao: firebase deploy --only firestore:rules',
      );
    }
    throw e;
  }

  let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (!includeRestored) {
    rows = rows.filter((r) =>
      (r.status === 'archived' && !r.permanentAt)
      || (includePermanent && r.status === 'permanent'),
    );
  }

  if (entityType) {
    rows = rows.filter((r) => r.entityType === entityType);
  }

  if (!elevated && branchIds?.length) {
    const allowed = new Set(branchIds.map(String));
    rows = rows.filter((r) => !r.branchId || allowed.has(String(r.branchId)));
  }

  rows.sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')));

  return rows.slice(0, max);
};

/** Soft-archive any Firestore entity with full snapshot. */
export const softArchiveEntity = async ({
  entityType,
  entityId,
  sourceCollection,
  snapshot = null,
  deletedBy = {},
  reason = '',
  branchId = null,
  label = '',
  extraPatch = {},
}) => {
  if (!entityId) throw new Error('Entity ID zaroori hai');
  _requireOnline();

  const col = sourceCollection || COLLECTION_BY_TYPE[entityType];
  if (!col) throw new Error('Unknown entity type');

  let data = snapshot;
  if (!data) {
    const snap = await getDoc(doc(firestoreDb, col, entityId));
    if (!snap.exists()) throw new Error('Record nahi mila');
    data = { id: snap.id, ...snap.data() };
  }

  const resolvedBranch = branchId || _branchFromData(data);
  const displayLabel = label
    || data.serialNo
    || data.billSerial
    || data.name
    || data.email
    || entityId;

  const { archiveRecordId, deletedAt } = await _writeArchiveRecord({
    entityType,
    entityId,
    sourceCollection: col,
    snapshot: data,
    branchId: resolvedBranch,
    deletedBy,
    reason,
    label: displayLabel,
  });

  const patch = {
    isArchived: true,
    archivedAt: deletedAt,
    archiveRecordId,
    archivedBy: deletedBy?.uid || deletedBy?.email || 'admin',
    archiveReason: reason || '',
    ...extraPatch,
  };

  await updateDoc(doc(firestoreDb, col, entityId), patch);

  await logActivity(`entity_archived_${entityType}`, {
    entityType,
    entityId,
    archiveRecordId,
    branchId: resolvedBranch,
    reason,
    userId: deletedBy?.uid,
    userName: deletedBy?.email || deletedBy?.name,
    storeId: resolvedBranch,
  });

  return { success: true, archiveRecordId, entityType, entityId };
};

export const softArchiveOrder = async (orderId, {
  deletedBy = {},
  reason = '',
  billRow = null,
} = {}) => {
  const extraPatch = {
    deleted: true,
    isDeleted: true,
    isActiveOrder: false,
    deleteReason: reason,
    cancelReason: reason,
    status: 'cancelled',
    paymentStatus: 'deleted',
    deletedAt: serverTimestamp(),
  };

  const result = await softArchiveEntity({
    entityType: ENTITY_TYPES.ORDER,
    entityId: orderId,
    sourceCollection: 'orders',
    snapshot: billRow ? { id: orderId, ...billRow } : null,
    deletedBy,
    reason,
    label: billRow?.serialNo || billRow?.billSerial || orderId,
    extraPatch,
  });

  try {
    if (dexieDb?.orders) {
      const local = await dexieDb.orders
        .filter((o) => o.firebaseId === orderId || o.localId === orderId)
        .first();
      if (local) {
        await dexieDb.orders.update(local.localId || local.id, {
          isArchived: true,
          isActiveOrder: false,
          archiveRecordId: result.archiveRecordId,
        });
      }
    }
  } catch { /* ignore */ }

  return result;
};

export const softArchiveCustomer = async (customerId, {
  deletedBy = {},
  reason = '',
} = {}) => {
  const result = await softArchiveEntity({
    entityType: ENTITY_TYPES.CUSTOMER,
    entityId: customerId,
    sourceCollection: COLLECTION_NAMES.customers || 'customers',
    deletedBy,
    reason,
    extraPatch: {
      isDeleted: true,
    },
  });

  try {
    if (dexieDb?.customers) {
      const local = await dexieDb.customers
        .filter((c) => c.customerId === customerId || c.id === customerId)
        .first();
      if (local) {
        await dexieDb.customers.update(local.id, {
          isArchived: true,
          archiveRecordId: result.archiveRecordId,
        });
      }
    }
  } catch { /* ignore */ }

  return result;
};

/** Soft-archive user — login block, Auth account NOT deleted. */
export const softArchiveUser = async (uid, {
  deletedBy = {},
  reason = '',
} = {}) => {
  if (uid.startsWith('temp_')) {
    throw new Error('Temp user — pehle sync hone do');
  }

  const result = await softArchiveEntity({
    entityType: ENTITY_TYPES.USER,
    entityId: uid,
    sourceCollection: 'users',
    deletedBy,
    reason: reason || 'archived_from_admin',
    extraPatch: {
      isDeleted: true,
      isActive: false,
      archivedReason: reason || '',
    },
  });

  try {
    if (dexieDb?.users) {
      const local = await dexieDb.users.filter((u) => u.uid === uid).first();
      if (local) {
        await dexieDb.users.update(local.id, {
          isArchived: true,
          isDeleted: true,
          isActive: false,
          archiveRecordId: result.archiveRecordId,
        });
      }
    }
  } catch { /* ignore */ }

  return result;
};

/** Soft-archive cloud backup — History se hatao, Archive mein dikhao (payload cloud par rehta hai). */
export const softArchiveBackup = async (backupId, {
  deletedBy = {},
  reason = '',
  backupRow = null,
} = {}) => {
  if (!backupId) throw new Error('Backup ID zaroori hai');
  _requireOnline();

  let meta = backupRow ? { ...backupRow } : null;
  if (!meta) {
    const snap = await getDoc(doc(firestoreDb, 'backups', backupId));
    if (!snap.exists()) throw new Error('Backup record nahi mila');
    meta = { id: snap.id, ...snap.data() };
  }

  let embeddedPayload = null;
  let payloadKeptInCloud = false;
  if (meta.hasPayload) {
    try {
      const payload = await loadBackupFromCloud(backupId);
      const json = JSON.stringify(payload);
      if (json.length < 900_000) {
        embeddedPayload = payload;
      } else {
        payloadKeptInCloud = true;
      }
    } catch {
      payloadKeptInCloud = !!meta.hasPayload;
    }
  }

  const snapshot = {
    ...meta,
    payloadKeptInCloud,
    embeddedPayload,
  };

  const displayLabel = `${meta.scope || meta.scheduleType || 'Backup'} · ${backupId}`;

  const { archiveRecordId } = await _writeArchiveRecord({
    entityType: ENTITY_TYPES.BACKUP,
    entityId: backupId,
    sourceCollection: 'backups',
    snapshot,
    branchId: null,
    deletedBy,
    reason: reason || 'deleted_from_backup_history',
    label: displayLabel,
  });

  await deleteDoc(doc(firestoreDb, 'backups', backupId));

  await logActivity('entity_archived_backup', {
    entityType: ENTITY_TYPES.BACKUP,
    entityId: backupId,
    archiveRecordId,
    reason,
    userId: deletedBy?.uid,
    userName: deletedBy?.email || deletedBy?.name,
  });

  return { success: true, archiveRecordId, entityId: backupId };
};

/** Restore from archive_records snapshot. */
export const restoreArchiveRecord = async (archiveRecordId, restoredBy = {}) => {
  if (!archiveRecordId) throw new Error('Archive ID zaroori hai');
  _requireOnline();

  const ref = doc(firestoreDb, ARCHIVE_RECORDS_COLLECTION, archiveRecordId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Archive record nahi mila');

  const rec = snap.data();
  if (rec.status === 'restored') throw new Error('Pehle se restore ho chuka hai');
  if (rec.permanentAt) throw new Error('Permanent delete ho chuka — restore nahi');

  const { entityType, entityId, payload } = rec;
  const nowIso = new Date().toISOString();

  if (entityType === ENTITY_TYPES.BACKUP) {
    await restoreBackupToHistory(entityId, payload || {});
    await updateDoc(ref, {
      status: 'restored',
      restoredAt: nowIso,
      restoredByUid: restoredBy?.uid || '',
      restoredByEmail: restoredBy?.email || restoredBy?.name || '',
    });
    await logActivity('entity_restored_backup', {
      entityType,
      entityId,
      archiveRecordId,
      userId: restoredBy?.uid,
      userName: restoredBy?.email || restoredBy?.name,
    });
    return { success: true, entityType, entityId };
  }

  const { sourceCollection } = rec;
  const col = sourceCollection || COLLECTION_BY_TYPE[entityType];

  const entityRef = doc(firestoreDb, col, entityId);
  const entitySnap = await getDoc(entityRef);

  const restorePatch = {
    ...(payload || {}),
    isArchived: false,
    archivedAt: null,
    archiveRecordId: null,
    restoredAt: nowIso,
    restoredBy: restoredBy?.uid || restoredBy?.email || 'admin',
  };

  if (entityType === ENTITY_TYPES.ORDER) {
    Object.assign(restorePatch, {
      deleted: false,
      isDeleted: false,
      isActiveOrder: true,
      deleteReason: null,
      cancelReason: null,
      status: payload?.status && payload.status !== 'cancelled' ? payload.status : 'pending',
      paymentStatus: payload?.paymentStatus && payload.paymentStatus !== 'deleted'
        ? payload.paymentStatus
        : 'unpaid',
    });
  }

  if (entityType === ENTITY_TYPES.CUSTOMER) {
    restorePatch.isDeleted = false;
  }

  if (entityType === ENTITY_TYPES.USER) {
    restorePatch.isDeleted = false;
    restorePatch.isActive = payload?.isActive !== false;
  }

  delete restorePatch.id;

  if (entitySnap.exists()) {
    await updateDoc(entityRef, restorePatch);
  } else {
    await setDoc(entityRef, { ...restorePatch, id: entityId }, { merge: true });
  }

  await updateDoc(ref, {
    status: 'restored',
    restoredAt: nowIso,
    restoredByUid: restoredBy?.uid || '',
    restoredByEmail: restoredBy?.email || restoredBy?.name || '',
  });

  await logActivity(`entity_restored_${entityType}`, {
    entityType,
    entityId,
    archiveRecordId,
    userId: restoredBy?.uid,
    userName: restoredBy?.email || restoredBy?.name,
    storeId: rec.branchId || 'default',
  });

  return { success: true, entityType, entityId };
};

/** Permanent delete — Super Admin + confirm phrase only. */
export const permanentDeleteArchiveRecord = async (
  archiveRecordId,
  { confirmPhrase, deletedBy = {}, isSuperAdmin = false } = {},
) => {
  if (!isSuperAdmin) throw new Error('Sirf Super Admin permanent delete kar sakta hai');
  if (String(confirmPhrase || '').trim() !== PERMANENT_DELETE_PHRASE) {
    throw new Error(`Likho: ${PERMANENT_DELETE_PHRASE}`);
  }
  _requireOnline();

  const ref = doc(firestoreDb, ARCHIVE_RECORDS_COLLECTION, archiveRecordId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Archive record nahi mila');

  const rec = snap.data();
  const { entityType, entityId, sourceCollection } = rec;
  const col = sourceCollection || COLLECTION_BY_TYPE[entityType];
  const nowIso = new Date().toISOString();

  if (entityType === ENTITY_TYPES.USER) {
    await permanentDeleteUserAccount(entityId, deletedBy);
  } else if (entityType === ENTITY_TYPES.BACKUP) {
    const chunkCount = rec.payload?.chunkCount || 1;
    if (rec.payload?.hasPayload || rec.payload?.payloadKeptInCloud) {
      try {
        await deleteCloudBackup(entityId, chunkCount);
      } catch (e) {
        console.warn('[archiveService] backup cloud purge:', e?.message);
      }
    }
  } else {
    try {
      await deleteDoc(doc(firestoreDb, col, entityId));
    } catch (e) {
      console.warn('[archiveService] source delete:', e?.message);
    }

    if (entityType === ENTITY_TYPES.ORDER) {
      try {
        await setDoc(doc(firestoreDb, COLLECTION_NAMES.deletedBills || 'deletedBills', entityId), {
          ...(rec.payload || {}),
          hardDeletedAt: nowIso,
          hardDeleteReason: 'permanent_from_archive',
        }, { merge: true });
      } catch { /* ignore */ }
    }
  }

  await updateDoc(ref, {
    status: 'permanent',
    permanentAt: nowIso,
    permanentByUid: deletedBy?.uid || '',
    permanentByEmail: deletedBy?.email || '',
  });

  await logActivity(`entity_permanent_delete_${entityType}`, {
    entityType,
    entityId,
    archiveRecordId,
    userId: deletedBy?.uid,
    userName: deletedBy?.email || deletedBy?.name,
  });

  return { success: true };
};

/**
 * Permanent delete a single bill/order straight from Bills Control.
 * Removes the source `orders` doc forever, keeps a `deletedBills` audit stub,
 * marks any linked archive record permanent, and purges the local Dexie copy.
 * Allowed for elevated roles + managers (caller must gate the UI).
 */
export const permanentDeleteOrder = async (order, {
  deletedBy = {},
  reason = 'permanent_delete_from_bills',
} = {}) => {
  const orderId = order?.id || order?.firebaseId || order?.orderId;
  if (!orderId) throw new Error('Order ID zaroori hai');
  _requireOnline();

  const nowIso = new Date().toISOString();
  const ordersCol = COLLECTION_NAMES.orders || 'orders';

  let snapshot = order && Object.keys(order).length > 3 ? { ...order } : null;
  if (!snapshot) {
    try {
      const snap = await getDoc(doc(firestoreDb, ordersCol, orderId));
      if (snap.exists()) snapshot = { id: snap.id, ...snap.data() };
    } catch { /* ignore */ }
  }

  const branchId = _branchFromData(snapshot || {}) || snapshot?.storeId || null;
  const label = snapshot?.serialNo || snapshot?.billSerial || orderId;

  // Always keep a full snapshot in Archive as the record of this deletion.
  let archiveRecordId = order?.archiveRecordId || snapshot?.archiveRecordId || null;
  if (!archiveRecordId) {
    try {
      const written = await _writeArchiveRecord({
        entityType: ENTITY_TYPES.ORDER,
        entityId: orderId,
        sourceCollection: ordersCol,
        snapshot: snapshot || { id: orderId },
        branchId,
        deletedBy,
        reason,
        label,
      });
      archiveRecordId = written.archiveRecordId;
    } catch { /* archive record best-effort */ }
  }
  if (archiveRecordId) {
    try {
      await updateDoc(doc(firestoreDb, ARCHIVE_RECORDS_COLLECTION, archiveRecordId), {
        status: 'permanent',
        permanentAt: nowIso,
        permanentByUid: deletedBy?.uid || '',
        permanentByEmail: deletedBy?.email || deletedBy?.name || '',
      });
    } catch { /* ignore */ }
  }

  await deleteDoc(doc(firestoreDb, ordersCol, orderId));

  try {
    await setDoc(doc(firestoreDb, COLLECTION_NAMES.deletedBills || 'deletedBills', orderId), {
      ...(snapshot || {}),
      orderId,
      billId: orderId,
      billSerial: label,
      serialNo: label,
      storeId: branchId,
      archiveRecordId: archiveRecordId || null,
      deletedAt: nowIso,
      hardDeletedAt: nowIso,
      hardDeleteReason: reason,
      reason,
      hardDeletedByUid: deletedBy?.uid || deletedBy?.id || '',
      hardDeletedByEmail: deletedBy?.email || deletedBy?.name || 'Admin',
    }, { merge: true });
  } catch { /* non-critical audit stub */ }

  try {
    if (dexieDb?.orders) {
      const local = await dexieDb.orders
        .filter((o) => o.firebaseId === orderId || o.localId === orderId || o.id === orderId)
        .first();
      if (local) await dexieDb.orders.delete(local.localId || local.id);
    }
  } catch { /* ignore */ }

  await logActivity('entity_permanent_delete_order', {
    entityType: ENTITY_TYPES.ORDER,
    entityId: orderId,
    archiveRecordId: archiveRecordId || null,
    reason,
    userId: deletedBy?.uid,
    userName: deletedBy?.email || deletedBy?.name,
    storeId: branchId,
  });

  return { success: true, entityId: orderId };
};

export {
  listArchiveBatches,
  restoreArchivedBatch,
  backupAndArchiveOldData,
} from './backupService';

export default {
  ARCHIVE_RECORDS_COLLECTION,
  PERMANENT_DELETE_PHRASE,
  ENTITY_TYPES,
  listArchiveRecords,
  softArchiveEntity,
  softArchiveOrder,
  softArchiveCustomer,
  softArchiveUser,
  softArchiveBackup,
  restoreArchiveRecord,
  permanentDeleteArchiveRecord,
  permanentDeleteOrder,
};
