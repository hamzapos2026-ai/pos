// src/services/sessionService.js
// Encrypted offline session storage (IndexedDB + localStorage fallback)
import { getCachedSetting, setCachedSetting } from './indexedDBService';

const IDB_KEY = 'offline_session_enc_v1';
const LS_KEY = 'aone_offline_session_enc';
const PBKDF_SALT = 'aone_session_salt_v1';
const PBKDF_ITER = 120000;

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
  // If Web Crypto API is not available (e.g. older browsers or non-secure contexts),
  // return null so callers can fallback to a plaintext-stored session.
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const enc = new TextEncoder();
  const pass = enc.encode(deviceId || 'unknown_device');
  const salt = enc.encode(PBKDF_SALT);
  const baseKey = await crypto.subtle.importKey('raw', pass, { name: 'PBKDF2' }, false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: PBKDF_ITER, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  return key;
};

const encrypt = async (obj) => {
  try {
    const key = await deriveKey(_getDeviceId());
    // Fallback to plaintext storage when crypto is unavailable
    if (!key) {
      try {
        return `PLAIN:${btoa(JSON.stringify(obj))}`;
      } catch (e) {
        console.warn('[sessionService] plaintext fallback failed:', e?.message || e);
        return null;
      }
    }
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(obj));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
    return `${_bufToB64(iv.buffer)}:${_bufToB64(ct)}`;
  } catch (err) {
    console.warn('[sessionService] encrypt failed:', err?.message || err);
    return null;
  }
};

const decrypt = async (payload) => {
  try {
    if (!payload) return null;
    // Handle plaintext fallback
    if (typeof payload === 'string' && payload.startsWith('PLAIN:')) {
      try { return JSON.parse(atob(payload.slice(6))); } catch { return null; }
    }
    const parts = payload.split(':');
    if (parts.length !== 2) return null;
    const iv = _b64ToBuf(parts[0]);
    const ct = _b64ToBuf(parts[1]);
    const key = await deriveKey(_getDeviceId());
    if (!key) return null;
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, ct);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch (err) {
    return null; // decryption failed
  }
};

export const saveOfflineSession = async (sessionObj, ttlMs = 24 * 60 * 60 * 1000) => {
  try {
    const payload = { ...sessionObj, savedAt: Date.now(), expiresAt: Date.now() + ttlMs };
    const enc = await encrypt(payload);
    if (!enc) return false;
    try { await setCachedSetting(IDB_KEY, enc); } catch {}
    try { localStorage.setItem(LS_KEY, enc); } catch {}
    return true;
  } catch (err) {
    console.warn('[sessionService] save failed:', err?.message || err);
    return false;
  }
};

export const restoreOfflineSession = async () => {
  try {
    let enc = await getCachedSetting(IDB_KEY);
    if (!enc) enc = localStorage.getItem(LS_KEY);
    if (!enc) return null;
    const obj = await decrypt(enc);
    if (!obj) return null;
    if (obj.expiresAt && Date.now() > obj.expiresAt) return null;
    return obj;
  } catch (err) {
    return null;
  }
};

export const clearOfflineSession = async () => {
  try { await setCachedSetting(IDB_KEY, null); } catch {}
  try { localStorage.removeItem(LS_KEY); } catch {}
};

export default { saveOfflineSession, restoreOfflineSession, clearOfflineSession };
