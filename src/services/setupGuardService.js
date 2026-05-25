import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  db as firebaseDb,
  isFirebaseReady,
  auth,
} from './firebase';
import { getCachedSetting, setCachedSetting } from './indexedDBService';

const LS_KEY_ENC = 'aone_setup_complete_enc';
const IDB_KEY = 'system_setup_done_enc';
const PBKDF_SALT = 'aone_setup_salt_v1';
const PBKDF_ITER = 100000;

const _getDeviceId = () => {
  try { return localStorage.getItem('aone_device_id') || 'unknown_device'; } catch { return 'unknown_device'; }
};

const _bufToB64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const _b64ToBuf = (b64) => {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const deriveKey = async (deviceId) => {
  const enc = new TextEncoder();
  const pass = enc.encode(deviceId || 'unknown_device');
  const salt = enc.encode(PBKDF_SALT);

  const baseKey = await crypto.subtle.importKey('raw', pass, { name: 'PBKDF2' }, false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF_ITER, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  return key;
};

const encryptJSON = async (obj) => {
  try {
    const deviceId = _getDeviceId();
    const key = await deriveKey(deviceId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(obj));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
    return `${_bufToB64(iv.buffer)}:${_bufToB64(ct)}`;
  } catch (err) {
    console.warn('[setupGuard] encrypt failed:', err.message || err);
    return null;
  }
};

const decryptJSON = async (payload) => {
  try {
    if (!payload || typeof payload !== 'string') return null;
    const parts = payload.split(':');
    if (parts.length !== 2) return null;
    const iv = _b64ToBuf(parts[0]);
    const ct = _b64ToBuf(parts[1]);
    const deviceId = _getDeviceId();
    const key = await deriveKey(deviceId);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, ct);
    const txt = new TextDecoder().decode(plain);
    return JSON.parse(txt);
  } catch (err) {
    return null;
  }
};

export const checkSetupStatus = async () => {
  // 1) Try server
  try {
    if (isFirebaseReady() && navigator.onLine && firebaseDb) {
      const snap = await getDoc(doc(firebaseDb, 'settings', 'setup'));
      if (snap.exists() && snap.data()?.setupComplete === true) return true;
    }
  } catch (err) {
    // If permission denied, treat as complete to avoid re-run
    if (err && (err.code === 'permission-denied' || (err.message || '').includes('permission'))) return true;
  }

  // 2) Try IndexedDB encrypted flag
  try {
    const raw = await getCachedSetting(IDB_KEY);
    if (raw) {
      const dec = await decryptJSON(raw);
      if (dec && dec.done === true) return true;
    }
  } catch (err) {
    // ignore
  }

  // 3) Try localStorage encrypted backup
  try {
    const ls = localStorage.getItem(LS_KEY_ENC);
    if (ls) {
      const dec = await decryptJSON(ls);
      if (dec && dec.done === true) return true;
    }
  } catch (err) {}

  return false;
};

export const setSetupCompleteFlag = async ({ completedBy = 'client' } = {}) => {
  const payload = { done: true, completedAt: new Date().toISOString(), completedBy };

  // Write encrypted copies locally
  try {
    const enc = await encryptJSON(payload);
    if (enc) {
      try { await setCachedSetting(IDB_KEY, enc); } catch (e) { /* ignore */ }
      try { localStorage.setItem(LS_KEY_ENC, enc); } catch (e) { /* ignore */ }
    }
  } catch (err) {
    console.warn('[setupGuard] local save failed:', err.message || err);
  }

  // Also attempt server write
  try {
    if (isFirebaseReady() && navigator.onLine && firebaseDb) {
      await setDoc(doc(firebaseDb, 'settings', 'setup'), {
        setupComplete: true,
        permanent: true,
        completedAt: serverTimestamp(),
        completedBy: auth?.currentUser?.uid || completedBy,
        completedByEmail: auth?.currentUser?.email || null,
      }, { merge: true });
    }
  } catch (err) {
    console.warn('[setupGuard] server write failed:', err.message || err);
  }

  return true;
};

export const clearSetupFlag = async () => {
  try { await setCachedSetting(IDB_KEY, null); } catch {}
  try { localStorage.removeItem(LS_KEY_ENC); } catch {}
};

export default {
  checkSetupStatus,
  setSetupCompleteFlag,
  clearSetupFlag,
};
