/**
 * Pre-aggregated daily sales — 1 Firestore read per dashboard load.
 * Writes happen server-side (Cloud Function on order paid transition).
 * Client is read-only to avoid double-counting.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db as firestore } from './firebase';
import { getHasInternet } from '../utils/networkReachability';

const PK_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Pakistan calendar date key YYYY-MM-DD */
export const pkDateKey = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  const pk = new Date(d.getTime() + PK_OFFSET_MS);
  return pk.toISOString().slice(0, 10);
};

export const summaryDocId = (storeId, dateKey) => (
  storeId ? `${storeId}_${dateKey}` : `global_${dateKey}`
);

const summaryRef = (storeId, dateKey) => (
  doc(firestore, 'dailySummaries', summaryDocId(storeId, dateKey))
);

const emptySummary = () => ({
  totalSales: 0,
  billCount: 0,
  paidBillCount: 0,
  cashTotal: 0,
  digitalTotal: 0,
  pendingReceivables: 0,
  expenses: 0,
  returns: 0,
});

const normalizeSummary = (data) => ({
  ...emptySummary(),
  ...(data || {}),
  totalSales: Number(data?.totalSales || 0),
  billCount: Number(data?.billCount || 0),
  paidBillCount: Number(data?.paidBillCount || 0),
  cashTotal: Number(data?.cashTotal || 0),
  digitalTotal: Number(data?.digitalTotal || 0),
  pendingReceivables: Number(data?.pendingReceivables || 0),
  expenses: Number(data?.expenses || 0),
  returns: Number(data?.returns || 0),
});

/** Single-doc read — all branches combined for a date. */
export const fetchGlobalDailySummary = async (dateKey = pkDateKey()) => {
  if (!getHasInternet() || !firestore) return null;
  try {
    const snap = await getDoc(summaryRef(null, dateKey));
    return snap.exists() ? normalizeSummary(snap.data()) : null;
  } catch {
    return null;
  }
};

/** Single-doc read — one branch/store for a date. */
export const fetchStoreDailySummary = async (storeId, dateKey = pkDateKey()) => {
  if (!storeId || !getHasInternet() || !firestore) return null;
  try {
    const snap = await getDoc(summaryRef(storeId, dateKey));
    return snap.exists() ? normalizeSummary(snap.data()) : null;
  } catch {
    return null;
  }
};

export default {
  pkDateKey,
  summaryDocId,
  fetchGlobalDailySummary,
  fetchStoreDailySummary,
};
