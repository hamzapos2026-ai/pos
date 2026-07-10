/**
 * Inventory repository — read layer (product/stock queries).
 */

import {
  collection, doc, getDoc, getDocs, query, where, limit,
} from 'firebase/firestore';
import { db as firestore, isFirebaseReady } from '../services/firebase';
import { getHasInternet } from '../utils/networkReachability';

export const getProductById = async (productId) => {
  if (!productId || !getHasInternet() || !isFirebaseReady() || !firestore) return null;
  try {
    const snap = await getDoc(doc(firestore, 'products', productId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch {
    return null;
  }
};

export const listProductsByStore = async (storeId, cap = 200) => {
  if (!storeId || !getHasInternet() || !isFirebaseReady() || !firestore) return [];
  try {
    const snap = await getDocs(query(
      collection(firestore, 'products'),
      where('storeId', '==', storeId),
      limit(cap),
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
};

export default { getProductById, listProductsByStore };
