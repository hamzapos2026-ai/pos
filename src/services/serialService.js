// src/services/serialService.js
// ✅ PRODUCTION FINAL v21 - Global Lifetime Counter + Auto-Setup
// ✅ Format: JMJ-BIL-020726-000867 (STORE-BIL-DDMMYY-000001)
// ✅ Auto-creates globalCounters/billSerial document if missing
// ✅ All required fields: lastNumber, lastUpdatedAt, lastStoreCode,
//    lastSerial, lastUpdatedBy, createdAt
// ✅ Global counter (all stores share, never resets)
// ✅ Real-time sync via onSnapshot (NOT getDoc)
// ✅ Cross-tab sync via BroadcastChannel
// ✅ Offline-first with conflict resolution
// ✅ Fresh counter from Firebase on new login
// ✅ localStorage preserved on logout

import {
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  getDocs,
  limit,
  orderBy,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { pad6, getShortDatePK, getDeviceId, buildBillSerial } from "../utils/billIdGenerator";
import { getHasInternet } from "../utils/networkReachability";

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════
const GLOBAL_COUNTER_PATH = "globalCounters/billSerial";
const STORE_CACHE_KEY = (sid) => `pos_store_${sid}`;
const STORE_CODE_CACHE_KEY = (sid) => `pos_store_code_${sid}`;
const LOCAL_COUNTER_KEY = "pos_global_serial_counter";
const LAST_SERVER_COUNTER_KEY = "pos_last_known_server_serial";
const PENDING_BILLS_KEY = "pos_pending_serials";
const STORE_CACHE_MS = 5 * 60 * 1000; // 5 min
const MAX_RETRY = 5;

// Offline-first guard: never let a flaky/ambiguous network freeze the POS.
// If Firestore doesn't respond within this window, we fall back to an offline serial.
const ONLINE_CLAIM_TIMEOUT_MS = 3500;

/** Reject after `ms` if `promise` hasn't settled — prevents Firestore hangs from freezing the UI. */
const _withTimeout = (promise, ms, label = "operation") =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });

// ══════════════════════════════════════════════════════════════
// MODULE STATE
// ══════════════════════════════════════════════════════════════
let _state = {
  // Counter
  serverCounter: 0,        // Last known server counter
  localCounter: 0,         // Local incremented counter
  pendingOffline: 0,       // Bills generated offline, awaiting sync
  
  // Store info
  storeId: null,
  storeCode: null,         // Serial prefix (JM1, JM2, JMJ…)
  branchHint: null,        // User branch label (JM-1, JM-2)
  
  // User info
  userId: null,
  userCode: null,          // BIL01, CAS02 (saved in bill, not serial)
  userName: null,
  
  // Sync state
  initialized: false,
  initPromise: null,
  lastServerSync: 0,
  itemCounter: 0,
};

// ── Lock mechanism (prevents race conditions) ──
let _claimLock = false;
let _offlineClaimLock = false;
const _claimQueue = [];

const _acquireLock = () => new Promise((resolve) => {
  if (!_claimLock) {
    _claimLock = true;
    resolve();
  } else {
    _claimQueue.push(resolve);
  }
});

const _releaseLock = () => {
  const next = _claimQueue.shift();
  if (next) next();
  else _claimLock = false;
};

// ── Live subscribers ──
const _subscribers = new Set();
let _liveUnsub = null;
let _bc = null;

// ══════════════════════════════════════════════════════════════
// BROADCAST CHANNEL (Cross-tab sync)
// ══════════════════════════════════════════════════════════════
const _getBC = () => {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!_bc) {
    try {
      _bc = new BroadcastChannel("aone_serial_global");
      _bc.addEventListener("message", _handleBCMessage);
    } catch {
      _bc = null;
    }
  }
  return _bc;
};

const _handleBCMessage = (e) => {
  try {
    const { type, counter, storeCode } = e.data || {};
    if (type !== "counter_update") return;
    
    if (typeof counter === "number" && counter > _state.localCounter) {
      _state.localCounter = counter;
      _state.serverCounter = counter;
      _saveLocalCounter(counter);
      _notifySubscribers();
    }
  } catch {}
};

const _broadcast = (counter) => {
  try {
    _getBC()?.postMessage({
      type: "counter_update",
      counter,
      storeCode: _state.storeCode,
      timestamp: Date.now(),
    });
  } catch {}
};

// ══════════════════════════════════════════════════════════════
// LOCAL STORAGE OPERATIONS
// ══════════════════════════════════════════════════════════════
const _saveLocalCounter = (counter) => {
  try {
    localStorage.setItem(LOCAL_COUNTER_KEY, JSON.stringify({
      counter,
      timestamp: Date.now(),
      deviceId: getDeviceId(),
    }));
  } catch {}
};

const _loadLocalCounter = () => {
  try {
    const raw = localStorage.getItem(LOCAL_COUNTER_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    return Number(data.counter) || 0;
  } catch {
    return 0;
  }
};

/** Last Firebase global counter seen on this device — offline claims must stay above this. */
const _saveLastKnownServerCounter = (counter) => {
  const n = Number(counter) || 0;
  if (n < 1) return;
  try {
    localStorage.setItem(LAST_SERVER_COUNTER_KEY, JSON.stringify({
      counter: n,
      timestamp: Date.now(),
      deviceId: getDeviceId(),
    }));
  } catch { /* ignore */ }
};

/** STORE-BIL-DDMMYY-000001 — same format online, offline, biller & cashier */
const _buildSerial = (counter) => buildBillSerial(_state.storeCode || 'XXX', counter);

export const buildSerialPreview = (config = {}, counter = null, storeCodeOverride = '') => {
  const code = String(storeCodeOverride || config?.storeCode || _state.storeCode || 'JMJ').toUpperCase();
  const branchCode = _branchAliasPrefix(code) || _normalizeSerialPrefix(code) || 'JMJ';
  const value = Math.max(1, Number(counter ?? config?.currentSerialNumber) || 1);
  return buildBillSerial(branchCode, value);
};

export const setInvoiceSerialConfig = () => ({ storeCode: _state.storeCode });

export const getInvoiceSerialConfig = () => ({ storeCode: _state.storeCode });

const _loadLastKnownServerCounter = () => {
  try {
    const raw = localStorage.getItem(LAST_SERVER_COUNTER_KEY);
    if (!raw) return 0;
    return Number(JSON.parse(raw).counter) || 0;
  } catch {
    return 0;
  }
};

/** Drop pending-serial entries for bills already saved locally. */
const _pruneStalePendingBills = async () => {
  const pending = _getPendingBills();
  if (!pending.length) return;
  try {
    const { db: localDb, ensureDbReady } = await import("../db/index");
    const { normalizeSerial } = await import("../utils/serialMatch");
    await ensureDbReady();
    const rows = await localDb.orders.toArray();
    const saved = new Set(
      rows
        .filter((o) => !o?.isDeleted)
        .map((o) => normalizeSerial(_serialFromOrder(o)))
        .filter(Boolean),
    );
    const kept = pending.filter((p) => !saved.has(normalizeSerial(p.serial)));
    if (kept.length !== pending.length) {
      localStorage.setItem(PENDING_BILLS_KEY, JSON.stringify(kept.slice(-100)));
      _state.pendingOffline = kept.length;
      console.log(`[serial] 🧹 Pruned ${pending.length - kept.length} stale pending serial(s)`);
    }
  } catch { /* ignore */ }
};

/**
 * Align local counter with server + saved bills before any claim (online or offline).
 * Prevents stale PC counter (e.g. 364) when cloud is already at 383+.
 */
const _reconcileCounterBeforeClaim = async (storeId, options = {}) => {
  const { timeoutMs = 3500, allowNetwork = true } = options;
  const sid = storeId || _state.storeId;

  await _pruneStalePendingBills();

  const pending = _getPendingBills();
  const pendingMax = pending.reduce((m, p) => Math.max(m, Number(p.counter) || 0), 0);
  const broadcastMax = _readBroadcastMax(sid);
  const lastKnownServer = _loadLastKnownServerCounter();

  let ordersMax = Number(_ordersMaxCache) || 0;
  try {
    const { db: localDb, ensureDbReady } = await import("../db/index");
    await ensureDbReady();
    const rows = await localDb.orders.toArray();
    rows.forEach((o) => {
      if (o?.isDeleted) return;
      if (sid && o.storeId && o.storeId !== sid) return;
      const n = extractSerialNumber(_serialFromOrder(o));
      if (n > ordersMax) ordersMax = n;
    });
  } catch { /* ignore */ }
  _ordersMaxCache = ordersMax;

  let serverCounter = Math.max(lastKnownServer, Number(_state.serverCounter) || 0);

  if (allowNetwork && getHasInternet()) {
    try {
      const fetched = await _withTimeout(_fetchServerCounter(), timeoutMs, "server-counter");
      serverCounter = Math.max(serverCounter, Number(fetched) || 0);
      _saveLastKnownServerCounter(serverCounter);
    } catch (err) {
      console.warn("[serial] reconcile server fetch skipped:", err?.message || err);
    }

    try {
      const remoteMax = await _withTimeout(_fetchMaxSerialFromOrders(), timeoutMs, "orders-max");
      ordersMax = Math.max(ordersMax, Number(remoteMax) || 0);
      _ordersMaxCache = ordersMax;
    } catch (err) {
      console.warn("[serial] reconcile orders scan skipped:", err?.message || err);
    }

    if (ordersMax > serverCounter && _state.storeCode) {
      try {
        const reconciled = await _reconcileCounterWithOrders(serverCounter, _state.storeCode);
        serverCounter = Math.max(serverCounter, reconciled.serverCounter || 0, reconciled.ordersMax || 0);
        _saveLastKnownServerCounter(serverCounter);
      } catch { /* ignore */ }
    }
  }

  const floor = Math.max(
    serverCounter,
    ordersMax,
    broadcastMax,
    pendingMax,
    _loadLocalCounter(),
    Number(_state.localCounter) || 0,
  );

  if (floor > _state.localCounter || floor > _state.serverCounter) {
    _state.localCounter = floor;
    _state.serverCounter = Math.max(_state.serverCounter, serverCounter, floor);
    _saveLocalCounter(floor);
    _saveLastKnownServerCounter(Math.max(serverCounter, floor));
    _notifySubscribers();
    console.log(`[serial] 🔄 Reconciled before claim → floor ${floor} (server ${serverCounter}, orders ${ordersMax})`);
  }

  return floor;
};

const _savePendingBill = (serial, counter, storeCode) => {
  try {
    const raw = localStorage.getItem(PENDING_BILLS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.push({
      serial,
      counter,
      storeCode,
      deviceId: getDeviceId(),
      timestamp: Date.now(),
    });
    localStorage.setItem(PENDING_BILLS_KEY, JSON.stringify(list.slice(-100)));
    void _recordSerialClaimInDexie(serial, counter, storeCode);
  } catch {}
};

const _recordSerialClaimInDexie = async (serial, counter, storeId) => {
  try {
    const { db: localDb, ensureDbReady } = await import('../db/index');
    await ensureDbReady();
    if (!localDb.serial_claims) return;
    await localDb.serial_claims.add({
      serial,
      counter: Number(counter) || 0,
      storeId: storeId || _state.storeId || '',
      deviceId: getDeviceId(),
      claimedAt: new Date().toISOString(),
    });
  } catch { /* non-critical */ }
};

const _deviceSerialSuffix = () => {
  const tail = String(getDeviceId() || 'X').replace(/[^A-Z0-9]/gi, '').slice(-1).toUpperCase();
  return tail || 'X';
};

const _withDeviceSuffix = (serial) => {
  const base = String(serial || '').trim();
  if (!base) return base;
  if (/[-][A-Z]$/.test(base)) return base;
  return `${base}-${_deviceSerialSuffix()}`;
};

const _removePendingBill = (serial) => {
  try {
    const raw = localStorage.getItem(PENDING_BILLS_KEY);
    if (!raw) return;
    const list = JSON.parse(raw);
    const filtered = list.filter(b => b.serial !== serial);
    localStorage.setItem(PENDING_BILLS_KEY, JSON.stringify(filtered));
  } catch {}
};

const _getPendingBills = () => {
  try {
    const raw = localStorage.getItem(PENDING_BILLS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

/** Last successfully saved bill number (biller broadcast) — keeps preview in sync with cashier. */
let _ordersMaxCache = 0;

const _readBroadcastMax = (storeId) => {
  if (!storeId) return 0;
  try {
    const raw = localStorage.getItem(`pos_serialBroadcast_${storeId}`);
    if (!raw) return 0;
    return Number(JSON.parse(raw).max) || 0;
  } catch {
    return 0;
  }
};

const _effectiveUsedCounter = () => {
  const broadcast = _readBroadcastMax(_state.storeId);
  return Math.max(
    Number(_state.serverCounter) || 0,
    Number(_ordersMaxCache) || 0,
    Number(broadcast) || 0,
    _loadLastKnownServerCounter(),
  );
};

/** Next serial number — aligned with last SAVED bill, not orphan claims. */
const _nextSerialNumber = () => {
  const used = _effectiveUsedCounter();
  const pending = _getPendingBills();
  const pendingMax = pending.length
    ? Math.max(...pending.map((p) => Number(p.counter) || 0))
    : 0;

  if (_state.localCounter > used && pendingMax <= used) {
    _state.localCounter = used;
    _state.pendingOffline = pending.length;
    _saveLocalCounter(used);
  }

  return Math.max(_state.localCounter, used, pendingMax) + 1;
};

export const refreshOrdersMaxCache = async (storeId) => {
  const max = await _fetchMaxSerialFromOrders();
  const broadcast = _readBroadcastMax(storeId || _state.storeId);
  _ordersMaxCache = Math.max(max || 0, broadcast || 0);
  const used = _effectiveUsedCounter();
  if (_state.localCounter > used + 2) {
    const pendingMax = _getPendingBills().reduce((m, p) => Math.max(m, Number(p.counter) || 0), 0);
    if (pendingMax <= used) {
      _state.localCounter = used;
      _saveLocalCounter(used);
    }
  }
  _notifySubscribers();
  return _ordersMaxCache;
};

/** Roll back a serial claim when bill save fails (fixes 047 / 048 / 050 gaps). */
export const releaseSerialClaim = (serial) => {
  const num = extractSerialNumber(serial);
  if (!num) return;
  _removePendingBill(serial);
  _state.pendingOffline = _getPendingBills().length;
  const used = _effectiveUsedCounter();
  if (_state.localCounter >= num && num > used) {
    _state.localCounter = Math.max(used, num - 1);
    _saveLocalCounter(_state.localCounter);
  }
  _notifySubscribers();
};

// ══════════════════════════════════════════════════════════════
// STORE CODE HELPERS
// ══════════════════════════════════════════════════════════════
/** Valid bill prefix: JMJ / AON (letters) or JM1 / JM2 (branch alias) — never Firebase doc ids like A3G13 */
const _isValidSerialPrefix = (s) => {
  const v = String(s || '').trim().toUpperCase();
  if (!v || v.length < 2 || v.length > 5) return false;
  if (/^JM\d$/.test(v)) return true;
  if (/^[A-Z]{2,5}$/.test(v)) return true;
  return false;
};

const _normalizeSerialPrefix = (raw) => {
  const s = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (_isValidSerialPrefix(s)) return s;
  return '';
};

/** JM-1 / JM-2 style branch ids → JM1 / JM2 serial prefix */
const _branchAliasPrefix = (...fields) => {
  for (const field of fields) {
    if (!field) continue;
    const raw = String(field).trim();
    if (/^[A-Z]{1,4}-\d+$/i.test(raw)) {
      const prefix = _normalizeSerialPrefix(raw);
      if (prefix) return prefix;
    }
  }
  return '';
};

const _branchLabelFromStore = (store) => {
  if (!store) return '';
  for (const field of [store.legacyId, store.branchCode, store.code]) {
    const prefix = _branchAliasPrefix(field);
    if (prefix) return prefix;
  }
  const stripBrand = (s) => String(s || '')
    .replace(/^A One Jewelry\s*-\s*/i, '')
    .replace(/^A One Jewellery\s*-\s*/i, '')
    .trim();
  const display = stripBrand(store.storeName || store.name || '');
  if (/^[A-Z]{1,4}-\d+$/i.test(display)) {
    const prefix = _branchAliasPrefix(display);
    if (prefix) return prefix;
  }
  const nameMatch = String(store.storeName || store.name || '').match(/\b([A-Z]{1,4}-\d+)\b/i);
  if (nameMatch) {
    const prefix = _branchAliasPrefix(nameMatch[1]);
    if (prefix) return prefix;
  }
  return '';
};

const _extractStoreCode = (store, storeIdHint = '') => {
  const fromBranch = _branchAliasPrefix(
    storeIdHint,
    store?.branchCode,
    store?.code,
    store?.legacyId,
  );
  if (fromBranch) return fromBranch;

  const fromStoreLabel = _branchLabelFromStore(store);
  if (fromStoreLabel) return fromStoreLabel;

  if (store?.shortCode) {
    const fromShort = _normalizeSerialPrefix(store.shortCode);
    if (fromShort) return fromShort;
  }

  for (const field of [store?.branchCode, store?.code, store?.legacyId]) {
    const fromAlias = _branchAliasPrefix(field);
    if (fromAlias) return fromAlias;
    const prefix = _normalizeSerialPrefix(field);
    if (prefix) return prefix;
  }

  const fromId = _branchAliasPrefix(store?.id);
  if (fromId) return fromId;

  const name = store?.storeName || store?.name || '';
  const code = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  if (code.length >= 2) return code.padEnd(3, code[0]);

  const hint = _normalizeSerialPrefix(storeIdHint);
  return hint || 'XXX';
};

const _resolveSerialPrefix = (storeId, branchHint = '') => {
  const hint = String(branchHint || _state.branchHint || '').trim();

  const fromBranch = _branchAliasPrefix(hint);
  if (fromBranch) return fromBranch;

  const cachedStore = _getCachedStoreSync(storeId);
  if (cachedStore) {
    const fromStore = _extractStoreCode(cachedStore, hint);
    if (fromStore && fromStore !== 'XXX') return fromStore;
  }

  try {
    const code = localStorage.getItem(STORE_CODE_CACHE_KEY(storeId));
    const normalized = _normalizeSerialPrefix(code);
    if (normalized) return normalized;
    if (code) localStorage.removeItem(STORE_CODE_CACHE_KEY(storeId));
  } catch { /* ignore */ }

  return _normalizeSerialPrefix(hint) || null;
};

const _extractUserCode = (user) => {
  if (!user) return null;
  return user.userCode || user.posCode || null;
};

// ══════════════════════════════════════════════════════════════
// STORE FETCH (with caching)
// ══════════════════════════════════════════════════════════════
const _getCachedStoreSync = (storeId) => {
  if (!storeId) return null;
  try {
    const raw = localStorage.getItem(STORE_CACHE_KEY(storeId));
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
};

const _loadCachedStoreCode = (storeId, branchHint = '') =>
  _resolveSerialPrefix(storeId, branchHint);

const _saveStoreCodeCache = (storeId, storeCode) => {
  if (!storeId || !storeCode || storeCode === "XXX" || !_isValidSerialPrefix(storeCode)) return;
  try {
    localStorage.setItem(STORE_CODE_CACHE_KEY(storeId), storeCode);
  } catch { /* ignore */ }
};

const _fetchStore = async (storeId) => {
  if (!storeId) return null;

  const stale = _getCachedStoreSync(storeId);

  // Fresh cache — instant return
  if (stale?._cachedAt && Date.now() - stale._cachedAt < STORE_CACHE_MS) {
    return stale;
  }

  if (!getHasInternet()) return stale;

  try {
    const { getStoreById } = await import('./storeService');
    const hit = await getStoreById(storeId);
    if (!hit) return stale;

    const storeData = {
      id: hit.id || storeId,
      ...hit,
      _cachedAt: Date.now(),
    };

    try {
      localStorage.setItem(STORE_CACHE_KEY(storeId), JSON.stringify(storeData));
      const extracted = _extractStoreCode(storeData, _resolveCodeHint(storeId, _state.branchHint));
      _saveStoreCodeCache(storeId, extracted);
    } catch { /* ignore */ }

    return storeData;
  } catch (err) {
    console.warn("[serial] fetchStore failed:", err.message);
    return stale;
  }
};

// ══════════════════════════════════════════════════════════════
// EXTRACT SERIAL NUMBER from string like "AON-BIL-160526-000006"
// ══════════════════════════════════════════════════════════════
export const extractSerialNumber = (serial) => {
  if (!serial) return 0;
  if (typeof serial === "number") return serial;

  const s = String(serial).trim().toUpperCase();
  if (!s) return 0;

  // New format: BRANCH-BILLER-DEVICE[-DATE]-SERIAL[-SUFFIX]-STATUS
  const enterprise = s.match(/-(\d{4,12})(?:[A-Z]*)-(?:0|1)$/);
  if (enterprise) return parseInt(enterprise[1], 10) || 0;

  // Legacy formats: JMJ-BIL-250626-000042 or JMJ-BIL-250626-000042-H
  const structured = s.match(/-(\d{6})-(\d{1,6})(?:-[A-Z])?$/);
  if (structured) return parseInt(structured[2], 10) || 0;

  const glued = s.match(/-(\d{6})-(\d+)([A-Z])$/);
  if (glued) return parseInt(glued[2], 10) || 0;

  const parts = s.split("-");
  let last = parts[parts.length - 1] || "";
  if (/^\d+[A-Z]$/.test(last)) last = last.slice(0, -1);
  const n = parseInt(last, 10);
  return Number.isNaN(n) ? 0 : n;
};

const _serialFromOrder = (order) =>
  order?.billSerial || order?.serialNo || order?.billNo || "";

/** Highest numeric serial from Firestore + local Dexie (fixes stale global counter) */
const _fetchMaxSerialFromOrders = async () => {
  let max = 0;

  if (getHasInternet()) {
    try {
      const { getDocsFromServer } = await import("firebase/firestore");
      const scanSnap = (snap) => {
        snap.forEach((d) => {
          const n = extractSerialNumber(_serialFromOrder(d.data()));
          if (n > max) max = n;
        });
      };
      try {
        scanSnap(await getDocsFromServer(query(
          collection(db, "orders"),
          orderBy("createdAt", "desc"),
          limit(100),
        )));
      } catch (err) {
        console.warn("[serial] sorted orders scan failed:", err?.message || err);
      }
      try {
        scanSnap(await getDocsFromServer(query(
          collection(db, "orders"),
          limit(200),
        )));
      } catch (err) {
        console.warn("[serial] plain orders scan failed:", err?.message || err);
      }
    } catch (err) {
      console.warn("[serial] Firestore orders scan failed:", err?.message || err);
    }
  }

  try {
    const { db: localDb, ensureDbReady } = await import("../db/index");
    await ensureDbReady();
    const localOrders = await localDb.orders.toArray();
    localOrders.forEach((o) => {
      if (o?.isDeleted) return;
      const n = extractSerialNumber(_serialFromOrder(o));
      if (n > max) max = n;
    });
  } catch (err) {
    console.warn("[serial] Local orders scan failed:", err?.message || err);
  }

  return max;
};

const _reconcileCounterWithOrders = async (serverCounter, storeCode) => {
  const ordersMax = await _fetchMaxSerialFromOrders();
  if (!ordersMax || ordersMax <= serverCounter) {
    return { serverCounter, ordersMax };
  }

  console.log("[serial] ⚠️ Counter behind saved bills:", serverCounter, "→", ordersMax);

  if (getHasInternet() && storeCode) {
    try {
      const counterRef = doc(db, GLOBAL_COUNTER_PATH);
      await setDoc(counterRef, {
        lastNumber: ordersMax,
        lastSerial: _buildSerial(ordersMax),
        lastUpdatedAt: serverTimestamp(),
        lastUpdatedBy: _state.userId || "orders-reconcile",
        lastStoreCode: storeCode,
      }, { merge: true });
    } catch (err) {
      console.warn("[serial] Counter reconcile write failed:", err?.message || err);
    }
  }

  return { serverCounter: ordersMax, ordersMax };
};

// ==============================================================
// FIREBASE: Get global counter (auto-creates document if missing)
// ✅ Auto-creates globalCounters/billSerial with ALL required fields
// ✅ Back-fills missing fields in existing documents
// ==============================================================
const _fetchServerCounter = async () => {
  if (!getHasInternet()) return _state.serverCounter || _loadLastKnownServerCounter();

  try {
    const counterRef = doc(db, GLOBAL_COUNTER_PATH);
    const snap = await getDoc(counterRef);

    if (!snap.exists()) {
      // ✅ AUTO-CREATE: Document missing → create with ALL required fields
      console.log("[serial] 📄 globalCounters/billSerial missing → auto-creating...");
      try {
        await setDoc(counterRef, {
          lastNumber: 0,
          lastUpdatedAt: serverTimestamp(),
          lastStoreCode: "",
          lastSerial: "",
          lastUpdatedBy: "system",
          createdAt: serverTimestamp(),
        });
        console.log("[serial] ✅ globalCounters/billSerial auto-created successfully");
      } catch (createErr) {
        console.warn("[serial] Auto-create failed (race condition ok):", createErr.message);
      }
      return 0;
    }

    const data = snap.data();

    // ✅ Back-fill any missing fields (upgrade existing documents silently)
    const missingFields = {};
    if (!('createdAt'     in data)) missingFields.createdAt     = serverTimestamp();
    if (!('lastStoreCode' in data)) missingFields.lastStoreCode = "";
    if (!('lastSerial'    in data)) missingFields.lastSerial    = "";
    if (!('lastUpdatedBy' in data)) missingFields.lastUpdatedBy = "system";

    if (Object.keys(missingFields).length > 0) {
      // Non-blocking back-fill — don't delay the caller
      setDoc(counterRef, missingFields, { merge: true }).catch(
        (e) => console.warn("[serial] Back-fill failed:", e.message)
      );
      console.log("[serial] 🔧 Back-filling missing fields:", Object.keys(missingFields).join(", "));
    }

    const lastNumber = Number(data.lastNumber) || 0;
    _saveLastKnownServerCounter(lastNumber);
    return lastNumber;
  } catch (err) {
    console.warn("[serial] fetchServerCounter failed:", err.message);
    return _state.serverCounter || _loadLastKnownServerCounter();
  }
};

// ==============================================================
// FIREBASE: Atomic increment counter (Transaction)
// ✅ Auto-creates document on FIRST USE with ALL required fields
// ✅ Includes createdAt on first write
// ✅ Always updates lastSerial for audit trail
// ==============================================================
const _atomicIncrementCounter = async (offlineGeneratedCount = 1) => {
  const counterRef = doc(db, GLOBAL_COUNTER_PATH);

  // Retry wrapper around runTransaction to handle transient Firestore errors
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      const result = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(counterRef);
        const isFirstCreate = !snap.exists();
        const current = isFirstCreate ? 0 : (Number(snap.data().lastNumber) || 0);

        const newNumber = current + offlineGeneratedCount;
        const newSerial = _buildSerial(newNumber);

        const updateData = {
          lastNumber:     newNumber,
          lastUpdatedAt:  serverTimestamp(),
          lastUpdatedBy:  _state.userId     || "system",
          lastStoreCode:  _state.storeCode  || "",
          lastSerial:     newSerial,
        };

        // Include createdAt ONLY on first-ever write
        if (isFirstCreate) {
          updateData.createdAt = serverTimestamp();
          console.log("[serial] 🆕 First-ever write to globalCounters/billSerial");
        }

        transaction.set(counterRef, updateData, { merge: true });

        return { startNumber: current + 1, endNumber: newNumber };
      });

      return result;
    } catch (err) {
      // Log details for debugging
      console.warn(`[serial] _atomicIncrementCounter attempt ${attempt + 1} failed:`, err?.code || err?.message || err);

      // If last attempt, rethrow
      if (attempt === MAX_RETRY - 1) throw err;

      // Backoff before retrying
      const backoff = 100 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
};

// ==============================================================
// LIVE LISTENER (real-time counter updates from other devices)
// ✅ Uses onSnapshot (NOT getDoc) — real-time cross-device sync
// ✅ Document non-existence → triggers auto-create
// ✅ Logs update source for debugging
// ==============================================================
const _setupLiveListener = () => {
  if (_liveUnsub) {
    try { _liveUnsub(); } catch {}
    _liveUnsub = null;
  }

  if (!getHasInternet()) return;

  try {
    _liveUnsub = onSnapshot(
      doc(db, GLOBAL_COUNTER_PATH),
      (snap) => {
        if (!snap.exists()) {
          // Document missing → trigger auto-create non-blocking
          console.log("[serial] 🔔 Live: document missing → auto-creating...");
          _fetchServerCounter().catch(() => {});
          return;
        }

        const data = snap.data();
        const serverCounter = Number(data.lastNumber) || 0;
        _saveLastKnownServerCounter(serverCounter);

        // Log when another user/device updates the counter
        if (serverCounter > _state.serverCounter) {
          console.log(
            `[serial] 🔔 Real-time update: ${_state.serverCounter} → ${serverCounter}`,
            `| by: ${data.lastUpdatedBy || '?'} | store: ${data.lastStoreCode || '?'}`
          );
        }

        if (serverCounter > _state.serverCounter) {
          _state.serverCounter = serverCounter;
          const pendingMax = _getPendingBills().reduce(
            (m, p) => Math.max(m, Number(p.counter) || 0),
            0,
          );
          const nextLocal = Math.max(_state.localCounter, serverCounter, pendingMax);
          if (nextLocal > _state.localCounter) {
            _state.localCounter = nextLocal;
            _saveLocalCounter(nextLocal);
            _broadcast(nextLocal);
            _notifySubscribers();
          }
        }
      },
      (err) => {
        console.warn("[serial] live listener error:", err?.code);
        if (err?.code === 'permission-denied') {
          console.error("[serial] ❌ Permission denied for globalCounters/billSerial — add rule to firestore.rules");
        }
      }
    );
  } catch (err) {
    console.warn("[serial] setupLiveListener failed:", err?.message);
  }
};

// ─────────────────────────────────────────────────────────────────
// OFFLINE HANDLER — align local counter when connectivity is lost
// Ensures offline claims start from the last-known server/order/broadcast
// floor instead of falling back to too-low counters like 1.
// ─────────────────────────────────────────────────────────────────
const _handleOfflineEvent = () => {
  try {
    const lastKnownServer = _loadLastKnownServerCounter() || 0;
    const broadcastMax = _readBroadcastMax(_state.storeId) || 0;
    const floor = Math.max(
      Number(_state.serverCounter) || 0,
      Number(_ordersMaxCache) || 0,
      Number(broadcastMax) || 0,
      Number(lastKnownServer) || 0,
    );

    if (Number.isFinite(floor) && floor > _state.localCounter) {
      _state.localCounter = floor;
      try { _saveLocalCounter(_state.localCounter); } catch (e) { /* ignore */ }
      try { _notifySubscribers(); } catch (e) { /* ignore */ }
      console.log('[serial] 📴 Offline detected — aligned local counter to', _state.localCounter);
    }
  } catch (err) {
    /* ignore */
  }
};

if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
  try {
    window.addEventListener('offline', _handleOfflineEvent, { passive: true });
  } catch (e) { /* ignore */ }
}

// ══════════════════════════════════════════════════════════════
// SUBSCRIBERS (UI updates)
// ══════════════════════════════════════════════════════════════
const _notifySubscribers = () => {
  if (!_subscribers.size) return;

  const next = _nextSerialNumber();
  const serial = _state.storeCode
    ? _buildSerial(next)
    : null;
  
  _subscribers.forEach((cb) => {
    try {
      cb({
        serial,
        counter: next,
        ready: _state.initialized,
        storeCode: _state.storeCode,
        pendingOffline: _state.pendingOffline,
      });
    } catch {}
  });
};

export const subscribeNextSerial = (cb) => {
  if (typeof cb !== "function") return () => {};
  _subscribers.add(cb);
  
  if (_state.initialized && _state.storeCode) {
    _notifySubscribers();
  } else {
    cb({ serial: null, counter: null, ready: false, storeCode: null, pendingOffline: 0 });
  }
  
  return () => _subscribers.delete(cb);
};

const _resolveCodeHint = (storeId, branchHint = '') => {
  const raw = String(branchHint || _state.branchHint || '').trim();
  if (raw && (_branchAliasPrefix(raw) || _normalizeSerialPrefix(raw))) return raw;

  const cached = _getCachedStoreSync(storeId);
  if (cached) {
    for (const field of [cached.legacyId, cached.branchCode, cached.code]) {
      if (field && _branchAliasPrefix(field)) return String(field).trim();
    }
    const fromLabel = _branchLabelFromStore(cached);
    if (fromLabel) return fromLabel;
    if (cached.shortCode && _normalizeSerialPrefix(cached.shortCode)) {
      return String(cached.shortCode).trim();
    }
  }
  return raw;
};

/** Instant serial from localStorage — no network (call before subscribe) */
export const bootstrapNextSerial = (storeId, user = null, branchHint = '') => {
  if (!storeId) return null;

  if (
    _state.initialized
    && _state.storeId === storeId
    && _isValidSerialPrefix(_state.storeCode)
  ) {
    const refreshed = _resolveSerialPrefix(storeId, branchHint);
    if (refreshed && refreshed !== _state.storeCode) {
      _state.storeCode = refreshed;
      _saveStoreCodeCache(storeId, refreshed);
    }
    _notifySubscribers();
    return _buildSerial(_nextSerialNumber());
  }

  if (_state.storeId !== storeId) {
    _state.storeCode = null;
    _state.initialized = false;
  }

  _state.storeId = storeId;
  _state.branchHint = branchHint || _state.branchHint || null;
  _state.userId = user?.uid || null;
  _state.userCode = _extractUserCode(user);
  _state.userName = user?.name || user?.displayName || "Unknown";

  _state.storeCode = _resolveSerialPrefix(storeId, branchHint);

  const localCounter = _loadLocalCounter();
  const lastKnownServer = _loadLastKnownServerCounter();
  _state.localCounter = localCounter;
  _state.serverCounter = Math.max(_state.serverCounter || 0, localCounter, lastKnownServer);
  _state.pendingOffline = _getPendingBills().length;

  if (_state.storeCode && _state.storeCode !== "XXX") {
    _state.initialized = true;
    _notifySubscribers();
    const serial = _buildSerial(_nextSerialNumber());
    _runBackgroundSync(storeId, user).catch(() => {});
    return serial;
  }

  _runBackgroundSync(storeId, user).catch(() => {});
  return null;
};

let _bgSyncPromise = null;
let _lastBgSyncAt = 0;
const BG_SYNC_MIN_MS = 2500;

const _runBackgroundSyncInner = async (storeId, user) => {
  try {
    const store = await _fetchStore(storeId);
    const resolved = _resolveSerialPrefix(storeId, _state.branchHint);
    if (resolved) {
      _state.storeCode = resolved;
      _saveStoreCodeCache(storeId, resolved);
    } else if (store) {
      const code = _extractStoreCode(store, _resolveCodeHint(storeId, _state.branchHint));
      if (code && code !== 'XXX') {
        _state.storeCode = code;
        _saveStoreCodeCache(storeId, code);
      }
    }

    if (!getHasInternet()) {
      if (_state.storeCode) {
        _state.initialized = true;
        _notifySubscribers();
      }
      return _state.localCounter;
    }

    let serverCounter = await _fetchServerCounter();
    if ((serverCounter || 0) < 1) {
      try {
        const repairRes = await repairServerCounter();
        if (repairRes?.repaired) serverCounter = await _fetchServerCounter();
      } catch { /* ignore */ }
    }
    _saveLastKnownServerCounter(serverCounter);

    const localCounter = _loadLocalCounter();
    const lastKnown = _loadLastKnownServerCounter();
    const maxCounter = Math.max(serverCounter || 0, localCounter || 0, _state.localCounter || 0, lastKnown || 0);
    _state.localCounter = maxCounter;
    _state.serverCounter = maxCounter;
    _saveLocalCounter(maxCounter);
    _saveLastKnownServerCounter(maxCounter);
    _state.lastServerSync = Date.now();

    if (_state.storeCode) _state.initialized = true;
    _setupLiveListener();
    _notifySubscribers();

    // Heavy reconcile — never blocks first paint
    if (_state.storeCode) {
      _pruneStalePendingBills().catch(() => {});
      _reconcileCounterWithOrders(serverCounter, _state.storeCode)
        .then(({ serverCounter: reconciled, ordersMax }) => {
          const next = Math.max(reconciled || 0, ordersMax || 0, _state.localCounter || 0);
          if (next > _state.localCounter) {
            _state.localCounter = next;
            _state.serverCounter = next;
            _ordersMaxCache = Math.max(_ordersMaxCache, ordersMax || 0);
            _saveLocalCounter(next);
            _saveLastKnownServerCounter(next);
            _notifySubscribers();
          }
        })
        .catch(() => {});
    }

    refreshOrdersMaxCache(storeId).catch(() => {});
    return _state.localCounter;
  } catch (err) {
    console.warn("[serial] background sync failed:", err?.message || err);
    return _state.localCounter;
  }
};

const _runBackgroundSync = (storeId, user) => {
  const now = Date.now();
  if (_bgSyncPromise) return _bgSyncPromise;
  if (
    _state.initialized
    && _state.storeId === storeId
    && now - _lastBgSyncAt < BG_SYNC_MIN_MS
  ) {
    return Promise.resolve(_state.localCounter);
  }

  _bgSyncPromise = _runBackgroundSyncInner(storeId, user).finally(() => {
    _bgSyncPromise = null;
    _lastBgSyncAt = Date.now();
  });
  return _bgSyncPromise;
};

// ══════════════════════════════════════════════════════════════
// INIT - Load state on login or store change
// ✅ FIXED: Always fetch from server first, then use max(server, local)
// ══════════════════════════════════════════════════════════════
const _init = async (storeId, user) => {
  console.log("[serial] 🔄 Initializing...", { storeId, userId: user?.uid });

  _state.storeId = storeId;
  _state.userId = user?.uid || null;
  _state.userCode = _extractUserCode(user);
  _state.userName = user?.name || user?.displayName || "Unknown";

  _state.storeCode = _resolveSerialPrefix(storeId, _state.branchHint);

  const localCounter = _loadLocalCounter();
  const lastKnownServer = _loadLastKnownServerCounter();
  _state.localCounter = localCounter;
  _state.serverCounter = Math.max(_state.serverCounter || 0, localCounter, lastKnownServer);
  _state.pendingOffline = _getPendingBills().length;

  if (_state.storeCode && _state.storeCode !== "XXX") {
    _state.initialized = true;
    _notifySubscribers();
  }

  return _runBackgroundSync(storeId, user);
};

const _ensureInit = async (storeId, user) => {
  const newUserId = user?.uid || null;

  // Already initialized for same store + user → skip re-init
  if (
    _state.initialized &&
    _state.storeId === storeId &&
    _state.userId === newUserId
  ) {
    return;
  }

  if (_state.storeId !== storeId) {
    console.log(`[serial] Branch switch: ${_state.storeId || '—'} → ${storeId}`);
    _state.initialized = false;
    _state.storeCode = null;
  }

  // ✅ NEW LOGIN DETECTED: Different user → force fresh Firebase sync
  // Ensures each new login always gets current counter from server
  if (_state.initialized && newUserId !== null && _state.userId !== newUserId) {
    console.log(`[serial] 👤 New login: ${_state.userId} → ${newUserId} — forcing fresh sync`);
    _state.initialized = false;
  }

  // Init in progress
  if (_state.initPromise) {
    await _state.initPromise;
    if (
      _state.initialized &&
      _state.storeId === storeId &&
      _state.userId === newUserId
    ) {
      return;
    }
  }

  _state.initPromise = _init(storeId, user).finally(() => {
    _state.initPromise = null;
  });

  await _state.initPromise;
};

// ══════════════════════════════════════════════════════════════
// CLAIM NEXT SERIAL (Main API)
// ══════════════════════════════════════════════════════════════
export const claimNextSerial = async (storeId, isOnline = getHasInternet(), user = null) => {
  if (!storeId) {
    throw new Error("storeId is required to claim serial");
  }
  
  const userObj = typeof user === "object" ? user : null;
  
  // Ensure initialized — time-boxed so a hung network never blocks billing.
  // Cached store code (from localStorage) lets us proceed offline even if init is slow.
  try {
    await _withTimeout(_ensureInit(storeId, userObj), ONLINE_CLAIM_TIMEOUT_MS, "serial-init");
  } catch (initErr) {
    console.warn("[serial] init slow/unreachable, using cached state:", initErr?.message || initErr);
  }
  
  if (!_state.storeCode || !_isValidSerialPrefix(_state.storeCode)) {
    _state.storeCode = _resolveSerialPrefix(storeId, _state.branchHint);
  }
  if (!_state.storeCode) {
    throw new Error("Store code not configured. Contact SuperAdmin to set shortCode.");
  }

  try {
    await _withTimeout(
      _reconcileCounterBeforeClaim(storeId, {
        allowNetwork: Boolean(isOnline && getHasInternet()),
        timeoutMs: ONLINE_CLAIM_TIMEOUT_MS,
      }),
      ONLINE_CLAIM_TIMEOUT_MS,
      "reconcile",
    );
  } catch (reconcileErr) {
    console.warn("[serial] pre-claim reconcile skipped:", reconcileErr?.message || reconcileErr);
  }
  
  // OFFLINE FLOW
  if (!isOnline || !getHasInternet()) {
    return _claimOfflineSerial();
  }
  
  // ONLINE FLOW with atomic transaction
  await _acquireLock();
  
  try {
    // Sync pending offline bills first if any (time-boxed — never blocks the claim)
    if (_state.pendingOffline > 0) {
      try {
        await _withTimeout(_syncPendingBills(), ONLINE_CLAIM_TIMEOUT_MS, "pending-sync");
      } catch (syncErr) {
        console.warn("[serial] pending sync skipped (will retry later):", syncErr?.message || syncErr);
      }
    }
    
    // Atomic increment — time-boxed so an unreachable server can't freeze billing
    const { startNumber } = await _withTimeout(
      _atomicIncrementCounter(1),
      ONLINE_CLAIM_TIMEOUT_MS,
      "serial-claim",
    );
    
    _state.localCounter = startNumber;
    _state.serverCounter = startNumber;
    _saveLocalCounter(startNumber);
    _saveLastKnownServerCounter(startNumber);
    
    const serial = _buildSerial(startNumber);
    
    _broadcast(startNumber);
    _notifySubscribers();
    
    console.log(`[serial] ✅ ONLINE CLAIMED: ${serial}`);
    return serial;
    
  } catch (err) {
    console.error("[serial] Online claim failed/timed out, falling back to offline:", err.message);
    return _claimOfflineSerial();
  } finally {
    _releaseLock();
  }
};

/**
 * Instant serial claim — zero network wait (offline-first checkout UX).
 * Uses cached store code + local counter; Firebase sync happens on bill save.
 */
export const claimSerialInstant = (storeId, user = null) => {
  const userObj = typeof user === "object" ? user : null;
  bootstrapNextSerial(storeId, userObj);
  if (!_state.storeCode || !_isValidSerialPrefix(_state.storeCode)) {
    _state.storeCode = _resolveSerialPrefix(storeId, _state.branchHint);
    if (_state.storeCode) _state.initialized = true;
  }
  if (!_state.storeCode || _state.storeCode === "XXX") {
    throw new Error("Store code not configured. Contact SuperAdmin to set shortCode.");
  }
  return _claimOfflineSerial();
};

/** Async — prefers shop LAN server serial counter (multi-PC offline safe). */
export const claimSerialInstantAsync = async (storeId, user = null) => {
  const userObj = typeof user === "object" ? user : null;
  bootstrapNextSerial(storeId, userObj);
  if (!_state.storeCode || !_isValidSerialPrefix(_state.storeCode)) {
    _state.storeCode = _resolveSerialPrefix(storeId, _state.branchHint);
    if (_state.storeCode) _state.initialized = true;
  }
  if (!_state.storeCode || _state.storeCode === "XXX") {
    throw new Error("Store code not configured. Contact SuperAdmin to set shortCode.");
  }

  try {
    await _withTimeout(
      _reconcileCounterBeforeClaim(storeId, {
        allowNetwork: getHasInternet(),
        timeoutMs: ONLINE_CLAIM_TIMEOUT_MS,
      }),
      ONLINE_CLAIM_TIMEOUT_MS,
      "reconcile",
    );
  } catch (reconcileErr) {
    console.warn("[serial] instant reconcile skipped:", reconcileErr?.message || reconcileErr);
  }

  try {
    const { shopApiClaimSerial } = await import('./shopApiService.js');
    const serial = await shopApiClaimSerial(storeId, _state.storeCode);
    if (serial) {
      const num = extractSerialNumber(serial);
      if (num > _state.localCounter) {
        _state.localCounter = num;
        _state.serverCounter = num;
        _saveLocalCounter(num);
        _saveLastKnownServerCounter(num);
      }
      _broadcast(num);
      _notifySubscribers();
      console.log(`[serial] ✅ SHOP LAN CLAIMED: ${serial}`);
      return serial;
    }
  } catch (e) {
    console.warn('[serial] shop LAN claim fallback:', e?.message || e);
  }

  return _claimOfflineSerial();
};

// ══════════════════════════════════════════════════════════════
// OFFLINE CLAIM
// ══════════════════════════════════════════════════════════════
const _claimOfflineSerial = () => {
  // Ensure offline claims never step below any known server/order/broadcast floor
  if (_offlineClaimLock) {
    const bumped = Math.max(_state.localCounter, _effectiveUsedCounter()) + 1;
    _state.localCounter = bumped;
    console.warn('[serial] ⚠️ Offline claim contention — bumped to', bumped);
  }
  _offlineClaimLock = true;
  try {
    // Recompute a safe floor from all sources we can read locally
    try {
      const lastKnownServer = _loadLastKnownServerCounter();
      const broadcastMax = _readBroadcastMax(_state.storeId) || 0;
      const floor = Math.max(
        Number(_state.serverCounter) || 0,
        Number(_ordersMaxCache) || 0,
        Number(broadcastMax) || 0,
        Number(lastKnownServer) || 0,
      );
      if (floor > _state.localCounter) {
        _state.localCounter = floor;
        _saveLocalCounter(_state.localCounter);
      }
    } catch (e) {
      // ignore local read failures — proceed conservatively
    }

    const nextNumber = _nextSerialNumber();

    _state.localCounter = nextNumber;
    _state.pendingOffline = _getPendingBills().length + 1;

    _saveLocalCounter(nextNumber);

    const serial = _buildSerial(nextNumber);

    const pending = _getPendingBills();
    if (pending.some((p) => p.serial === serial)) {
      const retry = nextNumber + 1;
      _state.localCounter = retry;
      _saveLocalCounter(retry);
      const retrySerial = _buildSerial(retry);
      _savePendingBill(retrySerial, retry, _state.storeCode);
      _broadcast(retry);
      _notifySubscribers();
      console.log(`[serial] 📡 OFFLINE CLAIMED (retry): ${retrySerial}`);
      return retrySerial;
    }

    _savePendingBill(serial, nextNumber, _state.storeCode);

    _broadcast(nextNumber);
    _notifySubscribers();

    console.log(`[serial] 📡 OFFLINE CLAIMED: ${serial} (pending: ${_state.pendingOffline})`);
    return serial;
  } finally {
    _offlineClaimLock = false;
  }
};

// ══════════════════════════════════════════════════════════════
// SYNC PENDING OFFLINE BILLS (when online comes back)
// ══════════════════════════════════════════════════════════════
const _syncPendingBills = async () => {
  if (!getHasInternet()) return;
  
  const pending = _getPendingBills();
  if (!pending.length) {
    _state.pendingOffline = 0;
    return;
  }
  
  console.log(`[serial] 🔄 Syncing ${pending.length} pending bills...`);
  
  try {
    // Get current server counter
    const serverCounter = await _fetchServerCounter();
    _state.serverCounter = serverCounter;
    
    // Check each pending bill for conflicts
    const reassignments = [];
    
    for (const pendingBill of pending) {
      if (pendingBill.counter <= serverCounter) {
        // CONFLICT - this number is already used
        reassignments.push(pendingBill);
      }
    }
    
    if (reassignments.length > 0) {
      console.log(`[serial] ⚠️ ${reassignments.length} bills need reassignment`);
      
      // Atomic increment for all reassignments
      const { startNumber, endNumber } = await _atomicIncrementCounter(reassignments.length);
      
      const reassignMap = new Map();
      reassignments.forEach((bill, idx) => {
        const newNumber = startNumber + idx;
        const newSerial = _buildSerial(newNumber);
        reassignMap.set(bill.serial, { newSerial, newNumber });
      });
      
      // Notify UI about reassignments via broadcast
      if (typeof BroadcastChannel !== "undefined") {
        try {
          const ch = new BroadcastChannel("aone_serial_reassign");
          ch.postMessage({
            type: "bills_reassigned",
            reassignments: Array.from(reassignMap.entries()).map(([oldSerial, info]) => ({
              oldSerial,
              newSerial: info.newSerial,
              newNumber: info.newNumber,
            })),
          });
          ch.close();
        } catch {}
      }
      
      // Persist reassigned pending bills locally so UI and sync are consistent
      try {
        const pendingList = _getPendingBills();
        const updated = pendingList.map((p) => {
          const map = reassignMap.get(p.serial);
          if (map) return { ...p, serial: map.newSerial, counter: map.newNumber };
          return p;
        });
        localStorage.setItem(PENDING_BILLS_KEY, JSON.stringify(updated.slice(-100)));
      } catch (e) { /* ignore */ }

      _state.localCounter = endNumber;
      _state.serverCounter = endNumber;
      _saveLocalCounter(endNumber);
    } else {
      // No conflicts - just update counter on server
      const maxPendingCounter = Math.max(...pending.map(b => b.counter));
      if (maxPendingCounter > serverCounter) {
        await setDoc(doc(db, GLOBAL_COUNTER_PATH), {
          lastNumber: maxPendingCounter,
          lastUpdatedAt: serverTimestamp(),
          lastUpdatedBy: _state.userId || "system",
          lastStoreCode: _state.storeCode,
        }, { merge: true });
        
        _state.serverCounter = maxPendingCounter;
      }
    }
    
    // Clear pending
    pending.forEach(bill => _removePendingBill(bill.serial));
    _state.pendingOffline = 0;
    
    console.log(`[serial] ✅ Sync complete`);
    
  } catch (err) {
    console.error("[serial] Sync pending bills failed:", err.message);
  }
};

// ══════════════════════════════════════════════════════════════
// MARK SERIAL AS USED (after bill saved)
// ══════════════════════════════════════════════════════════════
export const markSerialUsed = async (storeId, serial) => {
  const num = extractSerialNumber(serial);
  if (!num) return;
  
  // Remove from pending if exists
  _removePendingBill(serial);
  
  // Update local counter
  if (num > _ordersMaxCache) _ordersMaxCache = num;
  if (num > _state.localCounter) {
    _state.localCounter = num;
    _state.serverCounter = Math.max(_state.serverCounter, num);
    _saveLocalCounter(num);
    _saveLastKnownServerCounter(Math.max(_state.serverCounter, num));
    _broadcast(num);
    _notifySubscribers();
  }
};

// ══════════════════════════════════════════════════════════════
// GET PLACEHOLDER (preview before claim)
// ══════════════════════════════════════════════════════════════
export const getPlaceholderSerial = (storeId, user = null) => {
  if (!_state.storeCode) return null;
  return _buildSerial(_nextSerialNumber());
};

export const getCurrentNextSerial = () => {
  if (!_state.initialized || !_state.storeCode) return null;
  return _buildSerial(_nextSerialNumber());
};

// ══════════════════════════════════════════════════════════════
// FORCE SYNC FROM FIREBASE
// ══════════════════════════════════════════════════════════════
export const syncSerialFromFirebase = async (storeId, user = null, branchHint = '') => {
  if (!storeId) return 0;

  const userObj = typeof user === "object" ? user : null;
  const uid = userObj?.uid || null;
  if (branchHint) _state.branchHint = branchHint;

  if (_state.storeId !== storeId) {
    _state.storeCode = null;
    _state.initialized = false;
  }

  // Already bootstrapped — soft background refresh (no reset / no spinner)
  if (_state.initialized && _state.storeId === storeId && _state.userId === uid) {
    return _runBackgroundSync(storeId, userObj);
  }

  await _ensureInit(storeId, userObj);
  return _state.localCounter;
};

// ══════════════════════════════════════════════════════════════
// ITEM SERIAL (per-bill item numbering)
// ══════════════════════════════════════════════════════════════
export const getNextItemSerial = () => ++_state.itemCounter;
export const resetItemSerialCounter = () => { _state.itemCounter = 0; };

// ══════════════════════════════════════════════════════════════
// CHECK DUPLICATE
// ══════════════════════════════════════════════════════════════
export const checkSerialDuplicate = async (storeId, serial) => {
  if (!serial || !getHasInternet()) return false;
  
  try {
    for (const field of ["billSerial", "serialNo"]) {
      const snap = await getDocs(query(
        collection(db, "orders"),
        where(field, "==", serial),
        limit(1),
      ));
      if (!snap.empty) return true;
    }
    return false;
  } catch {
    return false;
  }
};

/** True if this bill serial already exists locally or in Firestore */
export const orderExistsForSerial = async (serial) => {
  const s = String(serial || "").trim().toUpperCase();
  if (!s || s === "----") return false;

  try {
    const { db: localDb, ensureDbReady } = await import("../db/index");
    await ensureDbReady();
    const localHit = await localDb.orders
      .filter((o) => {
        if (o?.isDeleted) return false;
        const os = String(_serialFromOrder(o) || "").toUpperCase();
        return os === s;
      })
      .first();
    if (localHit) return true;
  } catch { /* ignore */ }

  if (!getHasInternet()) return false;
  return checkSerialDuplicate(_state.storeId, serial);
};

// ══════════════════════════════════════════════════════════════
// GET STATE (for debugging)
// ══════════════════════════════════════════════════════════════
export const getSerialState = () => ({
  ..._state,
  deviceId: getDeviceId(),
  nextSerial: _state.storeCode
    ? _buildSerial(_nextSerialNumber())
    : null,
});

/**
 * Repair server counter to match lastSerial if inconsistent.
 * Use only when you confirm `lastNumber` is stale compared to `lastSerial`.
 */
export const repairServerCounter = async () => {
  try {
    const counterRef = doc(db, GLOBAL_COUNTER_PATH);
    const snap = await getDoc(counterRef);
    if (!snap.exists()) return { repaired: false, reason: 'doc_missing' };
    const data = snap.data();
    const serverLastNumber = Number(data.lastNumber) || 0;
    const serverLastSerial = data.lastSerial || '';
    let parsed = extractSerialNumber(serverLastSerial);

    // If lastSerial doesn't parse to a positive number, try scanning recent orders
    if (!parsed || parsed < 1) {
      try {
        console.log('[serial] repair: lastSerial looks invalid, scanning recent orders for max serial...');
        const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(1000));
        const snapOrders = await getDocs(q);
        let max = 0;
        snapOrders.forEach((d) => {
          const od = d.data() || {};
          const s = od.billSerial || od.serialNo || od.billNo || '';
          const n = extractSerialNumber(s);
          if (n > max) max = n;
        });
        parsed = max;
        console.log('[serial] repair: highest serial found in recent orders =', parsed);
      } catch (e) {
        console.warn('[serial] repair: scanning orders failed:', e?.message || e);
      }
    }

    const target = Math.max(serverLastNumber, parsed || 0);

    if (target === serverLastNumber) {
      return { repaired: false, reason: 'already-in-sync', serverLastNumber, parsed };
    }

    await setDoc(counterRef, {
      lastNumber: target,
      lastUpdatedAt: serverTimestamp(),
      lastUpdatedBy: _state.userId || 'repair-script',
    }, { merge: true });

    console.log('[serial] repairServerCounter: set lastNumber ->', target);
    return { repaired: true, previous: serverLastNumber, new: target };
  } catch (err) {
    console.error('[serial] repairServerCounter failed:', err?.message || err);
    return { repaired: false, reason: err?.message || 'error' };
  }
};

// ==============================================================
// RESET (on logout - preserves localStorage)
// ✅ localStorage PRESERVED so counter survives logout/login
// ✅ In-memory state cleared (fresh Firebase sync on next login)
// ✅ Live listener closed (no ghost listeners)
// ✅ Pending offline count preserved (don't lose unsynced bills)
// ==============================================================
export const resetSerialService = () => {
  if (_liveUnsub) {
    try { _liveUnsub(); } catch {}
    _liveUnsub = null;
  }

  if (_bc) {
    try { _bc.close(); } catch {}
    _bc = null;
  }

  _subscribers.clear();

  // ✅ Preserve pending count (offline bills not yet synced)
  const pendingToPreserve = _state.pendingOffline || 0;
  // ✅ Read localStorage counter before reset (for logging only)
  const preservedCounter = _loadLocalCounter();

  // Reset in-memory state only (localStorage untouched)
  _state = {
    serverCounter: 0,        // Re-fetched from Firebase on next login
    localCounter: 0,         // Loaded from localStorage on next init
    pendingOffline: pendingToPreserve,  // Preserved until synced
    storeId: null,
    storeCode: null,
    userId: null,
    userCode: null,
    userName: null,
    initialized: false,
    initPromise: null,
    lastServerSync: 0,
    itemCounter: 0,
  };

  _claimLock = false;
  _claimQueue.length = 0;

  console.log(`[serial] 🔄 Service reset | localStorage counter: ${preservedCounter} | pending: ${pendingToPreserve}`);
};

// ══════════════════════════════════════════════════════════════
// CLEAR ALL CACHE (use carefully)
// ══════════════════════════════════════════════════════════════
export const clearLocalSerialCache = () => {
  try {
    const keys = Object.keys(localStorage).filter(k =>
      k.startsWith("pos_global_serial_") ||
      k.startsWith("pos_pending_serials") ||
      k.startsWith("pos_store_")
    );
    keys.forEach(k => localStorage.removeItem(k));
    resetSerialService();
    return true;
  } catch {
    return false;
  }
};

// ══════════════════════════════════════════════════════════════
// FORMAT HELPERS (backward compatibility)
// ══════════════════════════════════════════════════════════════
export const fmt3 = (n) => String(Math.max(1, Number(n) || 1)).padStart(3, "0");
export const fmt4 = (n) => String(Math.max(1, Number(n) || 1)).padStart(4, "0");
export const fmt5 = (n) => String(Math.max(1, Number(n) || 1)).padStart(5, "0");
export const fmt6 = pad6;

// ══════════════════════════════════════════════════════════════
// AUTO-SYNC ON NETWORK RESTORE
// ══════════════════════════════════════════════════════════════
if (typeof window !== "undefined") {
  window.addEventListener("online", async () => {
    console.log("[serial] 🌐 Network online - syncing...");
    
    if (_state.initialized && _state.storeId) {
      try {
        // Re-fetch server counter
        const serverCounter = await _fetchServerCounter();
        _state.serverCounter = serverCounter;
        
        // Sync pending bills
        if (_state.pendingOffline > 0) {
          await _syncPendingBills();
        }
        
        // Re-setup live listener
        _setupLiveListener();
        
        _notifySubscribers();
      } catch (err) {
        console.warn("[serial] Online sync failed:", err.message);
      }
    }
  });
  
  window.addEventListener("offline", () => {
    console.log("[serial] 📡 Network offline");
    
    if (_liveUnsub) {
      try { _liveUnsub(); } catch {}
      _liveUnsub = null;
    }
  });
  
  // Init broadcast channel
  try { _getBC(); } catch {}
}

// ══════════════════════════════════════════════════════════════
// BILLING CHECKOUT — fast + safe (online atomic, offline/LAN fallback)
// ══════════════════════════════════════════════════════════════
const BILLING_CLAIM_TIMEOUT_MS = 1500;

/**
 * Primary serial claim for F8 checkout.
 * Online: atomic Firebase counter (time-boxed). Offline: instant local (no network wait).
 */
export const claimSerialForBilling = async (storeId, user = null) => {
  const userObj = typeof user === "object" ? user : null;
  const online = getHasInternet();

  if (!online) {
    try {
      const serial = await _withTimeout(
        claimSerialInstantAsync(storeId, userObj),
        600,
        "billing-offline-lan",
      );
      if (serial && serial !== "----") return serial;
    } catch {
      /* instant fallback below */
    }
    return claimSerialInstant(storeId, userObj);
  }

  try {
    const serial = await _withTimeout(
      claimNextSerial(storeId, true, userObj),
      BILLING_CLAIM_TIMEOUT_MS,
      "billing-claim",
    );
    if (serial && serial !== "----") return serial;
  } catch (err) {
    console.warn("[serial] billing online claim timeout/fail, using instant path:", err?.message || err);
  }

  try {
    const serial = await claimSerialInstantAsync(storeId, userObj);
    if (serial && serial !== "----") return serial;
  } catch (err) {
    console.warn("[serial] billing instant-async failed:", err?.message || err);
  }

  return claimSerialInstant(storeId, userObj);
};

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════
export default {
  claimNextSerial,
  claimSerialInstant,
  claimSerialInstantAsync,
  claimSerialForBilling,
  markSerialUsed,
  releaseSerialClaim,
  refreshOrdersMaxCache,
  syncSerialFromFirebase,
  resetSerialService,
  clearLocalSerialCache,
  subscribeNextSerial,
  bootstrapNextSerial,
  getPlaceholderSerial,
  getCurrentNextSerial,
  extractSerialNumber,
  checkSerialDuplicate,
  getNextItemSerial,
  resetItemSerialCounter,
  getSerialState,
  repairServerCounter,
  fmt3, fmt4, fmt5, fmt6,
};

// Backward compatibility export
export const claimOfflineSerial = (storeId, user) => {
  // Legacy support - use claimNextSerial with offline flag
  if (!_state.initialized) {
    // Quick init for legacy callers
    const userObj = typeof user === "object" ? user : null;
    _ensureInit(storeId, userObj);
  }
  return _claimOfflineSerial();
};

// Expose debug helpers on window for convenience (manual use only)
if (typeof window !== 'undefined') {
  try {
    window.__aone_serial = window.__aone_serial || {};
    window.__aone_serial.getState = getSerialState;
    window.__aone_serial.repair = repairServerCounter;
    window.__aone_serial.claimNext = (storeId, online, user) => claimNextSerial(storeId, online, user);
  } catch {}
}