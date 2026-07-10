// File: src/services/backupService.js
// Full database backup, cloud storage, restore, and scheduled backups

import { db as dexieDb } from '../db/index';
import localDB from './localDB';
import { getCachedSettings } from './settingsStore';
import {
  auth,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  query,
  orderBy,
  limit,
  startAfter,
  where,
  db as firestoreDb,
  isFirebaseReady,
} from './firebase';
import { MODULE_BACKUP_QUERY_LIMIT, MODULE_PURGE_MAX_BATCHES } from '../utils/firebaseQuotaConfig';
import * as XLSX from 'xlsx';

export const BACKUP_VERSION = 2;
export const SCHEDULE_OPTIONS = ['off', 'daily', 'weekly', 'monthly'];
const CHUNK_SIZE = 750_000;
const LS_SCHEDULE_KEY = 'aone_backup_schedule';
const SETUP_CACHE_KEY = 'system_setup_done_enc';

const _formatFilename = () => {
  const d = new Date().toISOString().split('T')[0];
  return `aone_jewelry_backup_${d}.json`;
};

export const formatBackupSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
};

/** Collect all Dexie tables + app settings into one payload. */
export const collectBackupPayload = async (meta = {}) => {
  const tables = {};
  for (const table of dexieDb.tables) {
    try {
      tables[table.name] = await table.toArray();
    } catch {
      tables[table.name] = [];
    }
  }

  let localDbData = {};
  try {
    localDbData = {
      users: await localDB.users?.toArray?.() || [],
      bills: await localDB.bills?.toArray?.() || [],
      settings: await localDB.settings?.toArray?.() || [],
      syncQueue: await localDB.syncQueue?.toArray?.() || [],
    };
  } catch {
    localDbData = {};
  }

  let appSettings = {};
  try {
    appSettings = getCachedSettings();
  } catch {
    appSettings = {};
  }

  const tableCounts = Object.fromEntries(
    Object.entries(tables).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
  );

  return {
    app: 'A One Jewelry POS',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: meta.adminEmail || auth?.currentUser?.email || 'System',
    exportedByUid: meta.adminUid || auth?.currentUser?.uid || null,
    tables,
    localDb: localDbData,
    settings: appSettings,
    meta: {
      tableCounts,
      totalRecords: Object.values(tableCounts).reduce((s, c) => s + c, 0),
      ...meta,
    },
  };
};

export const downloadBackupFile = (payload, filename) => {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, filename || _formatFilename());
  return json.length;
};

const _textEncoder = new TextEncoder();

const _crc32 = (bytes) => {
  let c = ~0;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i];
    for (let j = 0; j < 8; j += 1) {
      c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
  }
  return (c ^ ~0) >>> 0;
};

/** Build a ZIP (stored, no compression) from { name, data: Uint8Array }[] */
export const buildZipBlob = (files = []) => {
  const chunks = [];
  const central = [];
  let offset = 0;

  files.forEach(({ name, data }) => {
    const nameBytes = _textEncoder.encode(name);
    const crc = _crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    chunks.push(local);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);
    offset += local.length;
  });

  const endSize = 22;
  const end = new Uint8Array(endSize);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...chunks, ...central, end], { type: 'application/zip' });
};

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const _writeBackupMetadata = async (backupId, record) => {
  if (!isFirebaseReady() || !firestoreDb) throw new Error('Firebase not ready');
  await setDoc(doc(firestoreDb, 'backups', backupId), {
    id: backupId,
    createdAt: new Date().toISOString(),
    timestamp: serverTimestamp(),
    hasPayload: true,
    ...record,
  });
};

const _writePayloadToCloud = async (backupId, json) => {
  if (!isFirebaseReady() || !firestoreDb) throw new Error('Firebase not ready');

  if (json.length <= CHUNK_SIZE) {
    await setDoc(doc(firestoreDb, 'systemBackups', backupId), {
      id: backupId,
      chunkCount: 1,
      data: json,
      updatedAt: serverTimestamp(),
    });
    return 1;
  }

  const chunks = Math.ceil(json.length / CHUNK_SIZE);
  const batch = writeBatch(firestoreDb);
  for (let i = 0; i < chunks; i++) {
    batch.set(doc(firestoreDb, 'systemBackups', backupId, 'chunks', String(i)), {
      index: i,
      data: json.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
    });
  }
  batch.set(doc(firestoreDb, 'systemBackups', backupId), {
    id: backupId,
    chunkCount: chunks,
    data: null,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return chunks;
};

/** Save full backup payload to Firestore (metadata + chunked payload). */
export const saveBackupToCloud = async (payload, meta = {}) => {
  const backupId = `bup_${Date.now()}`;
  const json = JSON.stringify(payload);
  const chunkCount = await _writePayloadToCloud(backupId, json);
  await _writeBackupMetadata(backupId, {
    adminEmail: meta.adminEmail || payload.exportedBy,
    adminUid: meta.adminUid || payload.exportedByUid,
    scope: meta.scope || 'Full Database Backup',
    target: 'Cloud',
    sizeBytes: json.length,
    chunkCount,
    isSynced: true,
    scheduleType: meta.scheduleType || 'manual',
    checksum: payload.checksum || computePayloadChecksum(json),
    backupKind: meta.backupKind || 'manual',
  });
  return { id: backupId, sizeBytes: json.length, chunkCount };
};

/** Load backup JSON from cloud by backup id. */
export const loadBackupFromCloud = async (backupId) => {
  if (!isFirebaseReady() || !firestoreDb) throw new Error('Firebase not ready');

  const rootSnap = await getDoc(doc(firestoreDb, 'systemBackups', backupId));
  if (!rootSnap.exists()) throw new Error('Backup payload not found in cloud');

  const root = rootSnap.data();
  if (root.data && typeof root.data === 'string') {
    return JSON.parse(root.data);
  }

  const chunkCount = root.chunkCount || 0;
  if (!chunkCount) throw new Error('Backup chunks missing');

  const parts = [];
  for (let i = 0; i < chunkCount; i++) {
    const chunkSnap = await getDoc(doc(firestoreDb, 'systemBackups', backupId, 'chunks', String(i)));
    if (!chunkSnap.exists()) throw new Error(`Backup chunk ${i} missing`);
    parts.push(chunkSnap.data().data || '');
  }
  return JSON.parse(parts.join(''));
};

export const deleteCloudBackup = async (backupId, chunkCount = 1) => {
  if (!isFirebaseReady() || !firestoreDb) throw new Error('Firebase not ready');

  const batch = writeBatch(firestoreDb);
  batch.delete(doc(firestoreDb, 'backups', backupId));
  batch.delete(doc(firestoreDb, 'systemBackups', backupId));
  for (let i = 0; i < chunkCount; i++) {
    batch.delete(doc(firestoreDb, 'systemBackups', backupId, 'chunks', String(i)));
  }
  await batch.commit();
};

/** Restore backup metadata row to History (cloud payload must still exist or be re-uploaded). */
export const restoreBackupToHistory = async (backupId, meta = {}) => {
  if (!isFirebaseReady() || !firestoreDb) throw new Error('Firebase not ready');
  const { embeddedPayload, payloadKeptInCloud, id: _id, ...rest } = meta;
  await setDoc(doc(firestoreDb, 'backups', backupId), {
    ...rest,
    id: backupId,
    isArchived: false,
    archivedAt: null,
    archiveRecordId: null,
    restoredAt: new Date().toISOString(),
    timestamp: serverTimestamp(),
    hasPayload: !!(payloadKeptInCloud || embeddedPayload || rest.hasPayload),
  }, { merge: true });

  if (embeddedPayload && typeof embeddedPayload === 'object') {
    const json = JSON.stringify(embeddedPayload);
    await _writePayloadToCloud(backupId, json);
  }
};

const _preserveSetupCache = async () => {
  try {
    const row = await dexieDb.settings_cache.get(SETUP_CACHE_KEY);
    return row || null;
  } catch {
    return null;
  }
};

const _restoreSetupCache = async (row) => {
  if (!row) return;
  try {
    await dexieDb.settings_cache.put(row);
  } catch { /* ignore */ }
};

/** Restore Dexie + localDB from backup payload. */
export const restoreBackupPayload = async (payload) => {
  if (!payload || payload.version > BACKUP_VERSION) {
    throw new Error('Unsupported or invalid backup file');
  }
  if (!payload.tables || typeof payload.tables !== 'object') {
    throw new Error('Backup file missing table data');
  }

  const setupRow = await _preserveSetupCache();

  for (const table of dexieDb.tables) {
    const rows = payload.tables[table.name];
    if (!Array.isArray(rows)) continue;
    await table.clear();
    if (rows.length > 0) {
      await table.bulkPut(rows);
    }
  }

  await _restoreSetupCache(setupRow);

  if (payload.localDb && typeof payload.localDb === 'object') {
    try {
      if (Array.isArray(payload.localDb.users)) {
        await localDB.users?.clear?.();
        if (payload.localDb.users.length) await localDB.users.bulkPut(payload.localDb.users);
      }
      if (Array.isArray(payload.localDb.bills)) {
        await localDB.bills?.clear?.();
        if (payload.localDb.bills.length) await localDB.bills.bulkPut(payload.localDb.bills);
      }
      if (Array.isArray(payload.localDb.settings)) {
        await localDB.settings?.clear?.();
        if (payload.localDb.settings.length) await localDB.settings.bulkPut(payload.localDb.settings);
      }
      if (Array.isArray(payload.localDb.syncQueue)) {
        await localDB.syncQueue?.clear?.();
        if (payload.localDb.syncQueue.length) await localDB.syncQueue.bulkPut(payload.localDb.syncQueue);
      }
    } catch (err) {
      console.warn('[backupService] localDB restore partial:', err.message);
    }
  }

  return {
    restoredTables: Object.keys(payload.tables).length,
    totalRecords: payload.meta?.totalRecords ?? 0,
  };
};

export const parseBackupFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      resolve(JSON.parse(reader.result));
    } catch (e) {
      reject(new Error('Invalid JSON backup file'));
    }
  };
  reader.onerror = () => reject(new Error('Failed to read backup file'));
  reader.readAsText(file);
});

/** Compute next scheduled run from frequency. */
export const computeNextRunAt = (frequency, fromDate = new Date()) => {
  const base = new Date(fromDate);
  if (frequency === 'off') return null;

  const next = new Date(base);
  if (frequency === 'daily') {
    next.setDate(next.getDate() + 1);
    next.setHours(2, 0, 0, 0);
  } else if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7);
    next.setHours(2, 0, 0, 0);
  } else if (frequency === 'monthly') {
    next.setMonth(next.getMonth() + 1);
    next.setDate(1);
    next.setHours(2, 0, 0, 0);
  }
  return next.toISOString();
};

const _defaultSchedule = () => ({
  frequency: 'off',
  localDownload: true,
  cloudSave: true,
  lastRunAt: null,
  nextRunAt: null,
});

export const getBackupSchedule = async () => {
  try {
    if (isFirebaseReady() && firestoreDb && navigator.onLine) {
      const snap = await getDoc(doc(firestoreDb, 'settings', 'backupSchedule'));
      if (snap.exists()) {
        const data = snap.data();
        try { localStorage.setItem(LS_SCHEDULE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
        return { ..._defaultSchedule(), ...data };
      }
    }
  } catch (err) {
    console.warn('[backupService] schedule read failed:', err.message);
  }

  try {
    const raw = localStorage.getItem(LS_SCHEDULE_KEY);
    if (raw) return { ..._defaultSchedule(), ...JSON.parse(raw) };
  } catch { /* ignore */ }

  return _defaultSchedule();
};

export const saveBackupSchedule = async (schedule, user = {}) => {
  const merged = {
    ..._defaultSchedule(),
    ...schedule,
    updatedAt: new Date().toISOString(),
    updatedBy: user.uid || auth?.currentUser?.uid || null,
    updatedByEmail: user.email || auth?.currentUser?.email || null,
  };

  if (merged.frequency === 'off') {
    merged.nextRunAt = null;
  } else if (!merged.nextRunAt || new Date(merged.nextRunAt) <= new Date()) {
    merged.nextRunAt = computeNextRunAt(merged.frequency);
  }

  try { localStorage.setItem(LS_SCHEDULE_KEY, JSON.stringify(merged)); } catch { /* ignore */ }

  if (isFirebaseReady() && firestoreDb && navigator.onLine) {
    await setDoc(doc(firestoreDb, 'settings', 'backupSchedule'), merged, { merge: true });
  }

  return merged;
};

/** Run scheduled backup when due (cloud + optional local download skipped in background). */
export const runScheduledBackupIfDue = async (user = {}, { force = false } = {}) => {
  const schedule = await getBackupSchedule();
  if (!schedule || schedule.frequency === 'off') return { ran: false, reason: 'off' };
  if (!navigator.onLine || !isFirebaseReady()) return { ran: false, reason: 'offline' };

  const now = Date.now();
  const nextRun = schedule.nextRunAt ? new Date(schedule.nextRunAt).getTime() : 0;
  const lastRun = schedule.lastRunAt ? new Date(schedule.lastRunAt).getTime() : 0;
  const due = !schedule.nextRunAt || nextRun <= now;
  const minGap = 60 * 60 * 1000;

  if (!force && (!due || (lastRun && now - lastRun < minGap))) {
    return { ran: false, reason: 'not_due' };
  }

  const meta = {
    adminEmail: user.email || auth?.currentUser?.email || 'Scheduled Backup',
    adminUid: user.uid || auth?.currentUser?.uid || null,
    scheduleType: schedule.frequency,
  };

  const payload = await collectBackupPayload(meta);
  let cloudResult = null;

  if (schedule.cloudSave !== false) {
    cloudResult = await saveBackupToCloud(payload, {
      ...meta,
      scope: `Scheduled ${schedule.frequency} backup`,
    });
  }

  if (schedule.localDownload) {
    downloadBackupFile(payload, `aone_scheduled_${schedule.frequency}_${new Date().toISOString().split('T')[0]}.json`);
  }

  const updated = await saveBackupSchedule({
    ...schedule,
    lastRunAt: new Date().toISOString(),
    nextRunAt: computeNextRunAt(schedule.frequency),
  }, user);

  return { ran: true, backupId: cloudResult?.id, schedule: updated };
};

let _runnerStarted = false;

export const initScheduledBackupRunner = () => {
  if (_runnerStarted) return;
  _runnerStarted = true;

  const tick = () => {
    runScheduledBackupIfDue().catch(() => {});
  };

  tick();
  setInterval(tick, 15 * 60 * 1000);
};

/** Export orders as real CSV from Dexie. */
export const exportOrdersCsv = async () => {
  const orders = await dexieDb.orders.toArray();
  const header = 'BillId,SerialNo,Status,StoreId,BillerId,Total,SavedAt\n';
  const rows = orders.map((o) => [
    o.billId || '',
    o.serialNo || '',
    o.status || '',
    o.storeId || '',
    o.billerId || '',
    o.finalAmount ?? o.totalAmount ?? '',
    o.savedAt || o.createdAt || '',
  ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  return header + rows;
};

// ═══════════════════════════════════════════════════════════════
// SELECTIVE MODULE BACKUP / EXCEL / PURGE
// ═══════════════════════════════════════════════════════════════

export const DATA_MODULES = {
  orders: {
    label: 'Bills / Orders',
    description: 'Saari bills — cloud + local',
    icon: 'orders',
    firestore: [{ collection: 'orders', dateFields: ['savedAt', 'createdAt'] }],
    dexie: ['orders', 'bill_items'],
  },
  bills: {
    label: 'Bills (legacy)',
    description: 'Bill records & line items',
    icon: 'bills',
    firestore: [{ collection: 'bills', dateFields: ['createdAt', 'updatedAt'] }],
    dexie: ['bills', 'bill_items'],
  },
  customers: {
    label: 'Customers',
    description: 'Gahak — cloud + local',
    icon: 'customers',
    firestore: [{ collection: 'customers', dateFields: ['createdAt', 'updatedAt'] }],
    dexie: ['customers'],
  },
  stores: {
    label: 'Branches / Stores',
    description: 'Dukan branches',
    icon: 'stores',
    firestore: [{ collection: 'stores', dateFields: ['createdAt', 'updatedAt'] }],
    dexie: [],
  },
  settings: {
    label: 'Shop Settings',
    description: 'Super Admin settings & setup',
    icon: 'settings',
    firestore: [{ collection: 'settings', dateFields: ['updatedAt', 'createdAt'] }],
    dexie: ['settings', 'settings_cache'],
  },
  payments: {
    label: 'Payments',
    description: 'Cashier payments',
    icon: 'payments',
    firestore: [{ collection: 'payments', dateFields: ['createdAt', 'timestamp'] }],
    dexie: ['payments'],
  },
  expenses: {
    label: 'Expenses',
    description: 'Manager expenses',
    icon: 'expenses',
    firestore: [{ collection: 'expenses', dateFields: ['date', 'createdAt'] }],
    dexie: ['expenses'],
  },
  returns: {
    label: 'Returns',
    description: 'Return records',
    icon: 'returns',
    firestore: [{ collection: 'returns', dateFields: ['createdAt', 'processedAt'] }],
    dexie: ['returns'],
  },
  users: {
    label: 'All Users',
    description: 'Tamam staff profiles',
    icon: 'users',
    firestore: [{ collection: 'users', dateFields: ['createdAt', 'lastLoginAt'] }],
    dexie: ['users'],
    purgeGuard: 'users',
  },
  users_managers: {
    label: 'Managers',
    description: 'Sirf manager accounts',
    icon: 'users',
    baseModule: 'users',
    roleFilter: ['manager'],
    firestore: [],
    dexie: [],
  },
  users_billers: {
    label: 'Billers',
    description: 'Sirf biller accounts',
    icon: 'users',
    baseModule: 'users',
    roleFilter: ['biller'],
    firestore: [],
    dexie: [],
  },
  users_cashiers: {
    label: 'Cashiers',
    description: 'Sirf cashier accounts',
    icon: 'users',
    baseModule: 'users',
    roleFilter: ['cashier'],
    firestore: [],
    dexie: [],
  },
  users_admins: {
    label: 'Super Admin / Admin',
    description: 'Admin accounts',
    icon: 'users',
    baseModule: 'users',
    roleFilter: ['superAdmin', 'superadmin', 'super_admin', 'admin'],
    firestore: [],
    dexie: [],
  },
  activity: {
    label: 'Activity Logs',
    description: 'Activity, audit & cashier logs',
    icon: 'activity',
    firestore: [
      { collection: 'activityLogs', dateFields: ['timestamp', 'createdAt'] },
      { collection: 'auditLogs', dateFields: ['timestamp', 'createdAt'] },
      { collection: 'cashierActions', dateFields: ['timestamp', 'performedAt', 'createdAt'] },
    ],
    dexie: ['activity_logs_local', 'logs'],
  },
  superAdminActivity: {
    label: 'Super Admin Activity',
    description: 'Super Admin actions only',
    icon: 'shield',
    firestore: [{ collection: 'superAdminActivityLogs', dateFields: ['timestamp', 'createdAt'] }],
    dexie: [],
  },
};

/** Modules shown in Backup → Jaiza (separate files in ZIP) */
export const EXPORT_MODULE_KEYS = [
  'orders',
  'customers',
  'stores',
  'settings',
  'payments',
  'expenses',
  'returns',
  'users_admins',
  'users_managers',
  'users_billers',
  'users_cashiers',
  'activity',
  'superAdminActivity',
];

const _extractRecordDate = (record, dateFields = []) => {
  for (const field of dateFields) {
    const v = record?.[field];
    if (!v) continue;
    if (v?.toDate) return v.toDate();
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const fallback = record?.createdAt || record?.savedAt || record?.timestamp;
  if (fallback?.toDate) return fallback.toDate();
  if (fallback) {
    const d = new Date(fallback);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
};

const _computeCutoff = ({ beforeMonth, olderThanDays } = {}) => {
  if (beforeMonth) {
    return new Date(`${beforeMonth}-01T00:00:00`);
  }
  if (olderThanDays && olderThanDays > 0) {
    const d = new Date();
    d.setDate(d.getDate() - olderThanDays);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return null;
};

const _isOlderThanCutoff = (record, dateFields, cutoff) => {
  if (!cutoff) return true;
  const d = _extractRecordDate(record, dateFields);
  if (!d) return false;
  return d < cutoff;
};

const _ORDER_FIELD = {
  orders: 'createdAt',
  bills: 'createdAt',
  users: 'createdAt',
  customers: 'createdAt',
  activityLogs: 'timestamp',
  auditLogs: 'timestamp',
  cashierActions: 'timestamp',
  payments: 'timestamp',
  superAdminActivityLogs: 'timestamp',
};

/** Capped Firestore fetch — avoids reading 2,500+ activityLogs in one backup click. */
const _fetchFirestoreDocsCapped = async (collectionName, dateFields, {
  max = MODULE_BACKUP_QUERY_LIMIT,
  direction = 'desc',
  tag = 'backup',
} = {}) => {
  if (!isFirebaseReady() || !firestoreDb || !navigator.onLine) return [];

  const orderField = _ORDER_FIELD[collectionName] || dateFields?.[0] || 'createdAt';
  let docs = [];

  try {
    const snap = await getDocs(query(
      collection(firestoreDb, collectionName),
      orderBy(orderField, direction),
      limit(max),
    ));
    docs = snap.docs.map((d) => ({ _docId: d.id, _collection: collectionName, ...d.data() }));
  } catch {
    try {
      const snap = await getDocs(query(collection(firestoreDb, collectionName), limit(max)));
      docs = snap.docs.map((d) => ({ _docId: d.id, _collection: collectionName, ...d.data() }));
    } catch { /* ignore */ }
  }

  return docs;
};

const _fetchOldFirestoreDocsCapped = async (collectionName, dateFields, cutoff, tag = 'purge') => {
  const found = [];
  for (let batch = 0; batch < MODULE_PURGE_MAX_BATCHES; batch += 1) {
    const rows = await _fetchFirestoreDocsCapped(collectionName, dateFields, {
      max: MODULE_BACKUP_QUERY_LIMIT,
      direction: 'asc',
      tag,
    });
    const old = rows.filter((r) => _isOlderThanCutoff(r, dateFields, cutoff));
    found.push(...old);
    if (rows.length < MODULE_BACKUP_QUERY_LIMIT) break;
  }
  return found;
};

const _isWithinRange = (record, dateFields, since, until) => {
  const d = _extractRecordDate(record, dateFields);
  if (!d) return false;
  if (since && d < since) return false;
  if (until && d > until) return false;
  return true;
};

export const scopeToSinceDate = (scope) => {
  const now = new Date();
  const since = new Date(now);
  if (scope === 'today') {
    since.setHours(0, 0, 0, 0);
  } else if (scope === 'week') {
    since.setDate(since.getDate() - 7);
    since.setHours(0, 0, 0, 0);
  } else if (scope === 'month') {
    since.setDate(since.getDate() - 30);
    since.setHours(0, 0, 0, 0);
  } else if (scope === '3months') {
    since.setDate(since.getDate() - 90);
    since.setHours(0, 0, 0, 0);
  } else {
    return null;
  }
  return since;
};

/** Fetch module records within a date range (inclusive). */
export const collectModuleRecordsInRange = async (moduleKey, { since, until = new Date() } = {}) => {
  const mod = DATA_MODULES[moduleKey];
  if (!mod) throw new Error('Unknown data module');
  if (!since) throw new Error('since date required');

  const firestoreRecords = [];
  if (isFirebaseReady() && firestoreDb && navigator.onLine) {
    for (const src of mod.firestore || []) {
      const rows = await _fetchFirestoreDocsCapped(src.collection, src.dateFields, { tag: 'backup_range' });
      rows.forEach((data) => {
        if (_isWithinRange(data, src.dateFields, since, until)) {
          firestoreRecords.push(data);
        }
      });
    }
  }

  const dexieRecords = {};
  let dexieCount = 0;
  for (const table of mod.dexie || []) {
    if (!dexieDb[table]) continue;
    const rows = await dexieDb[table].toArray();
    const dateFields = ['savedAt', 'createdAt', 'timestamp', 'updatedAt'];
    const filtered = rows.filter((r) => _isWithinRange(r, dateFields, since, until));
    dexieRecords[table] = filtered;
    dexieCount += filtered.length;
  }

  return {
    module: moduleKey,
    label: mod.label,
    since: since.toISOString(),
    until: until.toISOString(),
    firestore: firestoreRecords,
    dexie: dexieRecords,
    counts: {
      firestore: firestoreRecords.length,
      dexie: dexieCount,
      total: firestoreRecords.length + dexieCount,
    },
  };
};

export const BACKUP_SCOPES = ['today', 'week', 'month', '3months', 'full'];

/** Scoped backup payload for Super Admin assistant. */
export const buildScopedBackupPayload = async (scope, meta = {}) => {
  if (scope === 'full') {
    return collectBackupPayload({ ...meta, scope: 'full' });
  }

  const since = scopeToSinceDate(scope);
  if (!since) throw new Error('Invalid backup scope');

  const moduleKeys = ['orders', 'bills', 'activity'];
  const modules = {};
  for (const key of moduleKeys) {
    modules[key] = await collectModuleRecordsInRange(key, { since });
  }

  return {
    app: 'A One Jewelry POS',
    version: BACKUP_VERSION,
    backupScope: scope,
    exportedAt: new Date().toISOString(),
    exportedBy: meta.adminEmail || auth?.currentUser?.email || 'System',
    exportedByUid: meta.adminUid || auth?.currentUser?.uid || null,
    since: since.toISOString(),
    until: new Date().toISOString(),
    modules,
    meta: {
      scope,
      moduleCounts: Object.fromEntries(
        Object.entries(modules).map(([k, v]) => [k, v.counts?.total || 0]),
      ),
      ...meta,
    },
  };
};

export const downloadScopedBackup = (payload, scope) => {
  const d = new Date().toISOString().split('T')[0];
  const name = scope === 'full'
    ? `aone_full_backup_${d}.json`
    : `aone_${scope}_backup_${d}.json`;
  return downloadBackupFile(payload, name);
};

/** Backup old data then purge from Firebase (Super Admin storage cleanup). */
export const backupAndPurgeOldData = async ({
  olderThanDays = 90,
  modules = ['orders', 'activity'],
  currentUid,
  onProgress,
} = {}) => {
  const filters = { olderThanDays };
  const bundles = [];
  for (const mod of modules) {
    onProgress?.(`Collecting old ${mod}…`);
    bundles.push({ key: mod, bundle: await collectModuleRecords(mod, filters) });
  }

  const totalRecords = bundles.reduce((s, b) => s + (b.bundle.counts?.total || 0), 0);
  if (!totalRecords) {
    return { downloaded: false, purged: false, totalRecords: 0 };
  }

  const payload = {
    app: 'A One Jewelry POS',
    purgeBackup: true,
    olderThanDays,
    exportedAt: new Date().toISOString(),
    modules: Object.fromEntries(bundles.map((b) => [b.key, b.bundle])),
  };
  downloadBackupFile(payload, `aone_purge_backup_${olderThanDays}d_${new Date().toISOString().split('T')[0]}.json`);

  let deletedFirestore = 0;
  let deletedDexie = 0;
  for (const { key, bundle } of bundles) {
    onProgress?.(`Purging ${key}…`);
    const result = await purgeModuleRecords(key, bundle, { currentUid });
    deletedFirestore += result.deletedFirestore;
    deletedDexie += result.deletedDexie;
  }

  return { downloaded: true, purged: true, totalRecords, deletedFirestore, deletedDexie };
};

const _flattenForExcel = (row) => {
  const flat = {};
  Object.entries(row).forEach(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && !v.toDate) {
      flat[k] = JSON.stringify(v);
    } else if (v?.toDate) {
      flat[k] = v.toDate().toISOString();
    } else if (Array.isArray(v)) {
      flat[k] = JSON.stringify(v);
    } else {
      flat[k] = v ?? '';
    }
  });
  return flat;
};

/** Fetch records for a specific module, optionally filtered to OLD data only. */
export const collectModuleRecords = async (moduleKey, filters = {}) => {
  const mod = DATA_MODULES[moduleKey];
  if (!mod) throw new Error('Unknown data module');

  const cutoff = _computeCutoff(filters);
  const firestoreRecords = [];

  if (isFirebaseReady() && firestoreDb && navigator.onLine) {
    for (const src of mod.firestore || []) {
      const rows = await _fetchOldFirestoreDocsCapped(src.collection, src.dateFields, cutoff, 'purge');
      firestoreRecords.push(...rows);
    }
  }

  const dexieRecords = {};
  let dexieCount = 0;
  for (const table of mod.dexie || []) {
    if (!dexieDb[table]) continue;
    const rows = await dexieDb[table].toArray();
    const dateFields = ['savedAt', 'createdAt', 'timestamp', 'updatedAt'];
    const filtered = rows.filter((r) => _isOlderThanCutoff(r, dateFields, cutoff));
    dexieRecords[table] = filtered;
    dexieCount += filtered.length;
  }

  return {
    module: moduleKey,
    label: mod.label,
    cutoff: cutoff?.toISOString() || null,
    firestore: firestoreRecords,
    dexie: dexieRecords,
    counts: {
      firestore: firestoreRecords.length,
      dexie: dexieCount,
      total: firestoreRecords.length + dexieCount,
    },
  };
};

const _filterByRoles = (records, roleFilter) => {
  if (!roleFilter?.length) return records;
  const roles = Array.isArray(roleFilter) ? roleFilter : [roleFilter];
  return records.filter((u) => {
    const userRoles = u.roles || [u.role].filter(Boolean);
    return userRoles.some((r) => roles.includes(r));
  });
};

/** Full export — saari rows (date filter nahi) */
export const collectModuleRecordsFull = async (moduleKey) => {
  const mod = DATA_MODULES[moduleKey];
  if (!mod) throw new Error('Unknown data module');

  const sourceKey = mod.baseModule || moduleKey;
  const sourceMod = DATA_MODULES[sourceKey];
  const exportKey = moduleKey;

  const firestoreRecords = [];
  if (isFirebaseReady() && firestoreDb && navigator.onLine) {
    for (const src of sourceMod.firestore || []) {
      const rows = await _fetchFirestoreDocsCapped(src.collection, src.dateFields, { tag: 'export_full' });
      firestoreRecords.push(...rows);
    }
  }

  let filteredFirestore = _filterByRoles(firestoreRecords, mod.roleFilter);

  const dexieRecords = {};
  let dexieCount = 0;
  if (!mod.baseModule) {
    for (const table of sourceMod.dexie || []) {
      if (!dexieDb[table]) continue;
      const rows = await dexieDb[table].toArray();
      dexieRecords[table] = rows;
      dexieCount += rows.length;
    }
  }

  if (mod.roleFilter && dexieRecords.users) {
    dexieRecords.users = _filterByRoles(dexieRecords.users, mod.roleFilter);
    dexieCount = Object.values(dexieRecords).reduce((s, arr) => s + (arr?.length || 0), 0);
  }

  return {
    module: exportKey,
    label: mod.label,
    cutoff: null,
    firestore: filteredFirestore,
    dexie: dexieRecords,
    counts: {
      firestore: filteredFirestore.length,
      dexie: dexieCount,
      total: filteredFirestore.length + dexieCount,
    },
  };
};

/** Har module alag file — ZIP folder structure */
export const downloadAllModulesSeparatedZip = async (meta = {}, onProgress) => {
  const d = new Date().toISOString().split('T')[0];
  const files = [];
  const readme = [
    'A One Jewelry POS — Module Backup',
    `Date: ${d}`,
    '',
    'Har folder alag data hai:',
    '  orders/     — Bills',
    '  customers/  — Gahak',
    '  settings/   — Shop settings',
    '  users-*/    — Staff by role',
    '',
    'Har folder mein .json aur .csv hai.',
    'Restore: Admin → Backup → Jaiza → JSON file upload',
    'Migration: Migrate tab → JSON (poora export alag)',
    '',
    'Sab MANUAL — auto import nahi.',
  ].join('\n');
  files.push({ name: `README-${d}.txt`, data: _textEncoder.encode(readme) });

  for (const key of EXPORT_MODULE_KEYS) {
    onProgress?.(key);
    try {
      const bundle = await collectModuleRecordsFull(key);
      const payload = {
        app: 'A One Jewelry POS',
        module: bundle.module,
        exportedAt: new Date().toISOString(),
        counts: bundle.counts,
        firestore: bundle.firestore,
        dexie: bundle.dexie,
      };
      const folder = key.replace(/_/g, '-');
      files.push({
        name: `${folder}/${folder}.json`,
        data: _textEncoder.encode(JSON.stringify(payload, null, 2)),
      });
      files.push({
        name: `${folder}/${folder}.csv`,
        data: _textEncoder.encode(moduleBundleToCsv(bundle)),
      });
    } catch (e) {
      console.warn(`[backup] module ${key}:`, e?.message);
    }
  }

  const zipBlob = buildZipBlob(files);
  downloadBlob(zipBlob, `aone_modules_backup_${d}.zip`);
  return files.length;
};

export const downloadModuleJson = (bundle, filename) => {
  const payload = {
    app: 'A One Jewelry POS',
    module: bundle.module,
    exportedAt: new Date().toISOString(),
    cutoff: bundle.cutoff,
    counts: bundle.counts,
    firestore: bundle.firestore,
    dexie: bundle.dexie,
  };
  downloadBackupFile(payload, filename || `aone_${bundle.module}_${new Date().toISOString().split('T')[0]}.json`);
  return JSON.stringify(payload).length;
};

const _csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export const moduleBundleToCsv = (bundle) => {
  const header = ['source', 'collection', 'id', 'date', 'payload'].map(_csvCell).join(',');
  const rows = [];

  (bundle.firestore || []).forEach((rec) => {
    const date = rec.savedAt || rec.createdAt || rec.timestamp || '';
    rows.push([
      'cloud',
      rec._collection || bundle.module,
      rec._docId || rec.id || '',
      date,
      JSON.stringify(rec),
    ].map(_csvCell).join(','));
  });

  Object.entries(bundle.dexie || {}).forEach(([table, arr]) => {
    (arr || []).forEach((rec) => {
      const date = rec.savedAt || rec.createdAt || rec.timestamp || '';
      rows.push([
        `local:${table}`,
        table,
        rec.localId || rec.id || '',
        date,
        JSON.stringify(rec),
      ].map(_csvCell).join(','));
    });
  });

  return rows.length ? `${header}\n${rows.join('\n')}` : `${header}\n`;
};

export const downloadModuleCsv = (bundle, filename) => {
  const csv = moduleBundleToCsv(bundle);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const name = filename || `aone_${bundle.module}_${new Date().toISOString().split('T')[0]}.csv`;
  downloadBlob(blob, name);
  return csv.length;
};

export const downloadModuleZip = (bundle, filename) => {
  const payload = {
    app: 'A One Jewelry POS',
    module: bundle.module,
    exportedAt: new Date().toISOString(),
    cutoff: bundle.cutoff,
    counts: bundle.counts,
    firestore: bundle.firestore,
    dexie: bundle.dexie,
  };
  const jsonBytes = _textEncoder.encode(JSON.stringify(payload, null, 2));
  const csvBytes = _textEncoder.encode(moduleBundleToCsv(bundle));
  const base = bundle.module || 'data';
  const zipBlob = buildZipBlob([
    { name: `${base}-data.json`, data: jsonBytes },
    { name: `${base}-data.csv`, data: csvBytes },
  ]);
  const name = filename || `aone_${base}_${new Date().toISOString().split('T')[0]}.zip`;
  downloadBlob(zipBlob, name);
  return jsonBytes.length + csvBytes.length;
};

/** Full DB backup as ZIP — har module alag folder/file */
export const downloadFullBackupZip = async (meta = {}, onProgress) => {
  return downloadAllModulesSeparatedZip(meta, onProgress);
};

export const downloadModuleExcel = (bundle, filename) => {
  const wb = XLSX.utils.book_new();

  if (bundle.firestore?.length) {
    const rows = bundle.firestore.map(_flattenForExcel);
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Cloud Data');
  }

  Object.entries(bundle.dexie || {}).forEach(([table, rows]) => {
    if (!rows?.length) return;
    const flat = rows.map(_flattenForExcel);
    const safeName = table.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat), safeName);
  });

  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ message: 'No records found' }]), 'Empty');
  }

  const name = filename || `aone_${bundle.module}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, name);
};

const _canPurgeUser = (userData, currentUid) => {
  if (userData._docId === currentUid) return false;
  const roles = userData.roles || [userData.role].filter(Boolean);
  if (roles.some((r) => ['superAdmin', 'superadmin', 'super_admin'].includes(r))) return false;
  return true;
};

/** Delete old records from Firebase + local after backup. Super Admin only for sensitive modules. */
export const purgeModuleRecords = async (moduleKey, bundle, { currentUid } = {}) => {
  const mod = DATA_MODULES[moduleKey];
  if (!mod) throw new Error('Unknown data module');
  if (!isFirebaseReady() || !firestoreDb || !navigator.onLine) {
    throw new Error('Must be online to purge cloud data');
  }

  let deletedFirestore = 0;
  const batchSize = 400;

  if (mod.purgeGuard === 'users') {
    const toDelete = bundle.firestore.filter((u) => _canPurgeUser(u, currentUid));
    for (let i = 0; i < toDelete.length; i += batchSize) {
      const batch = writeBatch(firestoreDb);
      toDelete.slice(i, i + batchSize).forEach((rec) => {
        batch.delete(doc(firestoreDb, rec._collection, rec._docId));
      });
      await batch.commit();
      deletedFirestore += Math.min(batchSize, toDelete.length - i);
    }
  } else {
    for (let i = 0; i < bundle.firestore.length; i += batchSize) {
      const batch = writeBatch(firestoreDb);
      bundle.firestore.slice(i, i + batchSize).forEach((rec) => {
        batch.delete(doc(firestoreDb, rec._collection, rec._docId));
      });
      await batch.commit();
      deletedFirestore += Math.min(batchSize, bundle.firestore.length - i);
    }
  }

  let deletedDexie = 0;
  for (const [table, rows] of Object.entries(bundle.dexie || {})) {
    if (!dexieDb[table] || !rows?.length) continue;
    const ids = rows.map((r) => r.localId ?? r.id ?? r.key).filter(Boolean);
    await dexieDb[table].bulkDelete(ids);
    deletedDexie += ids.length;
  }

  return { deletedFirestore, deletedDexie };
};

// ═══════════════════════════════════════════════════════════════
// MIGRATION + SOFT ARCHIVE (no hard delete)
// ═══════════════════════════════════════════════════════════════

export const MIGRATION_CONFIRM_PHRASE = 'DATA VERIFIED';
export const BACKUP_KINDS = ['manual', 'scheduled', 'migration', 'archive', 'scoped'];

export const MIGRATION_COLLECTIONS = [
  'orders', 'customers', 'users', 'stores', 'settings', 'payments',
  'activityLogs', 'auditLogs', 'cashierActions', 'dailySummaries',
  'expenses', 'returns', 'inventory', 'sync_ops',
];

const MIGRATION_FETCH_LIMIT = 2500;

export const computePayloadChecksum = (json = '') => {
  let h = 0;
  for (let i = 0; i < json.length; i += 1) {
    h = ((h << 5) - h) + json.charCodeAt(i);
    h |= 0;
  }
  return `chk_${Math.abs(h).toString(16)}`;
};

const _fetchCollectionForMigration = async (collectionName, max = MIGRATION_FETCH_LIMIT) => {
  if (!isFirebaseReady() || !firestoreDb || !navigator.onLine) return [];
  const rows = [];
  let lastDoc = null;
  const pageSize = 400;

  while (rows.length < max) {
    const constraints = [limit(Math.min(pageSize, max - rows.length))];
    if (lastDoc) constraints.push(startAfter(lastDoc));
    let snap;
    try {
      snap = await getDocs(query(collection(firestoreDb, collectionName), ...constraints));
    } catch {
      try {
        snap = await getDocs(query(collection(firestoreDb, collectionName), limit(Math.min(pageSize, max - rows.length))));
      } catch {
        break;
      }
    }
    if (!snap.docs.length) break;
    snap.docs.forEach((d) => {
      rows.push({ _docId: d.id, _collection: collectionName, ...d.data() });
    });
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < pageSize) break;
  }
  return rows;
};

/** Full export package for new Firebase project. */
export const buildMigrationExportPayload = async (meta = {}) => {
  const localPayload = await collectBackupPayload({
    ...meta,
    backupKind: 'migration',
    scope: meta.scope || 'Migration export — new Firebase project',
  });

  const collections = {};
  if (navigator.onLine && isFirebaseReady() && firestoreDb) {
    for (const col of MIGRATION_COLLECTIONS) {
      collections[col] = await _fetchCollectionForMigration(col);
    }
  }

  const collectionCounts = Object.fromEntries(
    Object.entries(collections).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
  );
  const cloudTotal = Object.values(collectionCounts).reduce((s, n) => s + n, 0);

  const payload = {
    ...localPayload,
    migration: true,
    backupKind: 'migration',
    sourceProjectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'unknown',
    targetProjectHint: meta.targetProjectId || '',
    collections,
    collectionCounts,
    manifest: {
      exportedAt: new Date().toISOString(),
      exportedBy: meta.adminEmail || localPayload.exportedBy,
      localRecords: localPayload.meta?.totalRecords || 0,
      cloudRecords: cloudTotal,
      collections: collectionCounts,
    },
  };

  const json = JSON.stringify(payload);
  payload.checksum = computePayloadChecksum(json);
  return payload;
};

export const downloadMigrationPackage = async (meta = {}) => {
  const payload = await buildMigrationExportPayload(meta);
  const json = JSON.stringify(payload);
  const d = new Date().toISOString().split('T')[0];
  const backupId = `bup_${Date.now()}`;
  downloadBackupFile(payload, `aone_migration_${d}.json`);

  if (isFirebaseReady() && firestoreDb && navigator.onLine) {
    try {
      await setDoc(doc(firestoreDb, 'backups', backupId), {
        id: backupId,
        createdAt: new Date().toISOString(),
        timestamp: serverTimestamp(),
        adminEmail: meta.adminEmail || payload.exportedBy,
        scope: 'Migration — new Firebase project',
        scheduleType: 'migration',
        sizeBytes: json.length,
        target: 'Local PC',
        hasPayload: false,
        isSynced: false,
      });
    } catch { /* ignore */ }
  }

  return {
    backupId,
    sizeBytes: json.length,
    collectionCounts: payload.collectionCounts,
  };
};

const _writeArchiveBatchMeta = async (batchId, record) => {
  if (!isFirebaseReady() || !firestoreDb) return;
  await setDoc(doc(firestoreDb, 'archiveBatches', batchId), {
    id: batchId,
    status: 'completed',
    restoreAvailable: true,
    createdAt: new Date().toISOString(),
    timestamp: serverTimestamp(),
    ...record,
  }, { merge: true });
};

/** Soft-archive Firestore + local records (never hard-delete orders by default). */
export const archiveModuleRecordsSoft = async (
  moduleKey,
  bundle,
  { archivedBy = 'Admin', archiveBatchId, reason = 'archive' } = {},
) => {
  const mod = DATA_MODULES[moduleKey];
  if (!mod) throw new Error('Unknown data module');
  if (!isFirebaseReady() || !firestoreDb || !navigator.onLine) {
    throw new Error('Must be online to archive cloud data');
  }

  const batchId = archiveBatchId || `arc_${Date.now()}`;
  let archivedFirestore = 0;
  const batchSize = 400;
  const nowIso = new Date().toISOString();

  for (let i = 0; i < bundle.firestore.length; i += batchSize) {
    const batch = writeBatch(firestoreDb);
    bundle.firestore.slice(i, i + batchSize).forEach((rec) => {
      const ref = doc(firestoreDb, rec._collection, rec._docId);
      batch.set(ref, {
        isArchived: true,
        isActiveOrder: false,
        archiveBatchId: batchId,
        archivedAt: nowIso,
        archivedBy,
        archiveReason: reason,
      }, { merge: true });
    });
    await batch.commit();
    archivedFirestore += Math.min(batchSize, bundle.firestore.length - i);
  }

  let archivedDexie = 0;
  for (const [table, rows] of Object.entries(bundle.dexie || {})) {
    if (!dexieDb[table] || !rows?.length) continue;
    for (const row of rows) {
      const key = row.localId ?? row.id ?? row.key;
      if (!key) continue;
      try {
        await dexieDb[table].update(key, {
          isArchived: true,
          isActiveOrder: false,
          archiveBatchId: batchId,
          archivedAt: nowIso,
        });
        archivedDexie += 1;
      } catch { /* ignore */ }
    }
  }

  await _writeArchiveBatchMeta(batchId, {
    module: moduleKey,
    reason,
    archivedBy,
    archivedFirestore,
    archivedDexie,
    cutoff: bundle.cutoff || null,
  });

  return { archiveBatchId: batchId, archivedFirestore, archivedDexie };
};

/** Backup old data → download JSON → soft-archive (load relief on main project). */
export const backupAndArchiveOldData = async ({
  olderThanDays = 90,
  modules = ['orders', 'activity'],
  currentUid,
  archivedBy = 'Admin',
  onProgress,
  hardDelete = false,
} = {}) => {
  const filters = { olderThanDays };
  const bundles = [];
  for (const mod of modules) {
    onProgress?.(`Collecting ${mod}…`);
    bundles.push({ key: mod, bundle: await collectModuleRecords(mod, filters) });
  }

  const totalRecords = bundles.reduce((s, b) => s + (b.bundle.counts?.total || 0), 0);
  if (!totalRecords) {
    return { downloaded: false, archived: false, totalRecords: 0 };
  }

  const payload = {
    app: 'A One Jewelry POS',
    archiveBackup: true,
    olderThanDays,
    exportedAt: new Date().toISOString(),
    modules: Object.fromEntries(bundles.map((b) => [b.key, b.bundle])),
  };
  const json = JSON.stringify(payload);
  payload.checksum = computePayloadChecksum(json);
  downloadBackupFile(payload, `aone_archive_backup_${olderThanDays}d_${new Date().toISOString().split('T')[0]}.json`);

  let archivedFirestore = 0;
  let archivedDexie = 0;
  const archiveBatchIds = [];

  for (const { key, bundle } of bundles) {
    onProgress?.(hardDelete ? `Purging ${key}…` : `Archiving ${key}…`);
    if (hardDelete) {
      const result = await purgeModuleRecords(key, bundle, { currentUid });
      archivedFirestore += result.deletedFirestore;
      archivedDexie += result.deletedDexie;
    } else {
      const result = await archiveModuleRecordsSoft(key, bundle, {
        archivedBy,
        reason: `archive_${olderThanDays}d`,
      });
      archivedFirestore += result.archivedFirestore;
      archivedDexie += result.archivedDexie;
      archiveBatchIds.push(result.archiveBatchId);
    }
  }

  return {
    downloaded: true,
    archived: !hardDelete,
    purged: hardDelete,
    totalRecords,
    archiveBatchIds,
    archivedFirestore,
    archivedDexie,
  };
};

/** After new project verified — archive source data linked to migration backup. */
export const archiveAfterMigrationConfirmed = async ({
  backupId,
  confirmPhrase,
  modules = ['orders', 'activity'],
  olderThanDays = 90,
  archivedBy = 'Admin',
  onProgress,
} = {}) => {
  if (String(confirmPhrase || '').trim() !== MIGRATION_CONFIRM_PHRASE) {
    throw new Error(`Type exactly: ${MIGRATION_CONFIRM_PHRASE}`);
  }
  if (!backupId?.trim()) throw new Error('Migration backup ID required');

  let backupOk = false;
  try {
    if (backupId.startsWith('bup_')) {
      const snap = await getDoc(doc(firestoreDb, 'backups', backupId));
      backupOk = snap.exists();
      if (!backupOk) {
        try {
          await loadBackupFromCloud(backupId);
          backupOk = true;
        } catch {
          backupOk = false;
        }
      }
    }
  } catch {
    backupOk = false;
  }
  if (!backupOk) {
    throw new Error('Backup not found — create migration export first');
  }

  onProgress?.('Archiving source data (soft — restorable)…');
  const result = await backupAndArchiveOldData({
    olderThanDays,
    modules,
    archivedBy,
    onProgress,
    hardDelete: false,
  });

  await _writeArchiveBatchMeta(`mig_${Date.now()}`, {
    type: 'migration_offload',
    linkedBackupId: backupId,
    modules,
    olderThanDays,
    archivedBy,
    archivedFirestore: result.archivedFirestore,
    archivedDexie: result.archivedDexie,
    archiveBatchIds: result.archiveBatchIds,
  });

  return { ...result, linkedBackupId: backupId };
};

/** Restore a soft-archived batch (undo archive). */
export const restoreArchivedBatch = async (archiveBatchId) => {
  if (!archiveBatchId || !isFirebaseReady() || !firestoreDb || !navigator.onLine) {
    throw new Error('Online + valid archive batch ID required');
  }

  let restored = 0;
  const collections = ['orders', 'bills', 'activityLogs', 'auditLogs', 'cashierActions'];

  for (const col of collections) {
    try {
      const snap = await getDocs(query(
        collection(firestoreDb, col),
        where('archiveBatchId', '==', archiveBatchId),
        limit(500),
      ));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = writeBatch(firestoreDb);
        snap.docs.slice(i, i + 400).forEach((d) => {
          batch.update(d.ref, {
            isArchived: false,
            isActiveOrder: true,
            restoredAt: new Date().toISOString(),
            archiveBatchId: null,
          });
        });
        await batch.commit();
        restored += Math.min(400, snap.docs.length - i);
      }
    } catch { /* collection may not support query */ }
  }

  if (dexieDb.orders) {
    try {
      const local = await dexieDb.orders.filter((o) => o.archiveBatchId === archiveBatchId).toArray();
      for (const row of local) {
        await dexieDb.orders.update(row.localId || row.id, {
          isArchived: false,
          isActiveOrder: true,
          archiveBatchId: null,
        });
        restored += 1;
      }
    } catch { /* ignore */ }
  }

  await setDoc(doc(firestoreDb, 'archiveBatches', archiveBatchId), {
    status: 'restored',
    restoredAt: new Date().toISOString(),
    restoredCount: restored,
  }, { merge: true });

  return { restored };
};

export const listArchiveBatches = async (max = 30) => {
  if (!isFirebaseReady() || !firestoreDb || !navigator.onLine) return [];
  try {
    const snap = await getDocs(query(
      collection(firestoreDb, 'archiveBatches'),
      orderBy('timestamp', 'desc'),
      limit(max),
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await getDocs(query(collection(firestoreDb, 'archiveBatches'), limit(max)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
};

export default {
  BACKUP_VERSION,
  SCHEDULE_OPTIONS,
  DATA_MODULES,
  EXPORT_MODULE_KEYS,
  collectModuleRecordsFull,
  downloadAllModulesSeparatedZip,
  collectBackupPayload,
  collectModuleRecords,
  collectModuleRecordsInRange,
  buildScopedBackupPayload,
  downloadScopedBackup,
  backupAndPurgeOldData,
  scopeToSinceDate,
  BACKUP_SCOPES,
  downloadBackupFile,
  downloadModuleJson,
  downloadModuleCsv,
  downloadModuleZip,
  downloadFullBackupZip,
  downloadModuleExcel,
  purgeModuleRecords,
  buildMigrationExportPayload,
  downloadMigrationPackage,
  backupAndArchiveOldData,
  archiveAfterMigrationConfirmed,
  restoreArchivedBatch,
  listArchiveBatches,
  MIGRATION_CONFIRM_PHRASE,
  MIGRATION_COLLECTIONS,
  computePayloadChecksum,
  saveBackupToCloud,
  loadBackupFromCloud,
  deleteCloudBackup,
  restoreBackupToHistory,
  restoreBackupPayload,
  parseBackupFile,
  getBackupSchedule,
  saveBackupSchedule,
  computeNextRunAt,
  runScheduledBackupIfDue,
  initScheduledBackupRunner,
  exportOrdersCsv,
  formatBackupSize,
};
