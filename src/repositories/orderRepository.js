/**
 * Order repository — read/query layer for UI and services.
 */

import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
} from 'firebase/firestore';
import { db as firestore, isFirebaseReady } from '../services/firebase';
import { COLLECTION_NAMES } from '../utils/constants';
import { getHasInternet } from '../utils/networkReachability';
import { db as dexieDb } from '../db/index';

export const getOrderById = async (orderId) => {
  if (!orderId) return null;
  if (getHasInternet() && isFirebaseReady() && firestore) {
    try {
      const snap = await getDoc(doc(firestore, COLLECTION_NAMES.orders, orderId));
      if (snap.exists()) return { id: snap.id, ...snap.data() };
    } catch { /* fall through */ }
  }
  try {
    const local = await dexieDb.orders
      .filter((o) => o.firebaseId === orderId || o.localId === orderId || o.id === orderId)
      .first();
    return local || null;
  } catch {
    return null;
  }
};

export const listRecentOrdersByBiller = async (storeId, billerId, cap = 100) => {
  if (!storeId || !billerId || !getHasInternet() || !isFirebaseReady() || !firestore) return [];
  try {
    const snap = await getDocs(query(
      collection(firestore, COLLECTION_NAMES.orders),
      where('storeId', '==', storeId),
      where('billerId', '==', billerId),
      limit(cap),
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
};

export const listOrdersByStore = async (storeId, { cap = 150, orderField = 'createdAt' } = {}) => {
  if (!storeId || !getHasInternet() || !isFirebaseReady() || !firestore) return [];
  try {
    const snap = await getDocs(query(
      collection(firestore, COLLECTION_NAMES.orders),
      where('storeId', '==', storeId),
      orderBy(orderField, 'desc'),
      limit(cap),
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
};

export default {
  getOrderById,
  listRecentOrdersByBiller,
  listOrdersByStore,
};
