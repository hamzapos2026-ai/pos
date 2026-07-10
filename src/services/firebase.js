// File: aone-jewelry-pos/src/services/firebase.js
// Firebase initialization — safe for HMR (hot reload) in Vite dev mode
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  browserPopupRedirectResolver,
  browserLocalPersistence,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

import {
  collection as _collection,
  doc as _doc,
  getDoc as _getDoc,
  getDocs as _getDocs,
  setDoc as _setDoc,
  updateDoc as _updateDoc,
  deleteDoc as _deleteDoc,
  addDoc as _addDoc,
  query as _query,
  where as _where,
  orderBy as _orderBy,
  limit as _limit,
  startAfter as _startAfter,
  getFirestore as _getFirestore,
  serverTimestamp as _serverTimestamp,
  Timestamp as _Timestamp,
  onSnapshot as _onSnapshot,
  writeBatch as _writeBatch,
  runTransaction as _runTransaction,
  increment as _increment,
  arrayUnion as _arrayUnion,
  arrayRemove as _arrayRemove,
  getCountFromServer as _getCountFromServer,
} from 'firebase/firestore';
import { getHasInternet, subscribeInternet } from '../utils/networkReachability';
import { recordFirebaseOp } from '../utils/firebaseUsageTelemetry';

// Firebase config (Vite env)
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const isFirebaseConfigured = () => {
  const k = firebaseConfig.apiKey;
  return k && k !== 'your-api-key-here' && k.length > 10 && k.startsWith('AIza');
};

// ─── Singleton init (safe for HMR) ───────────────────────────
let app, auth, db;

try {
  // getApp() reuses existing app on hot reload — prevents ASSERTION FAILED
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);

  // getAuth() reuses existing Auth instance — initializeAuth would crash on 2nd call
  try {
    auth = initializeAuth(app, {
      persistence:           [browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    // Already initialized (HMR reload) — just get the existing instance
    auth = getAuth(app);
  }

  // getFirestore() reuses existing Firestore — initializeFirestore crashes on 2nd call
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // Already initialized (HMR reload)
    db = getFirestore(app);
  }

} catch (error) {
  console.error('[Firebase] Initialization error:', error?.message || error);
}

export { app, auth, db };

export const isFirebaseReady = () =>
  isFirebaseConfigured() && !!app && !!auth && !!db;

// ── Offline helpers & wrappers ─────────────────────────────────
const _isOnline = () => getHasInternet();

class OfflineError extends Error {
  constructor(message = 'Offline') {
    super(message);
    this.code = 'ERR_OFFLINE';
  }
}

// Listener registry to pause/resume realtime listeners while offline
const _listenerRegistry = new Map();

const _parseSnapshotArgs = (arg2, arg3, arg4) => {
  if (typeof arg2 === 'function') {
    return {
      snapshotOptions: null,
      onNext: arg2,
      onError: arg3,
      onComplete: arg4,
    };
  }
  if (arg2 && typeof arg2 === 'object' && typeof arg3 === 'function') {
    const includeMetadataChanges = arg2.includeMetadataChanges === true;
    return {
      snapshotOptions: includeMetadataChanges ? { includeMetadataChanges: true } : null,
      onNext: arg3,
      onError: arg4,
      onComplete: undefined,
    };
  }
  return {
    snapshotOptions: null,
    onNext: arg2,
    onError: arg3,
    onComplete: arg4,
  };
};

const _callOnSnapshot = (ref, snapshotOptions, onNext, onError, onComplete) => {
  if (snapshotOptions) {
    return _onSnapshot(ref, snapshotOptions, onNext, onError, onComplete);
  }
  return _onSnapshot(ref, onNext, onError, onComplete);
};

const _attachPendingListeners = () => {
  for (const [id, entry] of _listenerRegistry.entries()) {
    if (entry.attached) continue;
    try {
      const unsub = _callOnSnapshot(
        entry.ref,
        entry.snapshotOptions,
        entry.onNext,
        entry.onError,
        entry.onComplete,
      );
      entry.unsub = unsub;
      entry.attached = true;
      _listenerRegistry.set(id, entry);
    } catch (e) {
      console.warn('[firebase] reattach listener failed:', e?.message || e);
    }
  }
};

const _detachActiveListeners = () => {
  for (const [id, entry] of _listenerRegistry.entries()) {
    if (!entry.attached) continue;
    try {
      entry.unsub && entry.unsub();
    } catch {}
    entry.unsub = null;
    entry.attached = false;
    _listenerRegistry.set(id, entry);
  }
};

if (typeof window !== 'undefined') {
  subscribeInternet((online) => {
    if (online) {
      console.log('[firebase] Internet up — reattaching realtime listeners');
      _attachPendingListeners();
    } else {
      console.log('[firebase] No internet — detaching realtime listeners');
      _detachActiveListeners();
    }
  });
}

// ── Wrapped Firestore API (checks navigator.onLine where appropriate)
export const collection = (...args) => _collection(...args);
export const doc = (...args) => _doc(...args);
export const getDoc = async (ref, options) => {
  if (!_isOnline()) {
    try {
      return await _getDoc(ref, { source: 'cache' });
    } catch (e) {
      throw new OfflineError('Offline and no cached document');
    }
  }
  const snap = await _getDoc(ref, options);
  recordFirebaseOp('read', 1);
  return snap;
};
export const getDocs = async (queryRef, options) => {
  if (!_isOnline()) {
    try {
      const snap = await _getDocs(queryRef, { source: 'cache' });
      return snap;
    } catch (e) {
      throw new OfflineError('Offline and no cached query results');
    }
  }
  const snap = await _getDocs(queryRef, options);
  recordFirebaseOp('read', snap.size || 1);
  return snap;
};
export const setDoc = async (ref, data, options) => {
  if (!_isOnline()) throw new OfflineError();
  const r = await _setDoc(ref, data, options);
  recordFirebaseOp('write', 1);
  return r;
};
export const updateDoc = async (ref, data) => {
  if (!_isOnline()) throw new OfflineError();
  const r = await _updateDoc(ref, data);
  recordFirebaseOp('write', 1);
  return r;
};
export const addDoc = async (colRef, data) => {
  if (!_isOnline()) throw new OfflineError();
  const r = await _addDoc(colRef, data);
  recordFirebaseOp('write', 1);
  return r;
};
export const deleteDoc = async (ref) => {
  if (!_isOnline()) throw new OfflineError();
  const r = await _deleteDoc(ref);
  recordFirebaseOp('delete', 1);
  return r;
};
export const runTransaction = async (firestore, updater, options) => {
  if (!_isOnline()) throw new OfflineError();
  return await _runTransaction(firestore, updater, options);
};
export const writeBatch = (...args) => {
  if (!_isOnline()) throw new OfflineError();
  return _writeBatch(...args);
};
export const query = (...args) => _query(...args);
export const where = (...args) => _where(...args);
export const orderBy = (...args) => _orderBy(...args);
export const limit = (...args) => _limit(...args);
export const startAfter = (...args) => _startAfter(...args);
export const serverTimestamp = (...args) => _serverTimestamp(...args);
export const Timestamp = _Timestamp;
export const increment = (...args) => _increment(...args);
export const arrayUnion = (...args) => _arrayUnion(...args);
export const arrayRemove = (...args) => _arrayRemove(...args);

export const getCountFromServer = async (queryRef) => {
  if (!_isOnline()) {
    try {
      const snap = await _getDocs(queryRef, { source: 'cache' });
      // mimic CountResult { data: () => ({ count: number }) }
      return { data: () => ({ count: snap.size }) };
    } catch (e) {
      throw new OfflineError('Offline and no cached count available');
    }
  }
  const result = await _getCountFromServer(queryRef);
  recordFirebaseOp('read', 1);
  return result;
};

export const onSnapshot = (refOrQuery, arg2, arg3, arg4) => {
  const { snapshotOptions, onNext, onError, onComplete } = _parseSnapshotArgs(arg2, arg3, arg4);
  const id = Symbol();
  const safeOnError = (err) => {
    if (!_isOnline()) return;
    const code = err?.code || '';
    const msg = String(err?.message || '');
    if (
      code === 'unavailable'
      || code === 'failed-precondition'
      || /offline|network|internet|disconnected/i.test(msg)
    ) return;
    try { onError?.(err); } catch { /* ignore */ }
  };

  const entry = {
    ref: refOrQuery,
    snapshotOptions,
    onNext,
    onError: safeOnError,
    onComplete,
    unsub: null,
    attached: false,
  };
  _listenerRegistry.set(id, entry);

  if (_isOnline()) {
    try {
      const unsub = _callOnSnapshot(refOrQuery, snapshotOptions, onNext, safeOnError, onComplete);
      entry.unsub = unsub;
      entry.attached = true;
      _listenerRegistry.set(id, entry);
    } catch (e) {
      console.warn('[firebase] onSnapshot attach failed:', e?.message || e);
    }
  }

  return () => {
    const e = _listenerRegistry.get(id);
    if (!e) return;
    try { e.unsub && e.unsub(); } catch {}
    _listenerRegistry.delete(id);
  };
};

// Expose getFirestore too
export { _getFirestore as getFirestore };

// ─── Auth exports ─────────────────────────────────────────────
export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  sendEmailVerification,
} from 'firebase/auth';

// ─── Firestore exports ────────────────────────────────────────
// Note: Firestore functions are exported above as offline-aware wrappers.

export default { app, auth, db, isFirebaseReady };