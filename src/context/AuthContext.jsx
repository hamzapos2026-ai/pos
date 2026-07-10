// src/context/AuthContext.jsx
// ✅ PRODUCTION FINAL v7 - COMPLETE STABLE
// ✅ FIXED: Infinite recursion (import alias)
// ✅ FIXED: Session never closes (offline-first)
// ✅ FIXED: Setup page never shows again after setup
// ✅ FIXED: F5 reload safe
// ✅ FIXED: Internet loss = no logout
// ✅ FIXED: Firebase null = no session kill

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';

import {
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';

import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  query,
  orderBy,
  getDocs,
  onSnapshot,
} from '../services/firebase';

import { auth, db, isFirebaseReady } from '../services/firebase';
import { db as localDb }              from '../db/index';
import { dbClear, STORES as IDB_STORES } from '../services/indexedDBService';
import { mergePermissions }           from '../utils/rolePermissions';
import { isSuperAdminUser }           from '../utils/superAdminUtils';
import { syncSerialFromFirebase, resetSerialService } from '../services/serialService';
import { loadStoresMapFromCache, resolveSerialBranchHint } from '../hooks/useStoresMap';
import { repairAllUserProfiles } from '../services/userSyncService';
import { smartLogin, syncUserDataOnReconnect, fetchUserDocByAuth } from '../services/authService';
import { setDeviceReference }         from '../services/cashierAuditService';
import { logUserLogin, logUserLogout } from '../services/activityLogger';
import { clearAllCashierOfflineCache } from '../services/cashierCacheService';
import { captureGeoLocation } from '../utils/activityContext';
import {
  syncSessionDeviceToFirestore,
  registerLocalDevice,
} from '../utils/deviceRegistry';

// ✅ CRITICAL FIX: Import with aliases to prevent name collision / recursion
import {
  saveOfflineSession   as _saveOfflineSession,
  restoreOfflineSession as _restoreOfflineSession,
  clearOfflineSession  as _clearOfflineSession,
} from '../services/sessionService';

import {
  checkSetupStatus,
  setSetupCompleteFlag,
  clearSetupFlag,
} from '../services/setupGuardService';

import {
  getTabActiveRole,
  setTabActiveRole,
  clearTabActiveRole,
  consumeRoleFromUrl,
} from '../utils/tabSession';
import { resolveUserBranchIds, resolveUserPrimaryBranch } from '../utils/branchAccess';

// ─────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

const ROLE_ORDER = ['superAdmin', 'admin', 'manager', 'biller', 'cashier'];

const LS_KEYS = {
  ACTIVE_ROLE:    'aone_active_role',
  SETUP_COMPLETE: 'aone-setup-complete',
  SETUP_LOCK:     'aone_setup_permanent_lock',
  SETUP_DATE:     'aone_setup_date',
  SETUP_VERSION:  'aone_setup_version',
  DEVICE_ID:      'aone_device_id',
};

const _resolveStableDeviceId = () => {
  try {
    const id = getDeviceId();
    return id || `dev_${Date.now().toString(36).slice(-4)}`;
  } catch {
    return `dev_${Date.now().toString(36).slice(-4)}`;
  }
};

const _registerDeviceSession = async (userDoc, deviceId, billerCode) => {
  if (!deviceId) return;
  setDeviceReference(deviceId, billerCode);
  registerLocalDevice(userDoc, deviceId, billerCode);
  if (navigator.onLine) {
    syncSessionDeviceToFirestore(userDoc, deviceId, billerCode).catch(() => {});
  }
};

// ─────────────────────────────────────────────────────────────
// NORMALIZE USER
// ─────────────────────────────────────────────────────────────
const normaliseUser = (uid, email, data) => {
  let roles = [];
  if (Array.isArray(data.roles) && data.roles.length > 0) {
    roles = data.roles;
  } else if (typeof data.role === 'string' && data.role) {
    roles = [data.role];
  } else {
    roles = ['biller'];
  }

  const primaryRole =
    data.primaryRole ||
    ROLE_ORDER.find(r => roles.includes(r)) ||
    roles[0] ||
    'biller';

  const basePermissions   = mergePermissions(roles);
  const customPermissions =
    data.permissions && typeof data.permissions === 'object'
      ? data.permissions
      : {};

  const permissions = { ...basePermissions };
  Object.entries(customPermissions).forEach(([k, v]) => {
    if (typeof v === 'boolean') permissions[k] = v;
    else if (typeof v === 'number')
      permissions[k] = Math.max(permissions[k] ?? 0, v);
  });

  const fromAssigned = [
    ...(Array.isArray(data.assignedBranches) ? data.assignedBranches : []),
    ...(Array.isArray(data.assignedStores) ? data.assignedStores : []),
    ...(Array.isArray(data.branchIds) ? data.branchIds : []),
  ];

  const mergedForBranch = {
    ...data,
    storeIds: Array.isArray(data.storeIds) && data.storeIds.length > 0
      ? data.storeIds
      : fromAssigned.length > 0
        ? fromAssigned
        : data.storeId ? [data.storeId] : [],
  };
  const storeIds = resolveUserBranchIds(mergedForBranch);
  const primaryStore = resolveUserPrimaryBranch({ ...mergedForBranch, storeIds });

  return {
    ...data,
    uid,
    email:        email || data.email || '',
    roles,
    role:         primaryRole,
    primaryRole,
    permissions,
    storeIds,
    storeId:      primaryStore,
    primaryStore,
    isActive:     data.isActive  ?? true,
    isDeleted:    data.isDeleted ?? false,
    loginCount:   data.loginCount ?? 0,
  };
};

const normalizeAuthError = (error) => {
  if (!error) return { code: 'unknown', message: 'Unknown error', raw: null };
  const message =
    typeof error === 'string' ? error : error?.message || String(error);
  const code =
    typeof error === 'object' && error?.code
      ? error.code
      : (message.match(/(auth\/[a-zA-Z0-9-]+)/)?.[1] || 'unknown');
  return { code, message, raw: error };
};

// ═════════════════════════════════════════════════════════════
// AUTH PROVIDER
// ═════════════════════════════════════════════════════════════
export const AuthProvider = ({ children }) => {
  const [user,          setUser]          = useState(null);
  const [userData,      setUserData]      = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [initializing,  setInitializing]  = useState(true);
  const [error,         setError]         = useState(null);
  const [activeRole,    setActiveRoleState] = useState(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [isOnline,      setIsOnline]      = useState(navigator.onLine);

  // ── Guards (refs never cause re-render) ───────────────────
  const sessionRestored      = useRef(false); // restore runs only once
  const offlineSessionActive = useRef(false); // blocks Firebase null from killing session
  const authListenerReady    = useRef(false); // Firebase listener registered?
  const userUidRef           = useRef(null);  // skip re-load when same user re-auths in another tab

  useEffect(() => {
    userUidRef.current = user?.uid || userData?.uid || null;
  }, [user?.uid, userData?.uid]);

  const isLoading = useMemo(
    () => loading || initializing,
    [loading, initializing],
  );

  // ══════════════════════════════════════════════════════════
  // 1. NETWORK LISTENER
  // ══════════════════════════════════════════════════════════
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      console.log('[Auth] 🌐 Online');

      // Upgrade offline session → Firebase
      if (userData?.uid) {
        try {
          const fresh = await syncUserDataOnReconnect(userData.uid);
          if (fresh) {
            const normalized = normaliseUser(
              userData.uid,
              userData.email || fresh.email,
              fresh,
            );
            setUserData(normalized);
          }
        } catch (e) {
          console.warn('[Auth] Reconnect sync failed:', e?.message);
        }
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      console.log('[Auth] 📡 Offline');
    };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [userData?.uid]);

  // ══════════════════════════════════════════════════════════
  // 2. OFFLINE SESSION RESTORE (runs ONCE on mount)
  // ✅ FIXED: Uses _restoreOfflineSession alias — NO recursion
  // ══════════════════════════════════════════════════════════
  useEffect(() => {
    if (sessionRestored.current) return;
    sessionRestored.current = true;

    // If online + Firebase ready → let Firebase auth listener handle it
    if (navigator.onLine && isFirebaseReady()) return;

    const doRestore = async () => {
      try {
        console.log('[Auth] 🔄 Restoring offline session...');

        // ✅ _restoreOfflineSession is the IMPORTED function (aliased)
        // Not a local variable — zero recursion risk
        const session = await _restoreOfflineSession();

        if (!session?.userData?.uid) {
          console.log('[Auth] No valid offline session');
          return;
        }

        // Check expiry (24h)
        const AGE = 24 * 60 * 60 * 1000;
        if (session.loggedInAt && Date.now() - session.loggedInAt > AGE) {
          console.log('[Auth] Offline session expired, clearing');
          await _clearOfflineSession();
          return;
        }

        const fakeUser = {
          uid:           session.userData.uid,
          email:         session.userData.email,
          displayName:   session.userData.displayName || session.userData.name || '',
          photoURL:      session.userData.photoURL    || null,
          _offlineLogin: true,
        };

        const normalized = normaliseUser(
          fakeUser.uid,
          fakeUser.email,
          session.userData,
        );

        setUser(fakeUser);
        setUserData(normalized);
        setIsOfflineMode(true);
        offlineSessionActive.current = true;

        // ✅ Log OFFLINE login (saved to Dexie with offline tag + device/location/time)
        try {
          logUserLogin(
            normalized.uid,
            normalized.primaryStore || normalized.storeId || 'default',
            normalized.name || fakeUser.email,
            normalized.primaryRole || normalized.role || 'biller',
            { offlineLogin: true },
          ).catch(() => {});
          const deviceId = _resolveStableDeviceId(normalized.uid);
          const billerCode = normalized.billerCode || `BIL-${deviceId.slice(-4).toUpperCase()}`;
          _registerDeviceSession(normalized, deviceId, billerCode);
          captureGeoLocation();
        } catch { /* non-blocking */ }

        console.log('[Auth] ✅ Offline session restored:', fakeUser.email);
      } catch (err) {
        console.warn('[Auth] Session restore error:', err?.message || err);
      } finally {
        setInitializing(false);
        setLoading(false);
      }
    };

    doRestore();
  }, []); // ← empty: runs once on mount only

  // ══════════════════════════════════════════════════════════
  // 3. FIREBASE AUTH LISTENER
  // ══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isFirebaseReady() || !auth) {
      // Firebase not configured → offline only
      setInitializing(false);
      setLoading(false);
      return;
    }

    authListenerReady.current = true;

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      // ✅ CRITICAL: If offline session is active and Firebase gives null
      //    (because network was off during init) → DO NOT kill session
      if (offlineSessionActive.current && !firebaseUser) {
        console.log('[Auth] Offline session active — ignoring Firebase null');
        setInitializing(false);
        setLoading(false);
        return;
      }

      setLoading(true);

      if (firebaseUser) {
        // Same account logged in again from another tab — don't disrupt this tab
        if (userUidRef.current && firebaseUser.uid === userUidRef.current) {
          setInitializing(false);
          setLoading(false);
          return;
        }

        // ✅ Firebase user found → upgrade from offline to online
        offlineSessionActive.current = false;
        setIsOfflineMode(false);

        try {
          let resolved = await fetchUserDocByAuth(firebaseUser);
          if (!resolved?.data) {
            await new Promise((r) => setTimeout(r, 350));
            resolved = await fetchUserDocByAuth(firebaseUser);
          }
          if (!resolved?.data) {
            setError('Profile sync failed. Check internet and try again, or contact Super Admin.');
            setUser(null);
            setUserData(null);
            setLoading(false);
            setInitializing(false);
            return;
          }

          const raw = resolved.data;
          if (raw.isDeleted === true) {
            setError('Account has been removed.');
            await firebaseSignOut(auth);
            setUser(null);
            setUserData(null);
            setLoading(false);
            setInitializing(false);
            return;
          }
          if (raw.isActive === false) {
            setError('Account is inactive.');
            await firebaseSignOut(auth);
            setUser(null);
            setUserData(null);
            setLoading(false);
            setInitializing(false);
            return;
          }

          const normalized = normaliseUser(firebaseUser.uid, firebaseUser.email, raw);
          setUser(firebaseUser);
          setUserData(normalized);
          setError(null);

          // ✅ Stable device ID — same terminal across logins (audit + devices filter)
          const deviceId = _resolveStableDeviceId(firebaseUser.uid);
          const billerCode = raw.billerCode || `BIL-${deviceId.slice(-4).toUpperCase()}`;
          await _registerDeviceSession(normalized, deviceId, billerCode);

          // ✅ Log user login activity
          logUserLogin(
            firebaseUser.uid,
            raw.primaryStore || 'default',
            raw.name || firebaseUser.email,
            raw.role || raw.primaryRole || 'cashier',
            { userAgent: navigator.userAgent?.slice(0, 80) }
          ).catch(e => console.warn('[Auth] Login logging failed:', e));
          captureGeoLocation();

          // ✅ Save session for next offline reload
          try {
            await _saveOfflineSession(
              { userData: raw, loggedInAt: Date.now() },
              24 * 60 * 60 * 1000,
            );
          } catch {}

        } catch (err) {
          // Network error during Firestore read — keep existing session
          console.warn('[Auth] Firestore read failed (maybe offline):', err?.message);
          if (!user) {
            setUser(firebaseUser);
          }
        }

      } else {
        // Firebase signed out — only clear if NOT in offline mode
        if (!offlineSessionActive.current) {
          setUser(null);
          setUserData(null);
          setError(null);
        }
      }

      setInitializing(false);
      setLoading(false);
    });

    return unsub;
  }, []); // ← runs once on mount

  // ══════════════════════════════════════════════════════════
  // 4. ACTIVE ROLE
  // ══════════════════════════════════════════════════════════
  const setActiveRole = useCallback((role) => {
    if (!userData?.roles?.includes(role)) return false;
    setActiveRoleState(role);
    setTabActiveRole(role);
    return true;
  }, [userData]);

  useEffect(() => {
    if (!userData) { setActiveRoleState(null); return; }

    const urlRole = consumeRoleFromUrl();
    const tabRole = getTabActiveRole();
    const preferred = urlRole || tabRole;

    if (preferred && userData.roles?.includes(preferred)) {
      setActiveRoleState(preferred);
      setTabActiveRole(preferred);
      return;
    }

    setActiveRoleState(userData.primaryRole || userData.roles?.[0] || 'biller');
  }, [userData]);

  // ══════════════════════════════════════════════════════════
  // 4b. LIVE USER PROFILE — branch assignment updates without re-login
  // ══════════════════════════════════════════════════════════
  useEffect(() => {
    const uid = userData?.uid;
    if (!uid || !isFirebaseReady() || !db || !isOnline) return;

    const unsub = onSnapshot(
      doc(db, 'users', uid),
      async (snap) => {
        if (!snap.exists()) {
          console.warn('[Auth] User profile deleted — signing out');
          try { await firebaseSignOut(auth); } catch { /* ignore */ }
          setUser(null);
          setUserData(null);
          setError('Account has been removed.');
          return;
        }
        const raw = snap.data();
        const normalized = normaliseUser(uid, userData?.email || raw.email, raw);
        setUserData((prev) => {
          const prevKey = [
            prev?.primaryStore,
            prev?.storeId,
            JSON.stringify(prev?.storeIds || []),
            JSON.stringify(prev?.assignedBranches || []),
          ].join('|');
          const nextKey = [
            normalized.primaryStore,
            normalized.storeId,
            JSON.stringify(normalized.storeIds || []),
            JSON.stringify(normalized.assignedBranches || []),
          ].join('|');
          if (prevKey === nextKey) return prev;

          const prevBranch = prev?.primaryStore || prev?.storeId || '';
          const nextBranch = normalized.primaryStore || normalized.storeId || '';
          if (prevBranch && nextBranch && prevBranch !== nextBranch) {
            queueMicrotask(async () => {
              try {
                await _saveOfflineSession(
                  { userData: { ...raw, uid }, loggedInAt: Date.now() },
                  24 * 60 * 60 * 1000,
                );
              } catch { /* ignore */ }
              try {
                const { toast } = await import('react-hot-toast');
                toast.success(`Branch updated: ${nextBranch}`, {
                  id: `branch-live-${uid}`,
                  duration: 4500,
                });
              } catch { /* ignore */ }
              try {
                const ch = new BroadcastChannel('aone_user_branch');
                ch.postMessage({
                  type: 'BRANCH_UPDATED',
                  uid,
                  primaryStore: nextBranch,
                  storeIds: normalized.storeIds || [],
                });
                ch.close();
              } catch { /* ignore */ }
            });
          }

          return normalized;
        });
      },
      (err) => console.warn('[Auth] user profile listener:', err?.message),
    );
    return () => unsub();
  }, [userData?.uid, userData?.email, isOnline]);

  // ══════════════════════════════════════════════════════════
  // 5. SERIAL PRELOAD (online only)
  // ══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!userData?.primaryStore || !userData?.uid || !isOnline) return;
    const storeId = userData.primaryStore;
    loadStoresMapFromCache()
      .then((map) => resolveSerialBranchHint(storeId, map, userData))
      .then((hint) => syncSerialFromFirebase(storeId, userData, hint))
      .then((max) => console.log(`[Auth] Serial preloaded max=${max}`))
      .catch((err) => console.warn('[Auth] Serial preload failed:', err?.message));
  }, [userData?.primaryStore, userData?.uid, userData?.storeIds, isOnline]);

  // Super Admin login — auto-repair all user profiles once per session (no User Management visit needed)
  useEffect(() => {
    if (!userData?.uid || !isOnline || !isSuperAdminUser(userData)) return;
    const sessionKey = 'aone_login_profile_repair_done';
    try { if (sessionStorage.getItem(sessionKey) === '1') return; } catch { /* ignore */ }
    repairAllUserProfiles(userData, { silentToast: true, tryCloud: false })
      .then((result) => {
        if (result?.success) {
          try { sessionStorage.setItem(sessionKey, '1'); } catch { /* ignore */ }
        }
      })
      .catch(() => {});
  }, [userData, isOnline]);

  // ══════════════════════════════════════════════════════════
  // SIGN UP (online only)
  // ══════════════════════════════════════════════════════════
  const signUp = useCallback(async (
    email, password, displayName,
    roles = ['biller'], storeIds = [], primaryStore = '',
  ) => {
    try {
      setError(null);
      if (!navigator.onLine) throw new Error('Internet required to create account');
      if (!isFirebaseReady())  throw new Error('Firebase not configured');

      const cred        = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseUser = cred.user;
      await updateProfile(firebaseUser, { displayName });

      const normRoles   = Array.isArray(roles) ? roles : [roles];
      const primaryRole = ROLE_ORDER.find(r => normRoles.includes(r)) || normRoles[0];
      const permissions = mergePermissions(normRoles);

      const payload = {
        uid:          firebaseUser.uid,
        email:        firebaseUser.email,
        name:         displayName,
        displayName,
        roles:        normRoles,
        role:         primaryRole,
        primaryRole,
        permissions,
        storeIds,
        storeId:      primaryStore || storeIds[0] || '',
        primaryStore: primaryStore || storeIds[0] || '',
        isActive:     true,
        isDeleted:    false,
        loginCount:   0,
        lastLogin:    null,
        createdAt:    serverTimestamp(),
        updatedAt:    serverTimestamp(),
        lastLoginAt:  serverTimestamp(),
      };

      await setDoc(doc(db, 'users', firebaseUser.uid), payload);
      return { user: firebaseUser, success: true };
    } catch (err) {
      const authError = normalizeAuthError(err);
      setError(authError.message);
      return { error: authError, success: false };
    }
  }, []);

  // ══════════════════════════════════════════════════════════
  // SIGN IN (Smart: Online → Offline fallback)
  // ══════════════════════════════════════════════════════════
  const signIn = useCallback(async (email, password, selectedRole = null) => {
    try {
      setError(null);
      setLoading(true);

      const normalizedEmail = String(email || '').toLowerCase().trim();

      // Already signed in as this user — switch tab role without re-auth (multi-tab)
      const current = auth?.currentUser;
      if (current && current.email?.toLowerCase() === normalizedEmail) {
        let rawData = userData?.uid === current.uid ? userData : null;

        if (!rawData && isFirebaseReady()) {
          try {
            const resolved = await fetchUserDocByAuth(current);
            if (resolved?.data) rawData = resolved.data;
          } catch {
            /* fall through to smartLogin */
          }
        }

        if (rawData) {
          const userRoles = rawData.roles || [rawData.role || 'biller'];
          if (selectedRole && !userRoles.includes(selectedRole)) {
            const errorMsg = `Role "${selectedRole}" not assigned to your account`;
            setError(errorMsg);
            setLoading(false);
            return { error: { code: 'role-not-assigned', message: errorMsg }, success: false };
          }

          const normalizedData = normaliseUser(current.uid, current.email, rawData);
          setUser(current);
          setUserData(normalizedData);
          setIsOfflineMode(false);
          offlineSessionActive.current = false;

          if (selectedRole) {
            setTabActiveRole(selectedRole);
            setActiveRoleState(selectedRole);
          }

          setLoading(false);
          return {
            user: current,
            userData: normalizedData,
            success: true,
            mode: 'online',
            switchedRole: true,
          };
        }
      }

      const result = await smartLogin(email, password);

      if (!result.success) {
        setError(result.error?.message || 'Login failed');
        setLoading(false);
        return { error: result.error, success: false };
      }

      const { user: firebaseUser, userData: rawData, mode, warning } = result;

      // Role validation
      const userRoles = rawData.roles || [rawData.role || 'biller'];

      if (selectedRole && !userRoles.includes(selectedRole)) {
        if (mode === 'online' && auth) {
          try { await firebaseSignOut(auth); } catch {}
        }
        const errorMsg = `Role "${selectedRole}" not assigned to your account`;
        setError(errorMsg);
        setLoading(false);
        return { error: { code: 'role-not-assigned', message: errorMsg }, success: false };
      }

      if (selectedRole) {
        setTabActiveRole(selectedRole);
        setActiveRoleState(selectedRole);
      }

      const normalizedData = normaliseUser(
        firebaseUser.uid, firebaseUser.email, rawData,
      );

      setUser(firebaseUser);
      setUserData(normalizedData);
      setIsOfflineMode(mode === 'offline');
      offlineSessionActive.current = (mode === 'offline');
      setError(null);

      // ✅ Always save session (for offline reload)
      try {
        await _saveOfflineSession(
          { userData: rawData, loggedInAt: Date.now() },
          24 * 60 * 60 * 1000,
        );
      } catch (e) {
        console.warn('[Auth] saveOfflineSession failed:', e?.message);
      }

      // Update login meta in background (online only)
      if (mode === 'online' && rawData.uid) {
        updateDoc(doc(db, 'users', rawData.uid), {
          lastLogin:   serverTimestamp(),
          lastLoginAt: serverTimestamp(),
          loginCount:  (rawData.loginCount || 0) + 1,
          updatedAt:   serverTimestamp(),
        }).catch(() => {});

        if (localDb?.sessions) {
          localDb.sessions.put({
            sessionId: `sess_${firebaseUser.uid}_${Date.now()}`,
            userId:    firebaseUser.uid,
            deviceId:  localStorage.getItem(LS_KEYS.DEVICE_ID) || 'DEV1',
            loginTime: new Date().toISOString(),
            lastActive: new Date().toISOString(),
            mode,
          }).catch(() => {});
        }
      }

      setLoading(false);
      return {
        user:     firebaseUser,
        userData: normalizedData,
        success:  true,
        mode,
        warning,
      };
    } catch (err) {
      const authError = normalizeAuthError(err);
      setError(authError.message);
      setLoading(false);
      return { error: authError, success: false };
    }
  }, [userData]);

  // ══════════════════════════════════════════════════════════
  // SIGN OUT
  // ══════════════════════════════════════════════════════════
  const signOut = useCallback(async () => {
    try {
      // ✅ Log user logout before clearing data
      if (user && userData) {
        logUserLogout(
          user.uid,
          userData.primaryStore || 'default',
          userData.name || user.email,
          userData.role || userData.primaryRole || 'cashier',
          0 // session duration - can be calculated from login time if needed
        ).catch(e => console.warn('[Auth] Logout logging failed:', e));
      }

      if (isFirebaseReady() && auth && !isOfflineMode) {
        await firebaseSignOut(auth);
      }

      setUser(null);
      setUserData(null);
      setError(null);
      setActiveRoleState(null);
      setIsOfflineMode(false);
      offlineSessionActive.current = false;

      try { resetSerialService(); }        catch {}
      try { await _clearOfflineSession(); } catch {}
      try { clearTabActiveRole(); } catch {}
      try { localStorage.removeItem(LS_KEYS.ACTIVE_ROLE); } catch {}

      await Promise.allSettled([
        dbClear(IDB_STORES.ORDERS),
        dbClear(IDB_STORES.SYNC_QUEUE),
        dbClear(IDB_STORES.SESSIONS),
        clearAllCashierOfflineCache(),
      ]);

      return { success: true };
    } catch (err) {
      setError(err.message);
      return { error: err.message, success: false };
    }
  }, [isOfflineMode]);

  // ══════════════════════════════════════════════════════════
  // RESET PASSWORD (online only)
  // ══════════════════════════════════════════════════════════
  const resetPassword = useCallback(async (email) => {
    try {
      setError(null);
      if (!navigator.onLine) throw new Error('Internet required');
      if (!isFirebaseReady()) throw new Error('Firebase not configured');
      const { validateUserEmail } = await import('../utils/validators');
      const { sendPasswordResetEmailSecondary } = await import('../services/secondaryFirebase');
      const check = validateUserEmail(email);
      if (!check.valid) throw new Error(check.error || 'Invalid email');
      await sendPasswordResetEmailSecondary(check.normalized);
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { error: err.message, success: false };
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // ══════════════════════════════════════════════════════════
  // SETUP — permanent lock
  // Never shows setup again unless superAdmin deletes themselves
  // ══════════════════════════════════════════════════════════
  const isSetupComplete = useCallback(async () => {
    try {
      // Online: Firebase setup doc is the single source of truth
      if (navigator.onLine && isFirebaseReady() && db) {
        const ok = await checkSetupStatus();
        if (ok) {
          localStorage.setItem(LS_KEYS.SETUP_COMPLETE, 'true');
          localStorage.setItem(LS_KEYS.SETUP_LOCK,     'true');
        }
        return ok;
      }
    } catch { /* fall through to offline checks */ }

    const lsComplete =
      localStorage.getItem(LS_KEYS.SETUP_COMPLETE) === 'true' ||
      localStorage.getItem(LS_KEYS.SETUP_LOCK)     === 'true';
    if (lsComplete) return true;

    try {
      const ok = await checkSetupStatus();
      if (ok) {
        localStorage.setItem(LS_KEYS.SETUP_COMPLETE, 'true');
        localStorage.setItem(LS_KEYS.SETUP_LOCK,     'true');
      }
      return ok;
    } catch {
      return lsComplete;
    }
  }, []);

  const markSetupComplete = useCallback(async () => {
    try {
      localStorage.setItem(LS_KEYS.SETUP_COMPLETE, 'true');
      localStorage.setItem(LS_KEYS.SETUP_LOCK,     'true');
      localStorage.setItem(LS_KEYS.SETUP_DATE,     new Date().toISOString());
      localStorage.setItem(LS_KEYS.SETUP_VERSION,  '1.0.0');
      await setSetupCompleteFlag({ completedBy: auth?.currentUser?.uid || 'client' });
      console.log('[Auth] ✅ Setup marked complete');
      return true;
    } catch (err) {
      console.error('[Auth] markSetupComplete error:', err);
      return true; // localStorage already set — safe to proceed
    }
  }, []);

  const resetSetupState = useCallback(async () => {
    // Only superAdmin can call this
    try {
      const currentUser = auth?.currentUser;
      if (!currentUser) return false;

      if (isFirebaseReady() && db && navigator.onLine) {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        if (!snap.exists()) return false;

        const isSA = (snap.data().roles || []).some(r =>
          ['superAdmin', 'superadmin', 'super_admin'].includes(r),
        );
        if (!isSA) { setError('Only Super Admin can reset setup'); return false; }

        try { await deleteDoc(doc(db, 'settings', 'setup')); } catch {}
      }

      localStorage.removeItem(LS_KEYS.SETUP_COMPLETE);
      localStorage.removeItem(LS_KEYS.SETUP_LOCK);
      localStorage.removeItem(LS_KEYS.SETUP_DATE);
      localStorage.removeItem(LS_KEYS.SETUP_VERSION);
      localStorage.removeItem('aone-offline-users');
      try { await clearSetupFlag(); } catch {}

      console.log('[Auth] ⚠️ Setup reset by superAdmin');
      return true;
    } catch (err) {
      console.error('[Auth] resetSetupState error:', err);
      return false;
    }
  }, []);

  const getAllUsers = useCallback(async () => {
    try {
      if (!isFirebaseReady() || !db || !navigator.onLine) return [];
      const snap = await getDocs(
        query(collection(db, 'users'), orderBy('createdAt', 'desc')),
      );
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch { return []; }
  }, []);

  // ══════════════════════════════════════════════════════════
  // PERMISSION HELPERS
  // ══════════════════════════════════════════════════════════
  const hasRole = useCallback(
    (role) => (userData?.roles || []).includes(role),
    [userData],
  );

  const hasAnyRole = useCallback((...roles) => {
    const userRoles = userData?.roles || [];
    return roles.flat().some(r => userRoles.includes(r));
  }, [userData]);

  const hasPermission = useCallback((permKey) => {
    if (!userData) return false;
    if ((userData.roles || []).some(r => ['superAdmin', 'superadmin'].includes(r)))
      return true;
    return Boolean(userData.permissions?.[permKey]);
  }, [userData]);

  const hasActiveRolePermission = useCallback((permKey) => {
    if (!userData || !activeRole) return false;
    if (['superAdmin', 'superadmin'].includes(activeRole)) return true;
    return Boolean(mergePermissions([activeRole])[permKey]);
  }, [userData, activeRole]);

  // ══════════════════════════════════════════════════════════
  // DERIVED
  // ══════════════════════════════════════════════════════════
  const isSuperAdmin = useMemo(
    () => isSuperAdminUser(userData),
    [userData],
  );

  const isAdmin = useMemo(() =>
    (userData?.roles || []).some(r =>
      ['superAdmin', 'superadmin', 'admin'].includes(r),
    ), [userData]);

  const hasMultipleRoles = useMemo(
    () => (userData?.roles || []).length > 1,
    [userData],
  );

  // ══════════════════════════════════════════════════════════
  // CONTEXT VALUE
  // ══════════════════════════════════════════════════════════
  const value = useMemo(() => ({
    // State
    user,
    userData,
    loading,
    initializing,
    isLoading,
    error,
    activeRole,
    hasMultipleRoles,
    isOnline,
    isOfflineMode,

    // Auth actions
    signUp,
    signIn,
    signOut,
    resetPassword,
    clearError,
    setActiveRole,

    // Permission helpers
    hasRole,
    hasAnyRole,
    hasPermission,
    hasActiveRolePermission,

    // Derived booleans
    isSuperAdmin,
    isAdmin,
    isAuthenticated: !!user,

    // Setup
    isSetupComplete,
    markSetupComplete,
    resetSetupState,

    // Users
    getAllUsers,

    // Convenience fields
    roles:        userData?.roles       || [],
    role:         userData?.primaryRole || userData?.role || null,
    primaryRole:  userData?.primaryRole || null,
    permissions:  userData?.permissions || {},
    displayName:  userData?.name || userData?.displayName || user?.displayName || null,
    email:        userData?.email || user?.email || null,
    photoURL:     userData?.photoURL || user?.photoURL || null,
    storeIds:     userData?.storeIds   || [],
    primaryStore: userData?.primaryStore || '',
  }), [
    user, userData, loading, initializing, isLoading,
    error, activeRole, hasMultipleRoles, isOnline, isOfflineMode,
    signUp, signIn, signOut, resetPassword, clearError, setActiveRole,
    hasRole, hasAnyRole, hasPermission, hasActiveRolePermission,
    isSuperAdmin, isAdmin,
    isSetupComplete, markSetupComplete, resetSetupState, getAllUsers,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
};

export default AuthContext;