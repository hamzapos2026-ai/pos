/**
 * Expense repository — read layer.
 */

import {
  collection, getDocs, query, where, orderBy, limit,
} from 'firebase/firestore';
import { db as firestore, isFirebaseReady } from '../services/firebase';
import { getHasInternet } from '../utils/networkReachability';

export const listExpensesByStore = async (storeId, cap = 400) => {
  if (!storeId || !getHasInternet() || !isFirebaseReady() || !firestore) return [];
  try {
    const snap = await getDocs(query(
      collection(firestore, 'expenses'),
      where('storeId', '==', storeId),
      orderBy('createdAt', 'desc'),
      limit(cap),
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
};

export default { listExpensesByStore };
