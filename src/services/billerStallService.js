// Biller idle / stall alerts — bill open too long, invoice left open, no activity

import {
  collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot,
} from 'firebase/firestore';
import { db as firebaseDb, isFirebaseReady } from './firebase';
import { logActivity } from './activityLogger';

export const BILLER_STALL_DEFAULTS = {
  enabled: true,
  billIdleMinutes: 10,
  invoiceOpenMinutes: 5,
  maxBillMinutes: 45,
  alertCooldownMinutes: 10,
};

export const STALL_TYPE_LABELS = {
  bill_idle: 'Bill par ruk gaye (no activity)',
  bill_too_long: 'Bill bahut lamba chal raha',
  invoice_open: 'Invoice open par ruk gaye',
};

const formatDuration = (ms) => {
  const totalMin = Math.max(1, Math.round(ms / 60000));
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

export const logBillerStallAlert = async ({
  storeId,
  billerId,
  billerName,
  billSerial,
  stallType,
  durationMs,
  billStartTime,
  tabLabel,
}) => {
  const durationLabel = formatDuration(durationMs);
  const localIso = new Date().toISOString();
  const payload = {
    storeId: storeId || 'default',
    billerId: billerId || 'unknown',
    billerName: billerName || '',
    billSerial: billSerial || '----',
    stallType,
    stallLabel: STALL_TYPE_LABELS[stallType] || stallType,
    durationMs,
    durationLabel,
    durationMinutes: Math.round(durationMs / 60000),
    billStartTime: billStartTime || null,
    tabLabel: tabLabel || '',
    localDate: localIso.slice(0, 10),
    localTime: localIso.slice(11, 19),
    localIso,
    source: 'biller_stall_monitor',
  };

  let cloudId = null;

  if (isFirebaseReady() && firebaseDb && navigator.onLine) {
    try {
      const ref = await addDoc(collection(firebaseDb, 'billerStallAlerts'), {
        ...payload,
        createdAt: serverTimestamp(),
        timestamp: serverTimestamp(),
        _immutable: true,
      });
      cloudId = ref.id;
    } catch (err) {
      console.warn('[billerStall]', err?.message || err);
    }
  }

  try {
    await logActivity('BILLER_STALL_ALERT', billerId, storeId, {
      ...payload,
      cloudId,
      userName: billerName,
    });
  } catch {
    /* activity logger handles offline */
  }

  return { success: true, cloudId, payload };
};

export const watchBillerStallAlerts = (callback, max = 40) => {
  if (!isFirebaseReady() || !firebaseDb) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(firebaseDb, 'billerStallAlerts'),
    orderBy('createdAt', 'desc'),
    limit(max),
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => {
        const data = d.data();
        const ts = data.createdAt?.toDate?.()
          || (data.localIso ? new Date(data.localIso) : null);
        return { id: d.id, ...data, displayTime: ts };
      });
      callback(rows);
    },
    (err) => {
      console.warn('[billerStall] watch failed', err?.message || err);
      callback([]);
    },
  );
};

export default {
  BILLER_STALL_DEFAULTS,
  STALL_TYPE_LABELS,
  logBillerStallAlert,
  watchBillerStallAlerts,
};
