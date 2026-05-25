// src/services/authService.js
// ✅ PRODUCTION FINAL v2 - Offline-First Authentication
// ✅ Online + Offline login
// ✅ Password hash caching (secure)
// ✅ 30-day offline validity
// ✅ Auto-sync on network restore
// ✅ Multi-device safe

import { 
  doc, getDoc, setDoc, updateDoc, 
  serverTimestamp,
  collection, query, where, getDocs, limit,
} from './firebase';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { db, auth, isFirebaseReady } from './firebase';
import { ROLES } from '../utils/constants';
import { userHasPermission } from '../utils/rolePermissions';
import { userCanAccessBranch as _userCanAccessBranch } from '../utils/branchAccess';
// Lazy loader for bcryptjs — avoids failing Vite analysis when dependency missing
let _bcrypt = null;
let _bcryptTried = false;
const getBcrypt = async () => {
  if (_bcryptTried) return _bcrypt;
  _bcryptTried = true;
  try {
    const mod = await import('bcryptjs');
    _bcrypt = mod && (mod.default || mod) || null;
  } catch (e) {
    _bcrypt = null;
  }
  return _bcrypt;
};

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════
const OFFLINE_VALIDITY_DAYS = 30;
const USER_CACHE_KEY_PREFIX = 'aone_user_cache_';
const LAST_LOGIN_KEY = 'aone_last_login_user';
const DEVICE_ID_KEY = 'aone_device_id';

// ══════════════════════════════════════════════════════════════
// PASSWORD HASHING (prefer bcrypt, fallback to SHA-256)
// Stored hash format:
//  - bcrypt$<bcrypt-hash>
//  - (legacy) sha256hexstring
// ══════════════════════════════════════════════════════════════
const _sha256 = async (input) => {
  try {
    const subtle = (typeof crypto !== 'undefined' && (crypto.subtle || crypto.webkitSubtle)) ||
      (typeof window !== 'undefined' && window.crypto && (window.crypto.subtle || window.crypto.webkitSubtle));

    if (subtle && typeof subtle.digest === 'function') {
      const data = new TextEncoder().encode(input);
      const hashBuffer = await subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    try {
      const nodeCrypto = await import('crypto');
      if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
        return nodeCrypto.createHash('sha256').update(input).digest('hex');
      }
    } catch (e) {}

    try {
      const shaMod = await import('js-sha256');
      const sha = shaMod && (typeof shaMod.sha256 === 'function'
        ? shaMod.sha256
        : (typeof shaMod.default === 'function' ? shaMod.default : null));
      if (typeof sha === 'function') return sha(input);
    } catch (e) {}

    throw new Error('No SHA-256 implementation available');
  } catch (err) {
    console.error('[auth] sha256 error:', err);
    return null;
  }
};

const _hashPassword = async (password, email) => {
  try {
    const salt = `aone_${email.toLowerCase()}_pos2026`;
    const input = password + salt;

    // Try bcryptjs first (statically imported as `bcryptLib`)
    try {
      const bcrypt = await getBcrypt();
      if (bcrypt && typeof bcrypt.hash === 'function') {
        let hashed;
        if (bcrypt.hash.length >= 3) {
          hashed = await new Promise((res, rej) => bcrypt.hash(input, 10, (err, h) => err ? rej(err) : res(h)));
        } else {
          const maybe = bcrypt.hash(input, 10);
          if (maybe && typeof maybe.then === 'function') hashed = await maybe;
          else if (typeof bcrypt.hashSync === 'function') hashed = bcrypt.hashSync(input, 10);
          else hashed = maybe;
        }
        return `bcrypt$${hashed}`;
      }
    } catch (e) {
      // ignore and fallback to sha256
    }

    // Fallback: SHA-256 hex
    const s = await _sha256(input);
    return s;
  } catch (err) {
    console.error('[auth] hash error:', err);
    return null;
  }
};

const _verifyPassword = async (password, email, storedHash) => {
  try {
    if (!storedHash) return false;
    const salt = `aone_${email.toLowerCase()}_pos2026`;
    const input = password + salt;

    if (storedHash.startsWith('bcrypt$')) {
      const hashPart = storedHash.slice('bcrypt$'.length);
      try {
        const bcrypt = await getBcrypt();
        if (bcrypt && typeof bcrypt.compare === 'function') {
          if (bcrypt.compare.length >= 3) {
            return await new Promise((res, rej) => bcrypt.compare(input, hashPart, (err, ok) => err ? rej(err) : res(!!ok)));
          }
          const maybe = bcrypt.compare(input, hashPart);
          if (maybe && typeof maybe.then === 'function') return await maybe;
          if (typeof bcrypt.compareSync === 'function') return bcrypt.compareSync(input, hashPart);
          return !!maybe;
        }
      } catch (e) {
        // If bcrypt unavailable, fall through to sha compare (will fail)
      }
      return false;
    }

    // Legacy: compare SHA-256 hex
    const newHash = await _sha256(input);
    return newHash === storedHash;
  } catch (err) {
    console.error('[auth] verify error:', err);
    return false;
  }
};

// ══════════════════════════════════════════════════════════════
// DEVICE ID
// ══════════════════════════════════════════════════════════════
const _getDeviceId = () => {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'unknown_device';
  }
};

// ══════════════════════════════════════════════════════════════
// USER CACHE (IndexedDB + localStorage backup)
// ══════════════════════════════════════════════════════════════
const _getIDB = async () => {
  try {
    const { dbPut, dbGet, dbGetAll, dbDelete, STORES } = 
      await import('./indexedDBService');
    return { dbPut, dbGet, dbGetAll, dbDelete, STORES };
  } catch {
    return null;
  }
};

/**
 * Cache user credentials for offline login
 */
const _cacheUserForOffline = async (firebaseUser, userData, password) => {
  try {
    const email = firebaseUser.email.toLowerCase();
    const hashedPassword = await _hashPassword(password, email);
    
    if (!hashedPassword) {
      console.warn('[auth] Cannot cache - hash failed');
      return false;
    }
    
    const cacheData = {
      uid: firebaseUser.uid,
      email: email,
      hashedPassword: hashedPassword,
      displayName: firebaseUser.displayName || userData.name || '',
      photoURL: firebaseUser.photoURL || null,
      
      // User data (everything needed for offline)
      name: userData.name || '',
      role: userData.role || userData.primaryRole || 'biller',
      roles: userData.roles || [userData.role || 'biller'],
      primaryRole: userData.primaryRole || userData.role || 'biller',
      permissions: userData.permissions || {},
      
      // Store info
      storeId: userData.storeId || userData.primaryStore || '',
      storeIds: userData.storeIds || [],
      primaryStore: userData.primaryStore || userData.storeId || '',
      
      // User code
      userCode: userData.userCode || '',
      
      // Status
      isActive: userData.isActive !== false,
      isDeleted: userData.isDeleted === true,
      
      // Cache metadata
      cachedAt: Date.now(),
      validUntil: Date.now() + (OFFLINE_VALIDITY_DAYS * 24 * 60 * 60 * 1000),
      deviceId: _getDeviceId(),
      lastOnlineLogin: Date.now(),
    };
    
    // Save to IndexedDB
    const idb = await _getIDB();
    if (idb) {
      try {
        await idb.dbPut(idb.STORES.USERS, cacheData);
      } catch (err) {
        console.warn('[auth] IDB cache failed:', err.message);
      }
    }
    
    // Backup to localStorage (compact version)
    try {
      const lsData = {
        ...cacheData,
        // Don't store sensitive permissions in localStorage
        permissions: undefined,
      };
      localStorage.setItem(USER_CACHE_KEY_PREFIX + email, JSON.stringify(lsData));
      localStorage.setItem(LAST_LOGIN_KEY, email);
    } catch (err) {
      console.warn('[auth] localStorage cache failed:', err.message);
    }
    
    console.log('[auth] ✅ User cached for offline login:', email);
    return true;
    
  } catch (err) {
    console.error('[auth] Cache error:', err);
    return false;
  }
};

/**
 * Get cached user by email
 */
const _getCachedUser = async (email) => {
  const normalizedEmail = email.toLowerCase().trim();
  
  // Try IndexedDB first
  const idb = await _getIDB();
  if (idb) {
    try {
      const allUsers = await idb.dbGetAll(idb.STORES.USERS);
      const user = allUsers.find(u => u.email === normalizedEmail);
      if (user) return user;
    } catch (err) {
      console.warn('[auth] IDB read failed:', err.message);
    }
  }
  
  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY_PREFIX + normalizedEmail);
    if (raw) return JSON.parse(raw);
  } catch {}
  
  return null;
};

/**
 * Update cached user data (after fetching from Firebase)
 */
const _updateCachedUser = async (uid, updates) => {
  const idb = await _getIDB();
  if (idb) {
    try {
      const existing = await idb.dbGet(idb.STORES.USERS, uid);
      if (existing) {
        await idb.dbPut(idb.STORES.USERS, {
          ...existing,
          ...updates,
          _updatedAt: Date.now(),
        });
      }
    } catch (err) {
      console.warn('[auth] Update cache failed:', err.message);
    }
  }
};

/**
 * Clear cached user
 */
export const clearUserCache = async (email = null) => {
  const idb = await _getIDB();
  
  if (email) {
    const normalizedEmail = email.toLowerCase().trim();
    
    // Clear from IDB
    if (idb) {
      try {
        const allUsers = await idb.dbGetAll(idb.STORES.USERS);
        const user = allUsers.find(u => u.email === normalizedEmail);
        if (user) await idb.dbDelete(idb.STORES.USERS, user.uid);
      } catch {}
    }
    
    // Clear from localStorage
    try {
      localStorage.removeItem(USER_CACHE_KEY_PREFIX + normalizedEmail);
    } catch {}
  } else {
    // Clear all
    if (idb) {
      try {
        const allUsers = await idb.dbGetAll(idb.STORES.USERS);
        for (const u of allUsers) {
          await idb.dbDelete(idb.STORES.USERS, u.uid);
        }
      } catch {}
    }
    
    try {
      const keys = Object.keys(localStorage).filter(k => 
        k.startsWith(USER_CACHE_KEY_PREFIX)
      );
      keys.forEach(k => localStorage.removeItem(k));
      localStorage.removeItem(LAST_LOGIN_KEY);
    } catch {}
  }
};

// ══════════════════════════════════════════════════════════════
// ONLINE LOGIN
// ══════════════════════════════════════════════════════════════
const _onlineLogin = async (email, password) => {
  if (!isFirebaseReady() || !auth || !db) {
    throw new Error('Firebase not initialized');
  }
  
  console.log('[auth] 🌐 Attempting ONLINE login...');
  
  // 1. Firebase Auth
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const firebaseUser = cred.user;
  
  // 2. Fetch user data from Firestore
  const userDocRef = doc(db, 'users', firebaseUser.uid);
  const userDoc = await getDoc(userDocRef);
  
  if (!userDoc.exists()) {
    await firebaseSignOut(auth);
    throw new Error('User record not found in database');
  }
  
  const userData = userDoc.data();
  
  // 3. Check account status
  if (userData.isDeleted === true) {
    await firebaseSignOut(auth);
    throw new Error('This account has been deleted');
  }
  
  if (userData.isActive === false) {
    await firebaseSignOut(auth);
    throw new Error('This account is inactive. Contact admin.');
  }
  
  // 4. Cache for offline login (background, don't wait)
  _cacheUserForOffline(firebaseUser, userData, password).catch(err => 
    console.warn('[auth] Cache failed (non-blocking):', err.message)
  );

  // 4b. Cache ID token locally to avoid refresh attempts when offline
  try {
    const idToken = await firebaseUser.getIdToken();
    try { localStorage.setItem('aone_id_token', idToken); } catch {}

    // Also monkey-patch getIdToken to return cached token when offline
    try {
      if (auth && auth.currentUser && typeof auth.currentUser.getIdToken === 'function') {
        const origGet = auth.currentUser.getIdToken.bind(auth.currentUser);
        auth.currentUser.getIdToken = async (forceRefresh) => {
          if (!navigator.onLine) {
            const cached = localStorage.getItem('aone_id_token');
            if (cached) return cached;
            // fallback: return a rejected promise to avoid SDK trying to refresh
            return Promise.reject(new Error('Offline - no cached token'));
          }
          return origGet(forceRefresh);
        };
      }
    } catch (e) {
      console.warn('[auth] token monkey-patch failed:', e?.message || e);
    }
  } catch (e) {
    // non-fatal
  }
  
  // 5. Update last login (background)
  updateDoc(userDocRef, {
    lastLogin: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    loginCount: (userData.loginCount || 0) + 1,
    lastDeviceId: _getDeviceId(),
    updatedAt: serverTimestamp(),
  }).catch(err => console.warn('[auth] Login meta update failed:', err.message));
  
  console.log('[auth] ✅ ONLINE login successful:', email);
  
  return {
    user: firebaseUser,
    userData: userData,
    mode: 'online',
  };
};

// ══════════════════════════════════════════════════════════════
// OFFLINE LOGIN
// ══════════════════════════════════════════════════════════════
const _offlineLogin = async (email, password) => {
  console.log('[auth] 📡 Attempting OFFLINE login...');
  
  // 1. Get cached user
  const cachedUser = await _getCachedUser(email);
  
  if (!cachedUser) {
    throw new Error(
      'OFFLINE_NO_CACHE'
    );
  }
  
  // 2. Check validity period
  if (cachedUser.validUntil && Date.now() > cachedUser.validUntil) {
    throw new Error(
      'OFFLINE_EXPIRED'
    );
  }
  
  // 3. Check account status
  if (cachedUser.isDeleted === true) {
    throw new Error('This account has been deleted');
  }
  
  if (cachedUser.isActive === false) {
    throw new Error('This account is inactive');
  }
  
  // 4. Verify password
  if (!cachedUser.hashedPassword) {
    throw new Error('OFFLINE_NO_PASSWORD');
  }
  
  const isValid = await _verifyPassword(password, email, cachedUser.hashedPassword);
  
  if (!isValid) {
    throw new Error('Invalid password');
  }
  
  // 5. Create a fake "firebaseUser" object for compatibility
  const fakeFirebaseUser = {
    uid: cachedUser.uid,
    email: cachedUser.email,
    displayName: cachedUser.displayName || cachedUser.name,
    photoURL: cachedUser.photoURL,
    emailVerified: true,
    // Mark as offline
    _offlineLogin: true,
  };
  
  console.log('[auth] ✅ OFFLINE login successful:', email);
  
  return {
    user: fakeFirebaseUser,
    userData: cachedUser,
    mode: 'offline',
  };
};

// ══════════════════════════════════════════════════════════════
// MAIN LOGIN FUNCTION (Smart: Online → Offline fallback)
// ══════════════════════════════════════════════════════════════
export const smartLogin = async (email, password) => {
  if (!email || !password) {
    return {
      success: false,
      error: { code: 'invalid-input', message: 'Email and password required' },
    };
  }
  
  const normalizedEmail = email.toLowerCase().trim();
  const isOnline = navigator.onLine;
  
  // STRATEGY 1: ONLINE LOGIN (if internet available)
  if (isOnline) {
    try {
      const result = await _onlineLogin(normalizedEmail, password);
      return {
        success: true,
        ...result,
      };
    } catch (err) {
      console.warn('[auth] Online login failed, trying offline...', err.code || err.message);
      
      // If it's a network error, try offline
      const isNetworkError = 
        err.code === 'auth/network-request-failed' ||
        err.code === 'unavailable' ||
        err.message?.includes('network') ||
        err.message?.includes('offline');
      
      if (isNetworkError) {
        // Try offline fallback
        try {
          const offlineResult = await _offlineLogin(normalizedEmail, password);
          return {
            success: true,
            ...offlineResult,
            warning: 'Using offline mode - server unreachable',
          };
        } catch (offlineErr) {
          return {
            success: false,
            error: _formatError(offlineErr),
          };
        }
      }
      
      // Other Firebase errors (wrong password, etc.)
      return {
        success: false,
        error: _formatError(err),
      };
    }
  }
  
  // STRATEGY 2: OFFLINE LOGIN (no internet)
  try {
    const result = await _offlineLogin(normalizedEmail, password);
    return {
      success: true,
      ...result,
      warning: 'You are offline - using cached login',
    };
  } catch (err) {
    return {
      success: false,
      error: _formatError(err),
    };
  }
};

// ══════════════════════════════════════════════════════════════
// ERROR FORMATTER
// ══════════════════════════════════════════════════════════════
const _formatError = (err) => {
  const message = err.message || String(err);
  const code = err.code || 'unknown';
  
  // Map Firebase errors to user-friendly messages
  const errorMap = {
    'auth/user-not-found': 'No account found with this email',
    'auth/wrong-password': 'Incorrect password',
    'auth/invalid-credential': 'Invalid email or password',
    'auth/invalid-email': 'Invalid email format',
    'auth/user-disabled': 'This account has been disabled',
    'auth/too-many-requests': 'Too many failed attempts. Try again later',
    'auth/network-request-failed': 'Network error - please check internet',
    'OFFLINE_NO_CACHE': 'You must login online first to enable offline access',
    'OFFLINE_EXPIRED': `Offline login expired (${OFFLINE_VALIDITY_DAYS} days). Please login online to refresh`,
    'OFFLINE_NO_PASSWORD': 'Password not cached. Please login online first',
  };
  
  const friendlyMessage = errorMap[code] || errorMap[message] || message;
  
  return {
    code,
    message: friendlyMessage,
    raw: err,
  };
};

// ══════════════════════════════════════════════════════════════
// SYNC USER DATA (when internet returns)
// ══════════════════════════════════════════════════════════════
export const syncUserDataOnReconnect = async (uid) => {
  if (!navigator.onLine || !isFirebaseReady() || !db) return;
  
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (!userDoc.exists()) return;
    
    const userData = userDoc.data();
    
    // Update cache
    await _updateCachedUser(uid, {
      ...userData,
      lastSynced: Date.now(),
      validUntil: Date.now() + (OFFLINE_VALIDITY_DAYS * 24 * 60 * 60 * 1000),
    });
    
    console.log('[auth] ✅ User data synced from cloud');
  } catch (err) {
    console.warn('[auth] Sync failed:', err.message);
  }
};

// ══════════════════════════════════════════════════════════════
// CHECK IF USER HAS OFFLINE ACCESS
// ══════════════════════════════════════════════════════════════
export const hasOfflineAccess = async (email) => {
  const cached = await _getCachedUser(email);
  if (!cached) return false;
  if (!cached.hashedPassword) return false;
  if (cached.validUntil && Date.now() > cached.validUntil) return false;
  return true;
};

// ══════════════════════════════════════════════════════════════
// GET LAST LOGIN EMAIL (for UX)
// ══════════════════════════════════════════════════════════════
export const getLastLoginEmail = () => {
  try {
    return localStorage.getItem(LAST_LOGIN_KEY) || '';
  } catch {
    return '';
  }
};

// ══════════════════════════════════════════════════════════════
// LEGACY FUNCTIONS (keep for compatibility)
// ══════════════════════════════════════════════════════════════

export const getCurrentUserData = async () => {
  if (!auth?.currentUser) return null;
  
  try {
    if (!isFirebaseReady() || !db) {
      // Try offline cache
      const cached = await _getCachedUser(auth.currentUser.email || '');
      return cached;
    }
    
    const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
    return userDoc.exists() ? userDoc.data() : null;
  } catch (err) {
    console.error('[auth] getCurrentUserData error:', err);
    // Fallback to cache
    const cached = await _getCachedUser(auth.currentUser.email || '');
    return cached;
  }
};

export const updateUserProfile = async (uid, data) => {
  try {
    if (!isFirebaseReady() || !db) return false;
    
    await updateDoc(doc(db, 'users', uid), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    
    // Update cache too
    await _updateCachedUser(uid, data);
    return true;
  } catch (err) {
    console.error('[auth] updateUserProfile error:', err);
    return false;
  }
};

export const createUser = async (userData) => {
  const { email, password, displayName, role, storeId } = userData;
  
  try {
    if (!isFirebaseReady() || !db) {
      throw new Error('Firebase not configured');
    }
    
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    await updateProfile(user, { displayName });
    
    const userDocRef = doc(db, 'users', user.uid);
    await setDoc(userDocRef, {
      uid: user.uid,
      email: user.email,
      displayName,
      name: displayName,
      role: role || ROLES.BILLER,
      roles: [role || ROLES.BILLER],
      primaryRole: role || ROLES.BILLER,
      storeId: storeId || null,
      storeIds: storeId ? [storeId] : [],
      primaryStore: storeId || '',
      photoURL: user.photoURL || null,
      emailVerified: user.emailVerified,
      isActive: true,
      isDeleted: false,
      loginCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
    
    return { success: true, user };
  } catch (err) {
    console.error('[auth] createUser error:', err);
    return { success: false, error: err.message };
  }
};

export const checkPermission = async (userId, permission) => {
  try {
    const userData = await getCurrentUserData();
    if (!userData) return false;

    if ((userData.role === ROLES.superAdmin || userData.role === ROLES.superadmin) ||
        (userData.roles || []).some((r) => ['superAdmin', 'superadmin', 'super_admin'].includes(r))) {
      return true;
    }

    return Boolean(userHasPermission(userData, permission));
  } catch (err) {
    console.error('[auth] checkPermission error:', err);
    return false;
  }
};

export const logActivity = async (action, metadata = {}) => {
  try {
    if (!navigator.onLine || !isFirebaseReady() || !db || !auth?.currentUser) {
      // Queue for later
      return;
    }
    
    await setDoc(
      doc(db, 'activityLogs', `${Date.now()}_${auth.currentUser.uid}`),
      {
        action,
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email,
        timestamp: serverTimestamp(),
        ...metadata,
      }
    );
  } catch (err) {
    console.error('[auth] logActivity error:', err);
  }
};

// ══════════════════════════════════════════════════════════════
// AUTO-SYNC ON NETWORK RESTORE
// ══════════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (auth?.currentUser) {
      console.log('[auth] 🌐 Network restored, syncing user data...');
      syncUserDataOnReconnect(auth.currentUser.uid);
    }
  });
}

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════
export default {
  smartLogin,
  getCurrentUserData,
  updateUserProfile,
  createUser,
  checkPermission,
  logActivity,
  hasOfflineAccess,
  getLastLoginEmail,
  clearUserCache,
  syncUserDataOnReconnect,
};

/**
 * Check whether the currently signed-in user can access the given branch/store
 */
export const canUserAccessBranch = async (branchId) => {
  try {
    const userData = await getCurrentUserData();
    if (!userData) return false;
    return _userCanAccessBranch(userData, branchId);
  } catch (err) {
    console.error('[auth] canUserAccessBranch error:', err);
    return false;
  }
};

export const getCachedIdToken = () => {
  try {
    return localStorage.getItem('aone_id_token') || null;
  } catch {
    return null;
  }
};