/**
 * Payment repository — read layer (writes stay in billPaymentWriteService).
 */

import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
} from 'firebase/firestore';
import { db as firestore, isFirebaseReady } from '../services/firebase';
import { getHasInternet } from '../utils/networkReachability';

export const getPaymentById = async (paymentId) => {
  if (!paymentId || !getHasInternet() || !isFirebaseReady() || !firestore) return null;
  try {
    const snap = await getDoc(doc(firestore, 'payments', paymentId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch {
    return null;
  }
};

export const listPaymentsByStore = async (storeId, cap = 120) => {
  if (!storeId || !getHasInternet() || !isFirebaseReady() || !firestore) return [];
  try {
    const snap = await getDocs(query(
      collection(firestore, 'payments'),
      where('storeId', '==', storeId),
      orderBy('createdAt', 'desc'),
      limit(cap),
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
};

export default { getPaymentById, listPaymentsByStore };
