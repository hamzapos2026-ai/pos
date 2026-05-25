// src/services/serialService.js
// ✅ PRODUCTION FINAL v21 - Global Lifetime Counter + Auto-Setup
// ✅ Format: AON-BIL-170526-000001 (STORE-BIL-DDMMYY-000001)
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
import { buildBillSerial, pad6, getShortDatePK, getDeviceId } from "../utils/billIdGenerator";

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════
const GLOBAL_COUNTER_PATH = "globalCounters/billSerial";
const STORE_CACHE_KEY = (sid) => `pos_store_${sid}`;
const LOCAL_COUNTER_KEY = "pos_global_serial_counter";
const PENDING_BILLS_KEY = "pos_pending_serials";
const STORE_CACHE_MS = 5 * 60 * 1000; // 5 min
const MAX_RETRY = 5;

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
  storeCode: null,         // From SuperAdmin (AON, MEG, etc.)
  
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

const _savePendingBill = (serial, counter, storeCode) => {
  try {
    const raw = localStorage.getItem(PENDING_BILLS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.push({ serial, counter, storeCode, timestamp: Date.now() });
    localStorage.setItem(PENDING_BILLS_KEY, JSON.stringify(list.slice(-100)));
  } catch {}
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

// ══════════════════════════════════════════════════════════════
// STORE FETCH (with caching)
// ══════════════════════════════════════════════════════════════
const _fetchStore = async (storeId) => {
  if (!storeId) return null;
  
  // Try cache first (instant)
  try {
    const raw = localStorage.getItem(STORE_CACHE_KEY(storeId));
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached._cachedAt && Date.now() - cached._cachedAt < STORE_CACHE_MS) {
        return cached;
      }
    }
  } catch {}
  
  // Fetch from Firebase if online
  if (!navigator.onLine) {
    // Try stale cache
    try {
      const raw = localStorage.getItem(STORE_CACHE_KEY(storeId));
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }
  
  try {
    const snap = await getDoc(doc(db, "stores", storeId));
    if (!snap.exists()) return null;
    
    const storeData = {
      id: snap.id,
      ...snap.data(),
      _cachedAt: Date.now(),
    };
    
    try {
      localStorage.setItem(STORE_CACHE_KEY(storeId), JSON.stringify(storeData));
    } catch {}
    
    return storeData;
  } catch (err) {
    console.warn("[serial] fetchStore failed:", err.message);
    return null;
  }
};

/**
 * Extract storeCode from store data
 * Priority: shortCode → first 3 letters of name
 */
const _extractStoreCode = (store) => {
  if (!store) return "XXX";
  
  // ✅ Priority 1: shortCode field from SuperAdmin
  if (store.shortCode && /^[A-Z]{2,5}$/i.test(store.shortCode)) {
    return store.shortCode.toUpperCase();
  }
  
  // Priority 2: Fallback to first letters of name
  const name = store.storeName || store.name || "";
  const code = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  if (code.length >= 2) return code.padEnd(3, code[0]);
  
  return "XXX";
};

/**
 * Extract userCode from user data
 */
const _extractUserCode = (user) => {
  if (!user) return null;
  return user.userCode || user.posCode || null;
};

// ══════════════════════════════════════════════════════════════
// EXTRACT SERIAL NUMBER from string like "AON-BIL-160526-000006"
// ══════════════════════════════════════════════════════════════
export const extractSerialNumber = (serial) => {
  if (!serial) return 0;
  if (typeof serial === "number") return serial;
  
  const s = String(serial).trim();
  if (!s) return 0;
  
  // Get last segment after last dash
  const parts = s.split("-");
  const last = parts[parts.length - 1];
  const n = parseInt(last, 10);
  
  return isNaN(n) ? 0 : n;
};

// ==============================================================
// FIREBASE: Get global counter (auto-creates document if missing)
// ✅ Auto-creates globalCounters/billSerial with ALL required fields
// ✅ Back-fills missing fields in existing documents
// ==============================================================
const _fetchServerCounter = async () => {
  if (!navigator.onLine) return _state.serverCounter;

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

    return Number(data.lastNumber) || 0;
  } catch (err) {
    console.warn("[serial] fetchServerCounter failed:", err.message);
    return _state.serverCounter;
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
        const newSerial = buildBillSerial(_state.storeCode || "XXX", newNumber);

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

  if (!navigator.onLine) return;

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

        // Log when another user/device updates the counter
        if (serverCounter > _state.serverCounter) {
          console.log(
            `[serial] 🔔 Real-time update: ${_state.serverCounter} → ${serverCounter}`,
            `| by: ${data.lastUpdatedBy || '?'} | store: ${data.lastStoreCode || '?'}`
          );
        }

        // Update local if server is ahead
        if (serverCounter > _state.serverCounter) {
          _state.serverCounter = serverCounter;

          // Update local counter if no pending offline bills
          if (_state.pendingOffline === 0 && serverCounter > _state.localCounter) {
            _state.localCounter = serverCounter;
            _saveLocalCounter(serverCounter);
            _broadcast(serverCounter);
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

// ══════════════════════════════════════════════════════════════
// SUBSCRIBERS (UI updates)
// ══════════════════════════════════════════════════════════════
const _notifySubscribers = () => {
  if (!_subscribers.size) return;
  
  const next = _state.localCounter + 1;
  const serial = _state.storeCode 
    ? buildBillSerial(_state.storeCode, next)
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
  
  if (_state.initialized) {
    _notifySubscribers();
  } else {
    cb({ serial: null, counter: null, ready: false });
  }
  
  return () => _subscribers.delete(cb);
};

// ══════════════════════════════════════════════════════════════
// INIT - Load state on login or store change
// ✅ FIXED: Always fetch from server first, then use max(server, local)
// ══════════════════════════════════════════════════════════════
const _init = async (storeId, user) => {
  console.log("[serial] 🔄 Initializing...", { storeId, userId: user?.uid });
  
  // 1. Fetch store data
  const store = await _fetchStore(storeId);
  
  if (!store) {
    console.warn("[serial] ⚠️ Store not found, using fallback");
  }
  
  // 2. Extract codes
  const storeCode = _extractStoreCode(store);
  const userCode = _extractUserCode(user);
  
  _state.storeId = storeId;
  _state.storeCode = storeCode;
  _state.userId = user?.uid || null;
  _state.userCode = userCode;
  _state.userName = user?.name || user?.displayName || "Unknown";
  
  // 3. ✅ ALWAYS fetch server counter first (multi-user sync)
  let serverCounter = 0;
  if (navigator.onLine) {
    try {
      serverCounter = await _fetchServerCounter();
      // If serverCounter looks stale (e.g. 0) try a safe repair using lastSerial
      _state.serverCounter = serverCounter;
      try {
        if ((serverCounter || 0) < 1) {
          const repairRes = await repairServerCounter();
          if (repairRes && repairRes.repaired) {
            // Re-fetch after repair
            serverCounter = await _fetchServerCounter();
            _state.serverCounter = serverCounter;
            console.log('[serial] repair applied, new serverCounter:', serverCounter);
          }
        }
      } catch (repairErr) {
        console.warn('[serial] repair attempt failed:', repairErr?.message || repairErr);
      }
      _state.lastServerSync = Date.now();
      console.log("[serial] 📡 Fetched server counter:", serverCounter);
    } catch (err) {
      console.warn("[serial] Server fetch failed:", err.message);
      // Fallback to last known server counter
      serverCounter = _state.serverCounter || 0;
    }
  }
  
  // 4. Load local counter as backup
  const localCounter = _loadLocalCounter();
  
  // 5. Count pending offline bills
  const pendingBills = _getPendingBills();
  _state.pendingOffline = pendingBills.length;
  
  // 6. ✅ Use the MAXIMUM across all sources to prevent regression
  // This ensures:
  // - Multi-user sessions see consistent counter
  // - Offline bills are accounted for
  // - No serial number goes backwards
  const maxCounter = Math.max(
    serverCounter || 0,
    localCounter || 0,
    _state.localCounter || 0
  );
  
  _state.localCounter = maxCounter;
  _state.serverCounter = maxCounter;
  
  // Save updated counter locally
  _saveLocalCounter(maxCounter);
  
  _state.initialized = true;
  
  // 7. Setup live listener
  if (navigator.onLine) {
    _setupLiveListener();
  }
  
  _notifySubscribers();
  
  console.log("[serial] ✅ Ready", {
    storeCode: _state.storeCode,
    localCounter: _state.localCounter,
    serverCounter: _state.serverCounter,
    pendingOffline: _state.pendingOffline,
    nextSerial: buildBillSerial(_state.storeCode, _state.localCounter + 1),
  });
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
export const claimNextSerial = async (storeId, isOnline = navigator.onLine, user = null) => {
  if (!storeId) {
    throw new Error("storeId is required to claim serial");
  }
  
  const userObj = typeof user === "object" ? user : null;
  
  // Ensure initialized
  await _ensureInit(storeId, userObj);
  
  if (!_state.storeCode) {
    throw new Error("Store code not configured. Contact SuperAdmin to set shortCode.");
  }
  
  // OFFLINE FLOW
  if (!isOnline || !navigator.onLine) {
    return _claimOfflineSerial();
  }
  
  // ONLINE FLOW with atomic transaction
  await _acquireLock();
  
  try {
    // Sync pending offline bills first if any
    if (_state.pendingOffline > 0) {
      await _syncPendingBills();
    }
    
    // Atomic increment
    const { startNumber } = await _atomicIncrementCounter(1);
    
    _state.localCounter = startNumber;
    _state.serverCounter = startNumber;
    _saveLocalCounter(startNumber);
    
    const serial = buildBillSerial(_state.storeCode, startNumber);
    
    _broadcast(startNumber);
    _notifySubscribers();
    
    console.log(`[serial] ✅ ONLINE CLAIMED: ${serial}`);
    return serial;
    
  } catch (err) {
    console.error("[serial] Online claim failed, falling back to offline:", err.message);
    return _claimOfflineSerial();
  } finally {
    _releaseLock();
  }
};

// ══════════════════════════════════════════════════════════════
// OFFLINE CLAIM
// ══════════════════════════════════════════════════════════════
const _claimOfflineSerial = () => {
  // Use MAX of (local counter, server counter) + offline pending count
  const base = Math.max(_state.localCounter, _state.serverCounter);
  const nextNumber = base + 1;
  
  _state.localCounter = nextNumber;
  _state.pendingOffline += 1;
  
  _saveLocalCounter(nextNumber);
  
  const serial = buildBillSerial(_state.storeCode, nextNumber);
  
  // Save to pending for later sync
  _savePendingBill(serial, nextNumber, _state.storeCode);
  
  _broadcast(nextNumber);
  _notifySubscribers();
  
  console.log(`[serial] 📡 OFFLINE CLAIMED: ${serial} (pending: ${_state.pendingOffline})`);
  return serial;
};

// ══════════════════════════════════════════════════════════════
// SYNC PENDING OFFLINE BILLS (when online comes back)
// ══════════════════════════════════════════════════════════════
const _syncPendingBills = async () => {
  if (!navigator.onLine) return;
  
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
      
      // Map old serials to new serials
      const reassignMap = new Map();
      reassignments.forEach((bill, idx) => {
        const newNumber = startNumber + idx;
        const newSerial = buildBillSerial(_state.storeCode, newNumber);
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
  if (num > _state.localCounter) {
    _state.localCounter = num;
    _saveLocalCounter(num);
  }
};

// ══════════════════════════════════════════════════════════════
// GET PLACEHOLDER (preview before claim)
// ══════════════════════════════════════════════════════════════
export const getPlaceholderSerial = (storeId, user = null) => {
  if (!_state.storeCode) return null;
  return buildBillSerial(_state.storeCode, _state.localCounter + 1);
};

export const getCurrentNextSerial = () => {
  if (!_state.initialized || !_state.storeCode) return null;
  return buildBillSerial(_state.storeCode, _state.localCounter + 1);
};

// ══════════════════════════════════════════════════════════════
// FORCE SYNC FROM FIREBASE
// ══════════════════════════════════════════════════════════════
export const syncSerialFromFirebase = async (storeId, user = null) => {
  if (!storeId) return 0;
  
  const userObj = typeof user === "object" ? user : null;
  
  // Reset and reinitialize
  _state.initialized = false;
  await _init(storeId, userObj);
  
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
  if (!serial || !navigator.onLine) return false;
  
  try {
    const snap = await getDocs(query(
      collection(db, "orders"),
      where("billSerial", "==", serial),
      limit(1),
    ));
    return !snap.empty;
  } catch {
    return false;
  }
};

// ══════════════════════════════════════════════════════════════
// GET STATE (for debugging)
// ══════════════════════════════════════════════════════════════
export const getSerialState = () => ({
  ..._state,
  deviceId: getDeviceId(),
  nextSerial: _state.storeCode 
    ? buildBillSerial(_state.storeCode, _state.localCounter + 1)
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
// EXPORTS
// ══════════════════════════════════════════════════════════════
export default {
  claimNextSerial,
  markSerialUsed,
  syncSerialFromFirebase,
  resetSerialService,
  clearLocalSerialCache,
  subscribeNextSerial,
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