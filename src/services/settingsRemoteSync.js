// settingsRemoteSync.js
// INBOUND sync — Super Admin → Firestore settings/appConfig → ALL PCs

import {
  auth,
  db as firestore,
  isFirebaseReady,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  onAuthStateChanged,
  updateDoc,
  setDoc,
  serverTimestamp,
} from './firebase';

import {
  applyExternalSetting,
  hydrateSettings,
  SETTING_OP,
} from './settingsStore';

import localDB, { getSyncQueue } from './localDB';
import { getHasInternet } from '../utils/networkReachability';
import { SETTINGS_PULL_INTERVAL_MS } from '../utils/firebaseQuotaConfig';

const PULL_INTERVAL_MS = SETTINGS_PULL_INTERVAL_MS;
const RECONNECT_PULL_MS = 1500;
const APP_CONFIG_PATH = ['settings', 'appConfig'];
const APP_CONFIG_LS_KEY = 'appConfig';
const APP_CONFIG_TS_KEY = 'appConfig_ts';

const _META_KEYS = new Set(['updatedAt', 'updatedBy', 'migratedAt', 'version']);

let _snapshotUnsub = null;
let _authUnsub = null;
let _pullTimer = null;
let _started = false;
let _cleanup = null;
let _migrateAttempted = false;

const _isOnline = () => getHasInternet();

const _toMs = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  const n = Number(ts);
  return Number.isFinite(n) ? n : 0;
};

const _localSettingUpdatedAt = async (key) => {
  try {
    const row = await localDB.settings.get(key);
    return Number(row?.updatedAt || 0);
  } catch {
    return 0;
  }
};

const _shouldSkipRemote = async (key, remoteUpdatedAt = 0) => {
  try {
    const all = await getSyncQueue();
    const pending = (all || []).some(
      (op) =>
        op?.type === SETTING_OP
        && op?.payload?.key === key
        && op.status !== 'synced'
        && op.status !== 'forbidden'
        && op.status !== 'dead_letter',
    );
    if (!pending) return false;
    const localAt = await _localSettingUpdatedAt(key);
    if (!remoteUpdatedAt) return true;
    return remoteUpdatedAt <= localAt;
  } catch {
    return false;
  }
};

const _applyRemoteDoc = async (key, data) => {
  if (!key || !data) return false;

  const remoteUpdatedAt = _toMs(data?.updatedAt);
  if (await _shouldSkipRemote(key, remoteUpdatedAt)) {
    return false;
  }

  const val = data?.value !== undefined ? data.value : data;
  applyExternalSetting(key, val, {
    persist: true,
    remoteUpdatedAt,
  });
  return true;
};

const _cacheAppConfig = (config) => {
  try {
    localStorage.setItem(APP_CONFIG_LS_KEY, JSON.stringify(config));
    localStorage.setItem(APP_CONFIG_TS_KEY, String(Date.now()));
  } catch (e) {
    console.warn('[settingsRemote] cache fail:', e?.message || e);
  }
};

export const loadSettingsFromCache = () => {
  try {
    const raw = localStorage.getItem(APP_CONFIG_LS_KEY);
    if (!raw) return false;
    const config = JSON.parse(raw);
    Object.entries(config || {}).forEach(([key, val]) => {
      if (_META_KEYS.has(key)) return;
      applyExternalSetting(key, val, { persist: false });
    });
    return true;
  } catch (e) {
    console.warn('[settingsRemote] cache read fail:', e?.message || e);
    return false;
  }
};

const _applyAppConfig = async (config = {}) => {
  if (!config || typeof config !== 'object') return 0;
  _cacheAppConfig(config);
  const remoteUpdatedAt = _toMs(config.updatedAt);
  let pulled = 0;

  for (const [key, val] of Object.entries(config)) {
    if (_META_KEYS.has(key)) continue;
    const ok = await _applyRemoteDoc(key, { value: val, updatedAt: remoteUpdatedAt });
    if (ok) pulled += 1;
  }

  if (config.biller?.dualMode !== undefined && !('dualMode' in config)) {
    const ok = await _applyRemoteDoc('dualMode', {
      value: config.biller.dualMode,
      updatedAt: remoteUpdatedAt,
    });
    if (ok) pulled += 1;
  }

  return pulled;
};

/** One-time: merge legacy settings/* docs into settings/appConfig. */
export const migrateSettingsCollectionToAppConfig = async () => {
  if (!_isOnline() || !isFirebaseReady() || !firestore || _migrateAttempted) {
    return { migrated: false };
  }
  _migrateAttempted = true;

  try {
    const existing = await getDoc(doc(firestore, ...APP_CONFIG_PATH));
    if (existing.exists()) return { migrated: false, skipped: true };

    const snap = await getDocs(collection(firestore, 'settings'));
    if (!snap.empty && snap.docs.some((d) => d.id !== 'appConfig')) {
      const merged = { migratedAt: serverTimestamp(), updatedAt: serverTimestamp() };
      snap.docs.forEach((d) => {
        if (d.id === 'appConfig') return;
        const data = d.data();
        merged[d.id] = data?.value !== undefined ? data.value : data;
      });
      await setDoc(doc(firestore, ...APP_CONFIG_PATH), merged, { merge: true });
      console.log('[settingsRemote] ✅ migrated legacy settings → appConfig');
      return { migrated: true, keys: Object.keys(merged).length };
    }
  } catch (e) {
    console.warn('[settingsRemote] migration failed:', e?.message || e);
  }
  return { migrated: false };
};

/** One-shot pull — login, reconnect, periodic fallback. */
export const pullAllSettingsFromServer = async () => {
  if (!_isOnline() || !isFirebaseReady() || !firestore || !auth?.currentUser) {
    return { pulled: 0, skipped: true };
  }

  try {
    await hydrateSettings();
    await migrateSettingsCollectionToAppConfig();

    const snap = await getDoc(doc(firestore, ...APP_CONFIG_PATH));
    if (!snap.exists()) {
      loadSettingsFromCache();
      return { pulled: 0, fromCache: true };
    }

    const pulled = await _applyAppConfig(snap.data());
    if (pulled > 0) {
      console.log(`[settingsRemote] ⬇️ applied ${pulled} section(s) from appConfig`);
    }
    return { pulled };
  } catch (e) {
    console.warn('[settingsRemote] pull failed:', e?.message || e);
    loadSettingsFromCache();
    return { pulled: 0, error: true };
  }
};

/** Super Admin save — merges one section into appConfig (listener fans out to all PCs). */
export const saveAppConfigSection = async (section, updates, userId = null) => {
  if (!section || !isFirebaseReady() || !firestore) return false;
  try {
    await updateDoc(doc(firestore, ...APP_CONFIG_PATH), {
      [section]: {
        ...updates,
        updatedAt: serverTimestamp(),
        updatedBy: userId || auth?.currentUser?.uid || 'system',
      },
      updatedAt: serverTimestamp(),
      updatedBy: userId || auth?.currentUser?.uid || 'system',
    });
    return true;
  } catch (e) {
    console.warn('[settingsRemote] saveAppConfigSection failed:', e?.message || e);
    return false;
  }
};

const _stopListener = () => {
  try { _snapshotUnsub?.(); } catch { /* ignore */ }
  _snapshotUnsub = null;
};

const _startListener = () => {
  if (!_isOnline() || !isFirebaseReady() || !firestore || !auth?.currentUser) return;

  _stopListener();

  try {
    _snapshotUnsub = onSnapshot(
      doc(firestore, ...APP_CONFIG_PATH),
      (docSnap) => {
        if (!docSnap.exists()) return;
        void _applyAppConfig(docSnap.data());
      },
      (error) => {
        console.error('[settingsRemote] appConfig listener error:', error?.message || error);
        loadSettingsFromCache();
      },
    );
  } catch (e) {
    console.warn('[settingsRemote] listener attach failed:', e?.message || e);
    loadSettingsFromCache();
  }
};

const _onConnectivityRestored = () => {
  pullAllSettingsFromServer()
    .then(() => _startListener())
    .catch(() => {});
  setTimeout(() => {
    pullAllSettingsFromServer().catch(() => {});
  }, RECONNECT_PULL_MS);
};

const _onAuth = (user) => {
  if (user && _isOnline()) {
    _onConnectivityRestored();
  } else {
    _stopListener();
  }
};

export const startSettingsRemoteSync = () => {
  if (_started) return _cleanup;
  _started = true;

  loadSettingsFromCache();
  hydrateSettings().catch(() => {});

  if (isFirebaseReady() && auth) {
    _authUnsub = onAuthStateChanged(auth, _onAuth);
  }

  const onOnline = () => {
    console.log('[settingsRemote] 🌐 online — pulling latest settings');
    _onConnectivityRestored();
  };

  const onOffline = () => {
    _stopListener();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
  }

  _pullTimer = setInterval(() => {
    if (_isOnline() && auth?.currentUser) {
      pullAllSettingsFromServer().catch(() => {});
    }
  }, PULL_INTERVAL_MS);

  if (_isOnline() && auth?.currentUser) {
    _onConnectivityRestored();
  }

  _cleanup = () => {
    _stopListener();
    try { _authUnsub?.(); } catch { /* ignore */ }
    _authUnsub = null;
    if (_pullTimer) clearInterval(_pullTimer);
    _pullTimer = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    }
    _started = false;
    _cleanup = null;
  };

  return _cleanup;
};

export default {
  pullAllSettingsFromServer,
  startSettingsRemoteSync,
  loadSettingsFromCache,
  saveAppConfigSection,
  migrateSettingsCollectionToAppConfig,
};
