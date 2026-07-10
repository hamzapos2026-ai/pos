// Super Admin actions — stored in dedicated Firestore collection (separate from staff activity)

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db as firebaseDb, isFirebaseReady } from './firebase';

export const logSuperAdminActivity = async (action, details = {}) => {
  if (!isFirebaseReady() || !firebaseDb) {
    return { success: false, error: 'offline' };
  }

  const uid = auth?.currentUser?.uid || details.userId || 'unknown';
  const email = auth?.currentUser?.email || details.userEmail || '';

  try {
    await addDoc(collection(firebaseDb, 'superAdminActivityLogs'), {
      action,
      userId: uid,
      userEmail: email,
      details,
      role: 'superAdmin',
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString(),
      source: 'shop_settings',
      _channel: 'super_admin',
    });
    return { success: true };
  } catch (err) {
    console.warn('[superAdminActivity]', err.message);
    return { success: false, error: err.message };
  }
};

export default { logSuperAdminActivity };
