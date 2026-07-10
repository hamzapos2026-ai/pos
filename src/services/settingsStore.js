// src/services/settingsStore.js
// ─────────────────────────────────────────────────────────────
// Offline-first Single Source of Truth (SSoT) for:
//   • Super Admin settings
//   • Role / feature permissions (the role-feature matrix)
//   • Runtime feature toggles (e.g. Commission button ON/OFF)
//
// Design:
//   • IndexedDB (Dexie `aone_local_db_v1.settings`) is the SSoT on disk.
//   • An in-memory cache mirrors it for instant, synchronous runtime reads.
//   • Subscribers (React context, plain modules) are notified IMMEDIATELY on
//     every change — so a toggle applies at runtime with NO reload, whether the
//     device is online or offline.
//   • Every write is durably queued for background sync and pushed to Firebase
//     when a connection is available (see settingsSyncWorker.js for replay).
//   • Cross-tab consistency via BroadcastChannel.
//
// This module never throws to callers — failures are logged and swallowed so a
// dropped network or a closed DB can never crash the UI mid-toggle.
// ─────────────────────────────────────────────────────────────

import { getAllSettings, putSetting } from './localDB';
import { enqueue } from './syncService';
import {
  db as firestore,
  auth,
  isFirebaseReady,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from './firebase';
import { getHasInternet } from '../utils/networkReachability';

/** Dedicated channel — do not reuse commission channel (message collisions). */
export const SETTINGS_BROADCAST_CHANNEL = 'aone_pos_settings_sync';

/** Sync-queue op type used for all settings/permissions structural changes. */
export const SETTING_OP = 'setting:update';

const SUPER_ADMIN_ROLES = ['superAdmin', 'superadmin', 'super_admin'];

// ── In-memory cache + subscribers ─────────────────────────────
let _cache = {};
let _hydrated = false;
let _hydratePromise = null;
const _listeners = new Set();

const _isOnline = () => getHasInternet();

const _emit = () => {
  const snapshot = { ..._cache };
  _listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (e) {
      console.warn('[settingsStore] listener error', e?.message || e);
    }
  });
};

// ── Cross-tab broadcast (BroadcastChannel + localStorage fallback) ─
const LS_SYNC_KEY = 'aone_setting_sync';

let _channel = null;
const _getChannel = () => {
  if (_channel) return _channel;
  try {
    _channel = new BroadcastChannel(SETTINGS_BROADCAST_CHANNEL);
  } catch {
    _channel = null;
  }
  return _channel;
};

const _broadcast = (key, value) => {
  const msg = { key, value, at: Date.now() };

  // Primary: BroadcastChannel (same browser profile, all windows)
  try {
    _getChannel()?.postMessage(msg);
  } catch {
    /* unsupported / ignore */
  }

  // Fallback: localStorage storage event (fires to all tabs even if BroadcastChannel fails)
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_SYNC_KEY, JSON.stringify(msg));
    }
  } catch {
    /* storage full / private mode — ignore */
  }
};

// ── Hydration from IndexedDB (the on-disk SSoT) ───────────────
/** Load all settings from IndexedDB into the in-memory cache (once). */
export const hydrateSettings = async () => {
  if (_hydrated) return _cache;
  if (_hydratePromise) return _hydratePromise;

  _hydratePromise = (async () => {
    try {
      const all = await getAllSettings();
      const map = {};
      (all || []).forEach((row) => {
        if (row?.key == null) return;
        let val = row.value;
        // Fix legacy corrupt scalar settings (e.g. mergeItems saved as {} instead of boolean)
        if (row.key === 'mergeItems' && typeof val !== 'boolean') {
          val = val === false ? false : true;
        }
        map[row.key] = val;
      });
      _cache = map;
    } catch (e) {
      console.warn('[settingsStore] hydrate failed', e?.message || e);
    }
    _hydrated = true;
    _emit();
    return _cache;
  })();

  return _hydratePromise;
};

/**
 * Merge-patch a setting object (e.g. salesperson, permissions) using the latest
 * cached value — safe for rapid offline toggles without stale closures.
 */
export const patchSetting = async (key, patch) => {
  const current = _cache[key];
  let next;
  if (typeof patch === 'function') {
    next = patch(current);
  } else if (patch !== null && typeof patch === 'object' && !Array.isArray(patch)) {
    next = { ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}), ...patch };
  } else {
    // Scalar values (boolean, number, string) — e.g. mergeItems: true/false
    next = patch;
  }
  return setSetting(key, next);
};

// ── Synchronous reads ─────────────────────────────────────────
export const getSetting = (key, fallback = null) =>
  (_cache[key] !== undefined ? _cache[key] : fallback);

export const getCachedSettings = () => ({ ..._cache });

export const isHydrated = () => _hydrated;

// ── Subscriptions ─────────────────────────────────────────────
/**
 * Subscribe to settings changes. The listener fires immediately with the
 * current snapshot, then on every subsequent change.
 * Returns an unsubscribe function.
 */
export const subscribe = (listener) => {
  if (typeof listener !== 'function') return () => {};
  _listeners.add(listener);
  try {
    listener({ ..._cache });
  } catch {
    /* ignore */
  }
  return () => _listeners.delete(listener);
};

// ── Permission guard for sensitive keys ───────────────────────
/**
 * Best-effort client-side guard. Server-side Firestore rules remain the source
 * of truth, but we avoid pushing protected keys (e.g. dualMode) unless the
 * current user is a Super Admin. Returns false when it cannot verify (offline
 * / no auth) so the change stays queued and is retried later.
 */
export const guardSettingPush = async (key) => {
  if (key !== 'dualMode') return true;
  try {
    const current = auth?.currentUser;
    if (!current) return false;
    const snap = await getDoc(doc(firestore, 'users', current.uid));
    const data = snap?.exists?.() ? snap.data() : {};
    const roles = data.roles || [data.role].filter(Boolean);
    return roles.some((r) => {
      const norm = String(r || '').toLowerCase();
      return SUPER_ADMIN_ROLES.includes(r)
        || norm === 'admin'
        || norm === 'superadmin'
        || norm === 'super_admin';
    });
  } catch {
    return false;
  }
};

// ── Server push (used by setSetting + background worker) ──────
/**
 * Push a single setting to the live Firestore `settings/{key}` doc.
 * Returns true on a confirmed write, false when skipped (offline / not ready /
 * not permitted). Throws only on an unexpected Firestore error so the caller
 * (worker) can apply backoff.
 */
export const pushSettingToServer = async (key, value) => {
  if (!key) return false;
  if (!isFirebaseReady() || !firestore || !_isOnline()) return false;

  const allowed = await guardSettingPush(key);
  if (!allowed) return false;

  await setDoc(
    doc(firestore, 'settings', 'appConfig'),
    {
      [key]: value,
      updatedAt: serverTimestamp(),
      updatedBy: auth?.currentUser?.uid || 'system',
    },
    { merge: true },
  );
  return true;
};

// ── Apply an external change (remote snapshot / other tab) ────
/**
 * Apply a value that originated OUTSIDE this device's user action (Firestore
 * snapshot or a BroadcastChannel message). Updates cache + notifies
 * subscribers, and (optionally) persists to IDB. Does NOT re-enqueue or
 * re-broadcast — preventing feedback loops.
 */
/** Normalize dualMode from Firestore / legacy IDB shapes. */
export const normalizeDualModeSetting = (val) => val === true || val === 'true' || val === 1;

export const isDualModeEnabled = (settingsOrVal) => {
  if (settingsOrVal && typeof settingsOrVal === 'object' && 'dualMode' in settingsOrVal) {
    return normalizeDualModeSetting(settingsOrVal.dualMode);
  }
  return normalizeDualModeSetting(settingsOrVal);
};

export const applyExternalSetting = (key, value, { persist = true, remoteUpdatedAt = null } = {}) => {
  if (!key) return;
  const nextVal = key === 'dualMode' ? normalizeDualModeSetting(value) : value;
  _cache = { ..._cache, [key]: nextVal };
  _emit();
  if (persist) {
    try {
      putSetting(key, nextVal, { remoteUpdatedAt });
    } catch {
      /* ignore */
    }
  }
};

// ── The primary write path (Super Admin / any settings change) ─
/**
 * Update a setting. Offline-first and crash-proof:
 *   1. Optimistically update the in-memory cache + notify subscribers (instant
 *      runtime update across all components, even fully offline).
 *   2. Persist to IndexedDB (durable SSoT).
 *   3. Enqueue a durable sync op (replayed to the server on reconnect).
 *   4. Broadcast to other tabs.
 *   5. Best-effort immediate push to Firebase when online.
 *
 * Always resolves with the value; never rejects.
 */
export const setSetting = async (key, value) => {
  if (!key) return value;

  const nextVal = key === 'dualMode' ? normalizeDualModeSetting(value) : value;

  // 1. Instant runtime update — the UI reacts immediately.
  _cache = { ..._cache, [key]: nextVal };
  _emit();

  // 2. Durable local persistence (SSoT on disk).
  try {
    await putSetting(key, nextVal);
  } catch (e) {
    console.warn('[settingsStore] putSetting failed', e?.message || e);
  }

  // 3. Queue for background replay (survives reloads + reconnects).
  try {
    await enqueue(SETTING_OP, { key, value: nextVal, updatedAt: Date.now() });
  } catch (e) {
    console.warn('[settingsStore] enqueue failed', e?.message || e);
  }

  // 4. Cross-tab broadcast.
  _broadcast(key, nextVal);

  // 5. Best-effort immediate server push (the worker handles offline + retry).
  pushSettingToServer(key, nextVal).catch((e) =>
    console.warn('[settingsStore] immediate push failed (will retry):', e?.message || e),
  );

  return nextVal;
};

// ── Cross-tab listener ────────────────────────────────────────
let _crossTabStarted = false;
let _crossTabHandler = null;

/** Start listening for settings changes from other tabs. Returns a stopper. */
export const startCrossTabSync = () => {
  if (_crossTabStarted) return () => {};

  _crossTabStarted = true;

  // ── BroadcastChannel listener ──────────────────────────────
  const ch = _getChannel();
  _crossTabHandler = (ev) => {
    const { key, value } = ev?.data || {};
    if (!key) return;
    applyExternalSetting(key, value, { persist: true });
  };

  if (ch) {
    try {
      ch.addEventListener('message', _crossTabHandler);
    } catch {
      try {
        ch.onmessage = _crossTabHandler;
      } catch {
        /* ignore */
      }
    }
  }

  // ── localStorage fallback listener (works across browser windows, same profile) ──
  const _lsHandler = (ev) => {
    if (ev?.key !== LS_SYNC_KEY || !ev?.newValue) return;
    try {
      const { key, value } = JSON.parse(ev.newValue) || {};
      if (!key) return;
      applyExternalSetting(key, value, { persist: true });
    } catch {
      /* malformed JSON — ignore */
    }
  };

  try {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', _lsHandler);
    }
  } catch {
    /* ignore */
  }

  return () => {
    if (ch) {
      try {
        ch.removeEventListener('message', _crossTabHandler);
      } catch {
        /* ignore */
      }
    }
    try {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', _lsHandler);
      }
    } catch {
      /* ignore */
    }
    _crossTabStarted = false;
    _crossTabHandler = null;
  };
};

export default {
  SETTING_OP,
  hydrateSettings,
  getSetting,
  getCachedSettings,
  isHydrated,
  subscribe,
  setSetting,
  patchSetting,
  applyExternalSetting,
  pushSettingToServer,
  guardSettingPush,
  normalizeDualModeSetting,
  isDualModeEnabled,
  startCrossTabSync,
};
