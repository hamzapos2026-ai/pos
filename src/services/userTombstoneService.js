// Tracks deleted users so same email can be re-created when Firebase Auth orphan remains (Spark plan).

import {
  doc, setDoc, getDoc, deleteDoc, serverTimestamp,
} from './firebase';
import { db, isFirebaseReady } from './firebase';

const emailKey = (email) =>
  String(email || '').trim().toLowerCase().replace(/[@.]/g, '_');

export const saveUserTombstone = async ({ uid, email, deletedBy = '' }) => {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !uid || !isFirebaseReady() || !db) return;

  await setDoc(doc(db, 'user_tombstones', emailKey(normalized)), {
    uid,
    email: normalized,
    deletedAt: Date.now(),
    deletedBy,
    updatedAt: serverTimestamp(),
  }, { merge: true });
};

export const getTombstoneByEmail = async (email) => {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !isFirebaseReady() || !db) return null;

  try {
    const snap = await getDoc(doc(db, 'user_tombstones', emailKey(normalized)));
    if (!snap.exists()) return null;
    const data = snap.data();
    return data?.uid ? { uid: data.uid, email: normalized, ...data } : null;
  } catch {
    return null;
  }
};

export const clearUserTombstone = async (email) => {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !db) return;
  try {
    await deleteDoc(doc(db, 'user_tombstones', emailKey(normalized)));
  } catch { /* ignore */ }
};

export default {
  saveUserTombstone,
  getTombstoneByEmail,
  clearUserTombstone,
};
