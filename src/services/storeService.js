// src/services/storeService.js
// ✅ PRODUCTION FINAL v2 - With shortCode support
// ✅ Offline-first store/branch management
// ✅ Local cache + Firebase sync
// ✅ NEW: shortCode field for bill serial generation
// ✅ NEW: Validation for shortCode uniqueness
// ✅ Backward compatible with all legacy imports

import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  getDocs, getDoc, serverTimestamp, query, where, limit,
} from './firebase';
import { toast } from 'react-hot-toast';

import { db } from './firebase';
import {
  STORES, dbPut, dbGet, dbGetAll, dbDelete,
  addToSyncQueue, logAction,
} from './indexedDBService';

const TOAST_STYLE = {
  background: '#1a1208', color: '#f5f0e8', border: '1px solid #2a1f0d',
};
const TOAST_SUCCESS = {
  ...TOAST_STYLE, color: '#10b981', border: '1px solid #10b981',
};
const TOAST_ERROR = {
  ...TOAST_STYLE, color: '#ef4444', border: '1px solid #ef4444',
};
const TOAST_WARN = {
  ...TOAST_STYLE, color: '#f59e0b', border: '1px solid #f59e0b',
};

// ═══════════════════════════════════════════════════════════
// SHORTCODE HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Validate shortCode format
 * Must be 2-5 UPPERCASE letters only
 */
export const validateShortCode = (code) => {
  if (!code) return { valid: false, error: 'Short code is required' };
  const normalized = String(code).toUpperCase().trim();
  if (!/^[A-Z]{2,5}$/.test(normalized)) {
    return { 
      valid: false, 
      error: 'Short code must be 2-5 UPPERCASE letters only (A-Z)' 
    };
  }
  return { valid: true, code: normalized };
};

/**
 * Auto-generate shortCode from store name
 * Aone Jewelry → AON
 * Mega Mart → MEG
 */
export const autoGenerateShortCode = (storeName) => {
  if (!storeName) return '';
  const cleaned = String(storeName)
    .toUpperCase()
    .replace(/[^A-Z\s]/g, '')
    .trim();
  
  const words = cleaned.split(/\s+/);
  
  if (words.length >= 2) {
    // Multi-word: first letter of each word
    return words.map(w => w[0]).join('').slice(0, 5);
  } else {
    // Single word: first 3 chars
    return words[0].slice(0, 3);
  }
};

/**
 * Check if shortCode is unique (not used by another store)
 */
export const isShortCodeUnique = async (shortCode, excludeStoreId = null) => {
  const normalized = String(shortCode).toUpperCase().trim();
  
  // Check local cache first (instant)
  try {
    const allStores = await dbGetAll(STORES.STORES_CACHE);
    const conflict = allStores.find(s => 
      s.shortCode === normalized && 
      s.id !== excludeStoreId
    );
    if (conflict) return { unique: false, conflictWith: conflict.name };
  } catch {}
  
  // Check Firebase (if online)
  if (navigator.onLine) {
    try {
      const snap = await getDocs(query(
        collection(db, 'stores'),
        where('shortCode', '==', normalized),
        limit(2)
      ));
      
      const conflict = snap.docs.find(d => d.id !== excludeStoreId);
      if (conflict) {
        return { 
          unique: false, 
          conflictWith: conflict.data().storeName || conflict.data().name 
        };
      }
    } catch (err) {
      console.warn('[storeService] Unique check failed:', err.message);
    }
  }
  
  return { unique: true };
};

/**
 * Check if store has any bills (used to lock shortCode editing)
 */
export const storeHasBills = async (storeId) => {
  if (!storeId || !navigator.onLine) return false;
  
  try {
    const snap = await getDocs(query(
      collection(db, 'orders'),
      where('storeId', '==', storeId),
      limit(1)
    ));
    return !snap.empty;
  } catch {
    return false;
  }
};

// ═══════════════════════════════════════════════════════════
// NORMALIZE STORE DOC (handles storeName + name field variants)
// ═══════════════════════════════════════════════════════════
export const normalizeStore = (store) => {
  if (!store) return null;
  const displayName = store.storeName || store.name || 'Unnamed Branch';
  return {
    ...store,
    id: store.id,
    name: displayName,                              // standardized
    storeName: displayName,                         // backward compat
    shortCode: (store.shortCode || '').toUpperCase(), // ✅ NEW
    location: store.location || '',
    phone: store.phone || '',
    email: store.email || '',
    businessName: store.businessName || '',
    isActive: store.status === 'active' || store.isActive !== false,
    status: store.status || (store.isActive !== false ? 'active' : 'inactive'),
  };
};

// ═══════════════════════════════════════════════════════════
// FETCH STORES — Offline-first
// ═══════════════════════════════════════════════════════════
export const fetchStoresOfflineFirst = async () => {
  // 1. Return local first (instant)
  let local = await dbGetAll(STORES.STORES_CACHE);

  // 2. Background sync if online
  if (navigator.onLine) {
    try {
      const snap = await getDocs(collection(db, 'stores'));
      const fbStores = snap.docs.map((d) =>
        normalizeStore({ id: d.id, ...d.data() })
      );

      // Save Firebase data to local cache
      for (const store of fbStores) {
        await dbPut(STORES.STORES_CACHE, store);
      }

      // Remove deleted (exists in local but not in Firebase)
      const fbIds = new Set(fbStores.map((s) => s.id));
      for (const ls of local) {
        if (!fbIds.has(ls.id) && !ls.id?.startsWith('temp_')) {
          await dbDelete(STORES.STORES_CACHE, ls.id);
        }
      }

      local = await dbGetAll(STORES.STORES_CACHE);
    } catch (err) {
      console.warn('[storeService] background fetch:', err.message);
    }
  }

  return local.map(normalizeStore);
};

// ═══════════════════════════════════════════════════════════
// GET STORE BY ID (Offline-first)
// ═══════════════════════════════════════════════════════════
const _storeAliasKeys = (store) => {
  if (!store) return [];
  return [
    store.id,
    store.shortCode,
    store.storeCode,
    store.branchCode,
    store.code,
    store.legacyId,
    store.branchName,
    store.storeName,
    store.name,
  ].filter(Boolean).map((k) => String(k).trim());
};

/** Match Firebase doc id OR legacy code (JM-1, JMJ, etc.). */
export const findStoreByAnyKey = (storeKey, rows = []) => {
  const key = String(storeKey || '').trim();
  if (!key) return null;
  const byId = rows.find((s) => s?.id === key);
  if (byId) return byId;
  const upper = key.toUpperCase();
  return rows.find((s) => _storeAliasKeys(s).some((k) => k === key || k.toUpperCase() === upper)) || null;
};

export const getStoreById = async (storeId) => {
  if (!storeId) return null;

  // 1. Local cache — direct id
  const local = await dbGet(STORES.STORES_CACHE, storeId);
  if (local) return normalizeStore(local);

  // 2. Local cache — alias (JM-1, shortCode, etc.)
  const allLocal = await dbGetAll(STORES.STORES_CACHE);
  const aliasHit = findStoreByAnyKey(storeId, allLocal);
  if (aliasHit) return normalizeStore(aliasHit);

  // 3. Firebase fallback
  if (navigator.onLine) {
    try {
      const snap = await getDoc(doc(db, 'stores', storeId));
      if (snap.exists()) {
        const store = normalizeStore({ id: snap.id, ...snap.data() });
        await dbPut(STORES.STORES_CACHE, store);
        return store;
      }
      const fbSnap = await getDocs(collection(db, 'stores'));
      const fbRows = fbSnap.docs.map((d) => normalizeStore({ id: d.id, ...d.data() }));
      const fbHit = findStoreByAnyKey(storeId, fbRows);
      if (fbHit) {
        await dbPut(STORES.STORES_CACHE, fbHit);
        return fbHit;
      }
    } catch (err) {
      console.warn('[storeService] getStoreById:', err.message);
    }
  }

  return null;
};

// ═══════════════════════════════════════════════════════════
// CREATE STORE - With shortCode
// ═══════════════════════════════════════════════════════════
export const createStore = async (storeData, currentAdmin) => {
  let toastId = toast.loading('💾 Saving locally...', { style: TOAST_STYLE });

  try {
    // ✅ NEW: Validate shortCode
    const codeValidation = validateShortCode(storeData.shortCode);
    if (!codeValidation.valid) {
      toast.error(`❌ ${codeValidation.error}`, { 
        id: toastId, style: TOAST_ERROR 
      });
      return { success: false, error: codeValidation.error };
    }
    
    // ✅ NEW: Check uniqueness
    const uniqueness = await isShortCodeUnique(codeValidation.code);
    if (!uniqueness.unique) {
      const msg = `Short code "${codeValidation.code}" already used by "${uniqueness.conflictWith}"`;
      toast.error(`❌ ${msg}`, { id: toastId, style: TOAST_ERROR });
      return { success: false, error: msg };
    }

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const baseDoc = {
      id: tempId,
      storeName: storeData.storeName || storeData.name || '',
      name: storeData.storeName || storeData.name || '',
      shortCode: codeValidation.code,                    // ✅ NEW
      location: storeData.location || '',
      phone: storeData.phone || '',
      email: storeData.email || '',
      businessName: storeData.businessName || '',
      status: storeData.isActive !== false ? 'active' : 'inactive',
      isActive: storeData.isActive !== false,
      createdBy: currentAdmin?.uid || 'system',
    };

    // 1. LOCAL FIRST
    await dbPut(STORES.STORES_CACHE, { ...baseDoc, _syncStatus: 'pending' });
    toast.success('✅ Saved locally', {
      id: toastId, duration: 1500, style: TOAST_SUCCESS,
    });

    // 2. Sync queue
    const queueId = await addToSyncQueue({
      type: 'create_store',
      operation: 'add',
      collection: 'stores',
      data: baseDoc,
      priority: 2,
    });

    // 3. FIREBASE
    if (!navigator.onLine) {
      toast('📡 Offline — will sync when online', {
        icon: '⏳', style: TOAST_WARN,
      });
      return { success: true, id: tempId, syncedToCloud: false };
    }

    toastId = toast.loading('☁️ Syncing to cloud...', { style: TOAST_STYLE });

    try {
      const docRef = doc(collection(db, 'stores'));
      await setDoc(docRef, {
        storeName: baseDoc.storeName,
        shortCode: baseDoc.shortCode,                    // ✅ NEW
        location: baseDoc.location,
        phone: baseDoc.phone,
        email: baseDoc.email,
        businessName: baseDoc.businessName,
        status: baseDoc.status,
        createdBy: currentAdmin?.uid || 'system',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Update local with real Firebase ID
      await dbDelete(STORES.STORES_CACHE, tempId);
      await dbPut(STORES.STORES_CACHE, {
        ...baseDoc,
        id: docRef.id,
        _syncStatus: 'synced',
        _syncedAt: Date.now(),
      });
      if (queueId) await dbDelete(STORES.SYNC_QUEUE, queueId);

      await logAction('store_created', {
        id: docRef.id, 
        name: baseDoc.storeName,
        shortCode: baseDoc.shortCode,
      });

      toast.success(`☁️ Branch "${baseDoc.storeName}" (${baseDoc.shortCode}) synced`, {
        id: toastId, duration: 2500, style: TOAST_SUCCESS,
      });

      return { 
        success: true, 
        id: docRef.id, 
        shortCode: baseDoc.shortCode,
        syncedToCloud: true 
      };
    } catch (fbErr) {
      toast.error(`⚠️ Cloud sync failed — local saved\n${fbErr.message}`, {
        id: toastId, duration: 4000, style: TOAST_WARN,
      });
      return { success: true, id: tempId, syncedToCloud: false };
    }
  } catch (err) {
    toast.error(`❌ ${err.message}`, { id: toastId, style: TOAST_ERROR });
    return { success: false, error: err.message };
  }
};

// ═══════════════════════════════════════════════════════════
// UPDATE STORE - With shortCode (locked if bills exist)
// ═══════════════════════════════════════════════════════════
export const updateStore = async (storeId, storeData, currentAdmin) => {
  let toastId = toast.loading('💾 Updating locally...', { style: TOAST_STYLE });

  try {
    // Get existing store
    const existing = await dbGet(STORES.STORES_CACHE, storeId);
    
    // ✅ NEW: Handle shortCode validation
    let finalShortCode = existing?.shortCode || '';
    
    if (storeData.shortCode) {
      // Check if shortCode is changing
      const newCode = String(storeData.shortCode).toUpperCase().trim();
      const oldCode = String(existing?.shortCode || '').toUpperCase().trim();
      
      if (newCode !== oldCode) {
        // Validate new code
        const codeValidation = validateShortCode(newCode);
        if (!codeValidation.valid) {
          toast.error(`❌ ${codeValidation.error}`, { 
            id: toastId, style: TOAST_ERROR 
          });
          return { success: false, error: codeValidation.error };
        }
        
        // Check if store has bills (lock shortCode if yes)
        const hasBills = await storeHasBills(storeId);
        if (hasBills) {
          const msg = 'Cannot change short code - bills already exist with current code';
          toast.error(`🔒 ${msg}`, { id: toastId, style: TOAST_ERROR });
          return { success: false, error: msg };
        }
        
        // Check uniqueness
        const uniqueness = await isShortCodeUnique(newCode, storeId);
        if (!uniqueness.unique) {
          const msg = `Short code "${newCode}" already used by "${uniqueness.conflictWith}"`;
          toast.error(`❌ ${msg}`, { id: toastId, style: TOAST_ERROR });
          return { success: false, error: msg };
        }
        
        finalShortCode = codeValidation.code;
      }
    }

    const updateData = {
      storeName: storeData.storeName || storeData.name || '',
      name: storeData.storeName || storeData.name || '',
      shortCode: finalShortCode,                       // ✅ NEW
      location: storeData.location || '',
      phone: storeData.phone || '',
      email: storeData.email || '',
      businessName: storeData.businessName || '',
      status: storeData.isActive !== false ? 'active' : 'inactive',
      isActive: storeData.isActive !== false,
    };

    // 1. LOCAL FIRST
    await dbPut(STORES.STORES_CACHE, {
      ...existing, ...updateData,
      id: storeId, _syncStatus: 'pending',
    });
    toast.success('✅ Updated locally', {
      id: toastId, duration: 1500, style: TOAST_SUCCESS,
    });

    // 2. Sync queue
    const queueId = await addToSyncQueue({
      type: 'update_store',
      operation: 'update',
      collection: 'stores',
      docId: storeId,
      data: updateData,
      priority: 2,
    });

    // 3. FIREBASE
    if (!navigator.onLine) {
      toast('📡 Offline — will sync when online', {
        icon: '⏳', style: TOAST_WARN,
      });
      return { success: true, syncedToCloud: false };
    }

    toastId = toast.loading('☁️ Syncing...', { style: TOAST_STYLE });

    try {
      await updateDoc(doc(db, 'stores', storeId), {
        ...updateData,
        updatedAt: serverTimestamp(),
      });
      const u = await dbGet(STORES.STORES_CACHE, storeId);
      await dbPut(STORES.STORES_CACHE, {
        ...u, _syncStatus: 'synced', _syncedAt: Date.now(),
      });
      if (queueId) await dbDelete(STORES.SYNC_QUEUE, queueId);

      toast.success('☁️ Synced to cloud', {
        id: toastId, duration: 2000, style: TOAST_SUCCESS,
      });
      return { success: true, syncedToCloud: true };
    } catch (fbErr) {
      toast.error(`⚠️ Cloud sync failed — will retry`, {
        id: toastId, style: TOAST_WARN,
      });
      return { success: true, syncedToCloud: false };
    }
  } catch (err) {
    toast.error(`❌ ${err.message}`, { id: toastId, style: TOAST_ERROR });
    return { success: false, error: err.message };
  }
};

// ═══════════════════════════════════════════════════════════
// DELETE STORE — SUPERADMIN ONLY
// ═══════════════════════════════════════════════════════════
export const deleteStoreById = async (storeId, currentAdmin) => {
  const roles = currentAdmin?.roles || (currentAdmin?.role ? [currentAdmin.role] : []);
  const isSuper = roles.includes('superAdmin') || roles.includes('superadmin');

  if (!isSuper) {
    toast.error('🚫 Only Super Admin can delete branches', { style: TOAST_ERROR });
    return { success: false, error: 'Permission denied' };
  }

  if (!navigator.onLine) {
    toast.error('📡 Offline — cannot delete branches', { style: TOAST_WARN });
    return { success: false, error: 'Offline' };
  }

  // ✅ NEW: Check if store has bills before deletion
  const hasBills = await storeHasBills(storeId);
  if (hasBills) {
    toast.error('🔒 Cannot delete - this branch has bills. Please contact admin.', { 
      style: TOAST_ERROR 
    });
    return { success: false, error: 'Store has bills, cannot delete' };
  }

  let toastId = toast.loading('🗑️ Deleting from cloud...', { style: TOAST_STYLE });

  try {
    // 1. Firebase first
    await deleteDoc(doc(db, 'stores', storeId));

    // 2. Then local
    await dbDelete(STORES.STORES_CACHE, storeId);
    await logAction('store_deleted', { id: storeId, by: currentAdmin?.uid });

    toast.success('🗑️ Branch permanently deleted', {
      id: toastId, duration: 2500, style: TOAST_SUCCESS,
    });
    return { success: true };
  } catch (err) {
    toast.error(`❌ ${err.message}\n💾 Local preserved`, {
      id: toastId, style: TOAST_ERROR,
    });
    return { success: false, error: err.message };
  }
};

// ═══════════════════════════════════════════════════════════
// BACKWARD COMPATIBILITY ALIASES
// ═══════════════════════════════════════════════════════════
export const getAllStores = fetchStoresOfflineFirst;
export const fetchStores = fetchStoresOfflineFirst;
export const getStores = fetchStoresOfflineFirst;
export const deleteStore = deleteStoreById;
export const addStore = createStore;

export default {
  // New API
  fetchStoresOfflineFirst,
  createStore,
  updateStore,
  deleteStoreById,
  getStoreById,
  normalizeStore,
  // ✅ NEW shortCode helpers
  validateShortCode,
  autoGenerateShortCode,
  isShortCodeUnique,
  storeHasBills,
  // Legacy aliases
  getAllStores,
  fetchStores,
  getStores,
  deleteStore,
  addStore,
};