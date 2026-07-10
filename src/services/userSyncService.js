// src/services/userSyncService.js
// ✅ MASTER PROMPT — PRODUCTION FINAL v3
// ✅ §1:  IndexedDB PRIMARY source of truth
// ✅ §3:  userCode generation (BIL01, CAS02)
// ✅ §5:  FIFO sync queue + retry + backoff + dead-letter
// ✅ §7:  SuperAdmin-only delete, RBAC permission checks
// ✅ §9:  BroadcastChannel multi-tab sync
// ✅ §10: Secondary Firebase app (admin stays logged in)
// ✅ §14: Flow: UI → IDB → Queue → Firebase → Confirm → Synced
// ✅ §17: Handles old docs without isDeleted field

import {
    doc, setDoc, updateDoc, deleteDoc, getDoc,
    collection, getDocs, serverTimestamp,
    query, where,
} from './firebase';
import { toast } from 'react-hot-toast';

import { db } from './firebase';
import { createAuthUser, sendWelcomeEmail } from './secondaryFirebase';
import { deleteUserAccount } from './firebaseUserService';
import {
  saveUserTombstone, getTombstoneByEmail, clearUserTombstone,
} from './userTombstoneService';
import {
    STORES, dbPut, dbGet, dbGetAll, dbDelete,
    addToSyncQueue, getPendingSyncItems,
    markSyncFailed, updateSyncQueueItem,
    logAction,
} from './indexedDBService';
import {
    getPrimaryRole, mergePermissions,
} from '../utils/rolePermissions';
import { validateUserEmail } from '../utils/validators';
import { isSuperAdminUser, normalizeRoles } from '../utils/superAdminUtils';

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════
const ROLE_PREFIX_MAP = {
    superAdmin: 'SUP',
    superadmin: 'SUP',
    super_admin: 'SUP',
    admin: 'ADM',
    manager: 'MGR',
    biller: 'BIL',
    cashier: 'CAS',
};

const ROLE_HIERARCHY = [
    'superAdmin', 'superadmin', 'super_admin',
    'admin', 'manager', 'biller', 'cashier',
];

// Toast styles
const TS = {
    base: { background: '#1a1208', color: '#f5f0e8', border: '1px solid #2a1f0d' },
    success: { background: '#052e16', color: '#10b981', border: '1px solid #10b981' },
    error: { background: '#1c0a0a', color: '#ef4444', border: '1px solid #ef4444' },
    warn: { background: '#1c1203', color: '#f59e0b', border: '1px solid #f59e0b' },
};

const _userToast = (silent) => ({
    error: (msg, opts = {}) => { if (!silent) toast.error(msg, opts); },
    success: (msg, opts = {}) => { if (!silent) toast.success(msg, opts); },
    loading: (msg, opts = {}) => (silent ? null : toast.loading(msg, opts)),
    info: (msg, opts = {}) => { if (!silent) toast(msg, opts); },
    dismiss: (id) => { if (id) toast.dismiss(id); },
});

const _toastDedup = new Map();
const TOAST_DEDUP_MS = 12_000;

const toastOnce = (key, fn) => {
    const last = _toastDedup.get(key);
    if (last && Date.now() - last < TOAST_DEDUP_MS) return;
    _toastDedup.set(key, Date.now());
    fn();
};

let _syncQueueLock = false;
let _lastSyncQueueAt = 0;
const SYNC_QUEUE_COOLDOWN_MS = 15_000;

/** IndexedDB sync_queue key is `queueId` (auto-increment), not `id`. */
const syncQueueKey = (item) => item?.queueId ?? item?.id ?? null;

// ══════════════════════════════════════════════════════════════
// §9: CROSS-TAB BROADCAST
// ══════════════════════════════════════════════════════════════
let _channel = null;

const _getChannel = () => {
    if (_channel) return _channel;
    if (typeof BroadcastChannel === 'undefined') return null;
    try {
        _channel = new BroadcastChannel('aone_users');
    } catch {
        _channel = null;
    }
    return _channel;
};

const _broadcast = (type, payload) => {
    try {
        _getChannel()?.postMessage({ type, payload, ts: Date.now() });
    } catch { }
};

export const subscribeToUserChanges = (callback) => {
    const ch = _getChannel();
    if (!ch) return () => { };
    const handler = (e) => callback(e.data);
    ch.addEventListener('message', handler);
    return () => ch.removeEventListener('message', handler);
};

// ══════════════════════════════════════════════════════════════
// NORMALIZE ROLES
// Handles: string | array | undefined
// ══════════════════════════════════════════════════════════════
export const normalizeUserRoles = (user) => normalizeRoles(user);

const _isSuperAdmin = (user) => isSuperAdminUser(user);
const _canManageUsers = (user) => isSuperAdminUser(user);

// ══════════════════════════════════════════════════════════════
// USER CODE GENERATOR
// §3: BIL01, CAS02 format for serial generation
// ══════════════════════════════════════════════════════════════
export const generateUserCode = async (roles = [], email = '') => {
    const primaryRole = ROLE_HIERARCHY.find(r => roles.includes(r))
        || roles[0]
        || 'biller';
    const prefix = ROLE_PREFIX_MAP[primaryRole] || 'USR';

    // P1: Extract number from email (biller3@... → BIL03)
    const emailNum = String(email).match(/(\d+)@/);
    if (emailNum?.[1]) {
        return `${prefix}${String(emailNum[1]).padStart(2, '0')}`;
    }

    // P2: Count existing users with same prefix in IDB
    try {
        const all = await dbGetAll(STORES.USERS);
        const existing = all.filter(u =>
            u.userCode?.startsWith(prefix) &&
            !u.isDeleted &&
            !u._hardDeleted
        );
        const next = existing.length + 1;
        return `${prefix}${String(next).padStart(2, '0')}`;
    } catch {
        // P3: Deterministic fallback from email hash
        let hash = 5381;
        for (const c of String(email)) {
            hash = ((hash << 5) + hash) ^ c.charCodeAt(0);
            hash = hash & hash;
        }
        return `${prefix}${String((Math.abs(hash) % 99) + 1).padStart(2, '0')}`;
    }
};

// ══════════════════════════════════════════════════════════════
// LOCAL IDB OPERATIONS
// ══════════════════════════════════════════════════════════════

export const localGetAllUsers = async () => {
    const all = await dbGetAll(STORES.USERS);
    return all.filter(u => !u._hardDeleted && u.isDeleted !== true && u.isArchived !== true);
};

export const localGetUser = async (uid) => dbGet(STORES.USERS, uid);

export const localSaveUser = async (userData) => {
    const record = {
        ...userData,
        _localUpdatedAt: Date.now(),
        _syncStatus: userData._syncStatus || 'pending',
    };
    await dbPut(STORES.USERS, record);
    _broadcast('USER_CHANGED', { uid: record.uid, action: 'save' });
    return record;
};

export const localDeleteUser = async (uid) => {
    await dbDelete(STORES.USERS, uid);
    _broadcast('USER_CHANGED', { uid, action: 'delete' });
};

/** Resolve real Firebase Auth uid for Firestore users/{uid} (not temp_ local id). */
export const resolveCanonicalUserUid = async (localUser = {}) => {
    const email = String(localUser?.email || '').trim().toLowerCase();
    let uid = String(localUser?.uid || localUser?.id || '').trim();

    const looksLikeFirebaseUid = (id) => id && !id.startsWith('temp_') && id.length >= 20;

    if (looksLikeFirebaseUid(uid)) return uid;

    if (!email || !navigator.onLine) return uid || null;

    try {
        const snap = await getDocs(
            query(collection(db, 'users'), where('email', '==', email), limit(10)),
        );
        for (const d of snap.docs) {
            const dataUid = String(d.data()?.uid || '').trim();
            if (looksLikeFirebaseUid(dataUid)) return dataUid;
            if (looksLikeFirebaseUid(d.id)) return d.id;
        }
    } catch (err) {
        console.warn('[userSync] resolveCanonicalUserUid firestore:', err?.message);
    }

    try {
        const pending = await getPendingSyncItems();
        const hit = pending.find((p) => {
            const data = p.data || {};
            return data.email?.toLowerCase() === email && data.firebaseUid;
        });
        if (looksLikeFirebaseUid(hit?.data?.firebaseUid)) return hit.data.firebaseUid;
    } catch { /* ignore */ }

    return uid || null;
};

const looksLikeFirebaseUid = (id) => {
    const s = String(id || '').trim();
    return s && !s.startsWith('temp_') && s.length >= 20;
};

/** Super Admin — repair profiles in Firestore without Cloud Functions. */
const _repairAllUserProfilesClient = async () => {
    const snap = await getDocs(collection(db, 'users'));
    const emailBuckets = new Map();

    snap.docs.forEach((d) => {
        const data = d.data() || {};
        const email = String(data.email || '').trim().toLowerCase();
        if (!email) return;
        if (!emailBuckets.has(email)) emailBuckets.set(email, []);
        emailBuckets.get(email).push({ id: d.id, data });
    });

    const pickCanonicalUid = (email, extraUid = '') => {
        if (looksLikeFirebaseUid(extraUid)) return extraUid;
        const bucket = emailBuckets.get(email) || [];
        for (const { id, data } of bucket) {
            const dataUid = String(data?.uid || '').trim();
            if (looksLikeFirebaseUid(dataUid)) return dataUid;
            if (looksLikeFirebaseUid(id)) return id;
        }
        return null;
    };

    let repaired = 0;
    const written = new Set();

    // Pass 1 — legacy Firestore docs under wrong document id
    for (const d of snap.docs) {
        const data = d.data() || {};
        const email = String(data.email || '').trim().toLowerCase();
        if (!email) continue;

        const canonicalUid = pickCanonicalUid(email, data.uid);
        if (!canonicalUid) continue;

        const writeKey = canonicalUid;
        const needsWrite = d.id !== canonicalUid || !looksLikeFirebaseUid(data.uid);
        if (!needsWrite) continue;

        await setDoc(doc(db, 'users', canonicalUid), {
            ...data,
            uid: canonicalUid,
            email,
            _legacyDocId: d.id !== canonicalUid ? d.id : data._legacyDocId,
            updatedAt: serverTimestamp(),
            _repairedAt: serverTimestamp(),
        }, { merge: true });

        if (!written.has(writeKey)) {
            written.add(writeKey);
            repaired += 1;
        }
    }

    // Pass 2 — push local IDB users to users/{authUid}
    const localUsers = await localGetAllUsers();
    let pending = [];
    try { pending = await getPendingSyncItems(); } catch { /* ignore */ }

    for (const u of localUsers) {
        if (!u.email || u.isDeleted === true || u._hardDeleted) continue;

        const email = u.email.trim().toLowerCase();
        let canonicalUid = pickCanonicalUid(email, u.uid);
        if (!canonicalUid) {
            canonicalUid = await resolveCanonicalUserUid(u);
        }
        if (!canonicalUid || canonicalUid.startsWith('temp_')) {
            const hit = pending.find((p) => {
                const data = p.data || {};
                return data.email?.toLowerCase() === email && looksLikeFirebaseUid(data.firebaseUid);
            });
            if (hit?.data?.firebaseUid) canonicalUid = hit.data.firebaseUid;
        }
        if (!canonicalUid || canonicalUid.startsWith('temp_')) continue;

        const legacy = {};
        (emailBuckets.get(email) || []).forEach(({ data }) => Object.assign(legacy, data));

        const primaryRole = getPrimaryRole(u.roles || legacy.roles || []);
        const profile = {
            ...legacy,
            name: u.name || legacy.name || '',
            phone: u.phone || legacy.phone || '',
            email,
            roles: u.roles || legacy.roles || [],
            role: primaryRole || u.role || legacy.role || 'biller',
            primaryRole: u.primaryRole || primaryRole || legacy.primaryRole || 'biller',
            userCode: u.userCode || legacy.userCode || '',
            storeIds: u.storeIds || legacy.storeIds || [],
            storeId: u.storeId || legacy.storeId || u.primaryStore || legacy.primaryStore || '',
            primaryStore: u.primaryStore || legacy.primaryStore || u.storeId || legacy.storeId || '',
            permissions: u.permissions || legacy.permissions || mergePermissions(u.roles || legacy.roles || []),
            isActive: u.isActive !== false && legacy.isActive !== false,
            isDeleted: false,
            uid: canonicalUid,
            updatedAt: serverTimestamp(),
            _repairedAt: serverTimestamp(),
        };

        await setDoc(doc(db, 'users', canonicalUid), profile, { merge: true });

        if (u.uid !== canonicalUid) {
            await localDeleteUser(u.uid);
            await localSaveUser({
                ...u,
                ...profile,
                uid: canonicalUid,
                _syncStatus: 'synced',
                _syncedAt: Date.now(),
            });
        } else {
            await localMarkSynced(canonicalUid);
        }

        if (!written.has(canonicalUid)) {
            written.add(canonicalUid);
            repaired += 1;
        }
    }

    return repaired;
};

/**
 * Super Admin — repair ALL user profiles (Auth uid → Firestore + local IDB).
 */
export const repairAllUserProfiles = async (currentAdmin, options = {}) => {
    const { silentToast = false, tryCloud = true } = options;
    const notify = _userToast(silentToast);

    if (!_isSuperAdmin(currentAdmin)) {
        notify.error('🚫 Only Super Admin can repair profiles', { style: TS.error });
        return { success: false, error: 'Permission denied' };
    }

    if (!navigator.onLine) {
        notify.error('📡 Internet required to repair profiles', { style: TS.warn });
        return { success: false, error: 'Offline' };
    }

    const toastId = notify.loading('🔧 Syncing all user profiles…', { style: TS.base });

    try {
        const clientRepaired = await _repairAllUserProfilesClient();
        await _syncUsersFromFirebase(null, { silent: true });

        let cloudRepaired = 0;
        if (tryCloud) {
            try {
                const { repairAllUserProfilesCloud, isProfileRepairUnavailable } = await import('./firebaseUserService');
                if (!isProfileRepairUnavailable()) {
                    const localUsers = await localGetAllUsers();
                    const profiles = localUsers
                        .filter((u) => u.email && u.isDeleted !== true && !u._hardDeleted)
                        .map((u) => ({
                            name: u.name,
                            email: u.email,
                            phone: u.phone,
                            roles: u.roles,
                            role: u.role,
                            primaryRole: u.primaryRole,
                            userCode: u.userCode,
                            storeIds: u.storeIds,
                            storeId: u.storeId,
                            primaryStore: u.primaryStore,
                            permissions: u.permissions,
                            isActive: u.isActive,
                            notes: u.notes,
                        }));

                    const cloud = await repairAllUserProfilesCloud(profiles);
                    if (cloud.success) {
                        cloudRepaired = cloud.repaired ?? 0;
                        await _syncUsersFromFirebase(null, { silent: true });
                    }
                }
            } catch (cloudErr) {
                console.warn('[userSync] cloud profile repair skipped:', cloudErr?.message);
            }
        }

        const repaired = Math.max(clientRepaired, cloudRepaired);
        notify.success(
            repaired > 0
                ? `✅ Synced ${repaired} profile(s) — users can login now`
                : '✅ All profiles already synced',
            { id: toastId, duration: 4000, style: TS.success },
        );

        _broadcast('users_repaired', { repaired, clientRepaired, cloudRepaired });
        return { success: true, repaired, clientRepaired, cloudRepaired };
    } catch (err) {
        console.error('[userSync] repairAllUserProfiles:', err);
        notify.error(`❌ Repair failed: ${err.message}`, { id: toastId, style: TS.error });
        return { success: false, error: err.message };
    }
};

export const localMarkSynced = async (uid) => {
    const user = await localGetUser(uid);
    if (!user) return;
    await dbPut(STORES.USERS, {
        ...user,
        _syncStatus: 'synced',
        _syncedAt: Date.now(),
    });
    _broadcast('USER_CHANGED', { uid, action: 'synced' });
};

export const findLocalUserByEmail = async (email) => {
    if (!email) return null;
    const normalized = email.trim().toLowerCase();
    const all = await dbGetAll(STORES.USERS);
    return all.find(u =>
        u.email === normalized &&
        u.uid &&
        !u.uid.startsWith('temp_') &&
        u.isDeleted !== true &&
        !u._hardDeleted
    ) || null;
};

// ══════════════════════════════════════════════════════════════
// EMAIL UNIQUENESS
// ✅ FIX: Handles old docs without isDeleted field
// ══════════════════════════════════════════════════════════════
export const checkEmailUnique = async (email, excludeUid = null) => {
    const normalized = email.trim().toLowerCase();

    // Check IDB first (offline-first, instant)
    try {
        const all = await dbGetAll(STORES.USERS);
        const exists = all.some(u =>
            u.email === normalized &&
            u.uid !== excludeUid &&
            !u._hardDeleted &&
            u.isDeleted !== true
        );
        if (exists) return false;
    } catch { }

    // Firebase check (handles old docs)
    if (!navigator.onLine) return true;

    try {
        const snap = await getDocs(
            query(collection(db, 'users'), where('email', '==', normalized))
        );
        if (snap.empty) return true;

        const activeOthers = snap.docs.filter(d => {
            if (d.id === excludeUid) return false;
            const data = d.data();
            // ✅ FIX: missing isDeleted → treat as NOT deleted
            return data.isDeleted !== true;
        });

        return activeOthers.length === 0;
    } catch {
        return true;
    }
};

// ══════════════════════════════════════════════════════════════
// CREATE USER
// §1:  IDB-first
// §5:  Toast: saving → saved → syncing → synced
// §10: Secondary auth (admin stays logged in)
// §3:  userCode generated
// ══════════════════════════════════════════════════════════════
export const createUser = async (userData, currentAdmin, sendWelcome = true, options = {}) => {
    const { silentToast = false, onProgress, fromSyncQueue = false, trustSuperAdmin = false } = options;
    const notify = _userToast(silentToast);

    const adminOk = fromSyncQueue || trustSuperAdmin || _canManageUsers(currentAdmin);

    if (!adminOk) {
        toastOnce('perm-create-user', () => {
            notify.error('🚫 Only Super Admin can create users', { id: 'perm-create-user', style: TS.error });
        });
        return { success: false, error: 'Permission denied' };
    }

    const normalizedEmail = userData.email?.trim().toLowerCase();
    const emailCheck = validateUserEmail(normalizedEmail);
    if (!emailCheck.valid) {
        notify.error(emailCheck.error, { style: TS.error });
        return { success: false, error: emailCheck.error };
    }

    const emailUnique = fromSyncQueue || userData._tempUid
        ? true
        : await checkEmailUnique(emailCheck.normalized);
    if (!emailUnique) {
        notify.error('Email already registered', { style: TS.error });
        return { success: false, error: 'Email already in use' };
    }

    // 🛡 FIX-SA-01: Super Admin Duplicate Check
    if (_isSuperAdmin(userData)) {
        try {
            // Check IDB
            const allLocal = await localGetAllUsers();
            let hasSuperAdmin = allLocal.some(u => _isSuperAdmin(u));
            
            // Check Pending Sync Queue
            if (!hasSuperAdmin) {
                const pending = await getPendingSyncItems();
                hasSuperAdmin = pending.some(p => p.type === 'create_user' && _isSuperAdmin(p.data));
            }

            // Check Firebase if online
            if (!hasSuperAdmin && navigator.onLine) {
                const snap = await getDocs(
                    query(collection(db, 'users'), where('roles', 'array-contains', 'superAdmin'))
                );
                const activeOthers = snap.docs.filter(d => d.data().isDeleted !== true);
                if (activeOthers.length > 0) hasSuperAdmin = true;
            }

            if (hasSuperAdmin) {
                notify.error('🚫 Super Admin Already Exists', { style: TS.error });
                await logAction('super_admin_duplicate_attempt', { email: userData.email, adminUid: currentAdmin.uid });
                return { success: false, error: 'Super Admin Already Exists' };
            }
        } catch(err) {
            console.warn('[userSync] Error checking duplicate super admin:', err);
        }
    }

    // Basic validation
    if (!userData.email?.trim() || !userData.password) {
        return { success: false, error: 'Email and password required' };
    }
    if (!userData.roles?.length) {
        return { success: false, error: 'At least one role required' };
    }
    const { toSingleBranchIds } = await import('../utils/branchAccess');
    const branchIds = toSingleBranchIds(userData.storeIds, userData.primaryStore || userData.storeId);
    if (!branchIds.length) {
        return { success: false, error: 'Branch required — select exactly one (Aone or JM-1)' };
    }
    userData.storeIds = branchIds;
    userData.primaryStore = branchIds[0];
    userData.storeId = branchIds[0];

    // Generate userCode
    const userCode = userData.userCode
        || await generateUserCode(userData.roles, userData.email);

    // Reuse existing tempUid if this is a sync retry
    const tempUid = userData._tempUid || `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    onProgress?.('saving');
    let toastId = notify.loading('💾 Saving locally…', { style: TS.base });

    try {
        // ── Build base document ──────────────────────────────────
        const primaryRole = getPrimaryRole(userData.roles);
        const permissions = mergePermissions(userData.roles);

        const baseDoc = {
            uid: tempUid,
            name: userData.name.trim(),
            email: emailCheck.normalized,
            phone: userData.phone || '',
            roles: userData.roles,
            role: primaryRole,          // backward compat
            primaryRole,
            userCode,                           // §3: serial generation
            storeIds: userData.storeIds,
            storeId: userData.primaryStore || userData.storeIds[0] || '',
            primaryStore: userData.primaryStore || userData.storeIds[0] || '',
            permissions,
            isActive: userData.isActive !== false,
            status: userData.isActive !== false ? 'active' : 'inactive',
            notes: userData.notes || '',
            loginCount: 0,
            lastLogin: null,
            emailVerified: false,
            isDeleted: false,
            deletedAt: null,
            createdBy: currentAdmin.uid,
            updatedBy: currentAdmin.uid,
            _tempCreated: true,
            _createdLocalAt: Date.now(),
        };

        // ── STEP 1: Save to IDB FIRST ────────────────────────────
        await localSaveUser({ ...baseDoc, _syncStatus: 'pending' });
        await logAction('user_created_local', {
            tempUid,
            email: baseDoc.email,
            userCode,
        });

        notify.success('✅ Saved locally', {
            id: toastId, duration: 1500, style: TS.success,
        });

        // ── STEP 2: Add to sync queue ────────────────────────────
        const queueId = await addToSyncQueue({
            type: 'create_user',
            operation: 'create_auth_and_doc',
            collection: 'users',
            data: {
                ...userData,
                userCode,
                _tempUid: tempUid,
                _currentAdminUid: currentAdmin.uid,
                _currentAdminRoles: normalizeRoles(currentAdmin),
                firebaseUid: null,
            },
            priority: 1,
        });

        // ── STEP 3: If offline — done for now ───────────────────
        if (!navigator.onLine) {
            notify.info('📡 Offline — will sync when online', {
                icon: '⏳', duration: 3000, style: TS.warn,
            });
            onProgress?.('done');
            return {
                success: true, uid: tempUid,
                syncedToCloud: false, offline: true, userCode,
            };
        }

        onProgress?.('syncing');
        toastId = notify.loading('☁️ Syncing to cloud…', { style: TS.base });

        // ── STEP 3a: Create Firebase Auth (secondary app) ────────
        let firebaseUid;
        let verificationSent = false;
        let reclaimedAuth = false;
        try {
            const authResult = await createAuthUser(
                baseDoc.email,
                userData.password,
                baseDoc.name,
            );
            firebaseUid = authResult.uid;
            verificationSent = authResult.verificationSent === true;

            if (queueId) {
                await updateSyncQueueItem(queueId, 'pending', {
                    data: {
                        ...userData,
                        userCode,
                        _tempUid: tempUid,
                        _currentAdminUid: currentAdmin.uid,
                        _currentAdminRoles: normalizeRoles(currentAdmin),
                        firebaseUid,
                    }
                });
            }
        } catch (authErr) {
            if (authErr?.code === 'auth/email-already-in-use') {
                const tombstone = await getTombstoneByEmail(baseDoc.email);
                if (tombstone?.uid) {
                    firebaseUid = tombstone.uid;
                    reclaimedAuth = true;
                    verificationSent = false;
                    console.info('[userSync] Reclaiming Firebase Auth uid after POS delete:', firebaseUid);
                } else {
                    const msg = 'Email still exists in Firebase Authentication. '
                        + 'Delete the user from POS (Super Admin), or remove them in Firebase Console → Authentication.';
                    notify.error(`⚠️ ${msg}`, { id: toastId, duration: 6000, style: TS.error });
                    onProgress?.('done');
                    return { success: false, error: msg, uid: tempUid, syncedToCloud: false };
                }
            } else {
                notify.error(
                    `⚠️ Auth failed: ${authErr.message}\n💾 Saved locally — will retry`,
                    { id: toastId, duration: 5000, style: TS.error }
                );
                onProgress?.('done');
                await logAction('user_auth_failed', {
                    tempUid, error: authErr.message, code: authErr.code,
                });
                return {
                    success: true, uid: tempUid,
                    syncedToCloud: false, error: authErr.message, userCode,
                };
            }
        }

        // ── STEP 3b: Write to Firestore ──────────────────────────
        try {
            const firestoreDoc = {
                ...baseDoc,
                uid: firebaseUid,
                userCode,
            };

            // Remove temp fields
            delete firestoreDoc._tempCreated;
            delete firestoreDoc._createdLocalAt;

            await setDoc(doc(db, 'users', firebaseUid), {
                ...firestoreDoc,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            // ── STEP 3c: CONFIRM — Update local with real UID ──────
            await localDeleteUser(tempUid);
            await localSaveUser({
                ...baseDoc,
                uid: firebaseUid,
                userCode,
                _tempCreated: false,
                _syncStatus: 'synced',
                _syncedAt: Date.now(),
            });

            // Remove from sync queue (confirmed)
            if (queueId) await dbDelete(STORES.SYNC_QUEUE, queueId);

            await logAction('user_created_synced', {
                uid: firebaseUid, email: baseDoc.email, userCode,
            });

            await clearUserTombstone(baseDoc.email);

            notify.success(
                reclaimedAuth
                    ? `☁️ ${baseDoc.name} restored (same login — password reset sent)`
                    : `☁️ ${baseDoc.name} synced to cloud`,
                { id: toastId, duration: reclaimedAuth ? 3500 : 2500, style: TS.success },
            );

            // ── STEP 4: Account setup emails (non-blocking) ─────────
            if (sendWelcome || reclaimedAuth) {
                Promise.all([
                    verificationSent ? Promise.resolve(true) : Promise.resolve(false),
                    sendWelcomeEmail(baseDoc.email),
                ]).then(([verified, resetSent]) => {
                    if (!silentToast && verified) {
                        notify.success('📧 Verification email sent — user must confirm inbox', {
                            duration: 3500, style: TS.success,
                        });
                    }
                    if (!silentToast && resetSent) {
                        notify.success('📧 Password setup link sent', {
                            duration: 2500, style: TS.success,
                        });
                    }
                });
            }

            onProgress?.('done');
            return {
                success: true, uid: firebaseUid,
                syncedToCloud: true, userCode,
                verificationSent,
            };

        } catch (fsErr) {
            // Auth created but Firestore failed
            // Update local with real Firebase UID (auth worked)
            await localDeleteUser(tempUid);
            await localSaveUser({
                ...baseDoc,
                uid: firebaseUid,
                userCode,
                _syncStatus: 'failed',
            });

            notify.error(
                `⚠️ Firestore write failed\n💾 Auth created, local preserved`,
                { id: toastId, duration: 5000, style: TS.error }
            );
            onProgress?.('done');
            await logAction('user_firestore_failed', {
                firebaseUid, error: fsErr.message,
            });

            return {
                success: true, uid: firebaseUid,
                syncedToCloud: false, error: fsErr.message, userCode,
            };
        }

    } catch (err) {
        console.error('[userSync] createUser fatal:', err);
        notify.error(`❌ ${err.message}`, { id: toastId, style: TS.error });
        onProgress?.('done');
        return { success: false, error: err.message };
    }
};

// ══════════════════════════════════════════════════════════════
// UPDATE USER
// §1: IDB-first → Firebase background
// ══════════════════════════════════════════════════════════════
export const updateUser = async (uid, userData, currentAdmin, options = {}) => {
    const { silentToast = false } = options;
    const notify = _userToast(silentToast);

    if (!_canManageUsers(currentAdmin)) {
        notify.error('🚫 Only Super Admin can update users', { style: TS.error });
        return { success: false, error: 'Permission denied' };
    }

    const { toSingleBranchIds } = await import('../utils/branchAccess');
    const branchIds = toSingleBranchIds(
        userData.storeIds || [],
        userData.primaryStore || userData.storeId || '',
    );
    if (!branchIds.length) {
        notify.error('🚫 Select exactly one branch', { style: TS.error });
        return { success: false, error: 'Branch required — one branch only' };
    }
    userData.storeIds = branchIds;
    userData.primaryStore = branchIds[0];
    userData.storeId = branchIds[0];

    let toastId = notify.loading('💾 Updating locally…', { style: TS.base });

    try {
        const primaryRole = getPrimaryRole(userData.roles || []);
        const permissions = mergePermissions(userData.roles || []);

        // 🛡 FIX-SA-02: Super Admin Duplicate Check for Update
        const isNowSuperAdmin = (userData.roles || []).some(r => ['superAdmin', 'superadmin', 'super_admin'].includes(r));
        if (isNowSuperAdmin) {
            try {
                const allLocal = await localGetAllUsers();
                let hasSuperAdmin = allLocal.some(u => u.uid !== uid && _isSuperAdmin(u));
                
                if (!hasSuperAdmin) {
                    const pending = await getPendingSyncItems();
                    hasSuperAdmin = pending.some(p => p.type === 'create_user' && p.docId !== uid && _isSuperAdmin(p.data)) ||
                                    pending.some(p => p.type === 'update_user' && p.docId !== uid && _isSuperAdmin(p.data));
                }

                if (!hasSuperAdmin && navigator.onLine) {
                    const snap = await getDocs(query(collection(db, 'users'), where('roles', 'array-contains', 'superAdmin')));
                    const activeOthers = snap.docs.filter(d => d.id !== uid && d.data().isDeleted !== true);
                    if (activeOthers.length > 0) hasSuperAdmin = true;
                }

                if (hasSuperAdmin) {
                    notify.error('🚫 Another Super Admin Already Exists', { style: TS.error });
                    return { success: false, error: 'Super Admin Already Exists' };
                }
            } catch(err) {
                console.warn('[userSync] Error checking duplicate super admin:', err);
            }
        }

        // Regenerate userCode if roles changed
        const existingUser = await localGetUser(uid);
        const normalizedEmail = userData.email?.trim().toLowerCase() || existingUser?.email;
        const canonicalUid = await resolveCanonicalUserUid({
            ...existingUser,
            ...userData,
            uid,
            email: normalizedEmail,
        }) || uid;

        let userCode = existingUser?.userCode;
        if (!userCode || (userData.roles && userData.roles.join() !== existingUser?.roles?.join())) {
            userCode = await generateUserCode(
                userData.roles || existingUser?.roles || [],
                userData.email || existingUser?.email || '',
            );
        }

        const updateData = {
            ...(existingUser || {}),
            uid: canonicalUid,
            name: userData.name?.trim() || existingUser?.name || '',
            phone: userData.phone || existingUser?.phone || '',
            email: normalizedEmail || existingUser?.email || '',
            roles: userData.roles || existingUser?.roles || [],
            role: primaryRole,
            primaryRole,
            userCode,
            storeIds: branchIds,
            storeId: branchIds[0],
            primaryStore: branchIds[0],
            permissions,
            isActive: userData.isActive ?? existingUser?.isActive ?? true,
            status: (userData.isActive ?? existingUser?.isActive ?? true)
                ? 'active' : 'inactive',
            notes: userData.notes ?? existingUser?.notes ?? '',
            updatedBy: currentAdmin.uid,
            _syncStatus: 'pending',
        };

        // ── STEP 1: IDB first ────────────────────────────────────
        if (uid !== canonicalUid) {
            await localDeleteUser(uid);
        }
        await localSaveUser(updateData);
        await logAction('user_updated_local', { uid: canonicalUid, userCode, legacyUid: uid });

        notify.success('✅ Updated locally', {
            id: toastId, duration: 1500, style: TS.success,
        });

        // ── STEP 2: Sync queue ───────────────────────────────────
        const queueId = await addToSyncQueue({
            type: 'update_user',
            operation: 'update',
            collection: 'users',
            docId: canonicalUid,
            data: updateData,
            priority: 2,
        });

        // ── STEP 3: Firebase (if online) ─────────────────────────
        if (!navigator.onLine) {
            notify.info('📡 Offline — will sync when online', {
                icon: '⏳', style: TS.warn,
            });
            return { success: true, syncedToCloud: false, userCode, uid: canonicalUid };
        }

        toastId = notify.loading('☁️ Syncing…', { style: TS.base });

        try {
            await setDoc(doc(db, 'users', canonicalUid), {
                ...updateData,
                updatedAt: serverTimestamp(),
            }, { merge: true });

            await localMarkSynced(canonicalUid);
            if (queueId) await dbDelete(STORES.SYNC_QUEUE, queueId);
            await logAction('user_updated_synced', { uid: canonicalUid });

            notify.success('☁️ Synced to cloud', {
                id: toastId, duration: 2000, style: TS.success,
            });

            return { success: true, syncedToCloud: true, userCode, uid: canonicalUid };

        } catch (fbErr) {
            if (queueId) await markSyncFailed(queueId, fbErr);

            notify.error('⚠️ Cloud sync failed — will retry\n💾 Local saved', {
                id: toastId, duration: 4000, style: TS.warn,
            });

            return { success: true, syncedToCloud: false, error: fbErr.message, userCode, uid: canonicalUid };
        }

    } catch (err) {
        console.error('[userSync] updateUser:', err);
        notify.error(`❌ ${err.message}`, { id: toastId, style: TS.error });
        return { success: false, error: err.message };
    }
};

// ══════════════════════════════════════════════════════════════
// DELETE USER — SuperAdmin ONLY, Hard Delete
// §7: SuperAdmin-only, deletes from both DBs
// ══════════════════════════════════════════════════════════════
export const deleteUser = async (uid, currentAdmin) => {
    // §7: SuperAdmin only
    if (!_isSuperAdmin(currentAdmin)) {
        toast.error('🚫 Only Super Admin can delete users', { style: TS.error });
        return { success: false, error: 'Permission denied' };
    }

    // Temp users (not yet synced) — local delete only
    if (uid.startsWith('temp_')) {
        await localDeleteUser(uid);
        toast.success('🗑️ Local user removed', { style: TS.success });
        return { success: true };
    }

    let toastId = toast.loading('🗑️ Deleting…', { style: TS.base });

    try {
        // ── Delete from Firebase FIRST (requires online for real UID) ──
        if (navigator.onLine) {
            try {
                let userEmail = '';
                try {
                    const localUser = await localGetUser(uid);
                    userEmail = localUser?.email || '';
                    if (!userEmail) {
                        const snap = await getDoc(doc(db, 'users', uid));
                        userEmail = snap.data()?.email || '';
                    }
                } catch { /* ignore */ }

                // 🔥 Delete Firebase Auth account (Blaze + Cloud Function — optional on Spark)
                let authDeleteSkipped = false;
                try {
                    const authResult = await deleteUserAccount(uid);
                    if (authResult?.skipped) {
                        authDeleteSkipped = true;
                        console.info('[userSync] Auth delete skipped:', authResult.message);
                    }
                } catch (authErr) {
                    console.warn('[userSync] Firebase Auth delete failed (might be already deleted):', authErr?.message);
                }

                if (userEmail) {
                    await saveUserTombstone({
                        uid,
                        email: userEmail,
                        deletedBy: currentAdmin.uid,
                    }).catch(() => {});
                }
                
                // 🗑 Delete Firestore Document — blocks POS login even without Auth delete
                await deleteDoc(doc(db, 'users', uid));
                toast.success(
                    authDeleteSkipped
                        ? '☁️ Removed from POS (login blocked). Auth record may remain until Blaze deploy.'
                        : '☁️ Deleted from cloud',
                    { id: toastId, duration: authDeleteSkipped ? 3500 : 1000, style: TS.success },
                );
                // Successfully deleted everywhere -> hard delete locally
                await localDeleteUser(uid);
                await logAction('user_deleted_hard', { uid, by: currentAdmin.uid });
                toast.success('🗑️ User permanently deleted', { duration: 2500, style: TS.success });
                return { success: true };
            } catch (fbErr) {
                // If Firestore delete fails — queue it
                console.warn('[userSync] Firebase delete failed:', fbErr?.message);
                toast.error(
                    `⚠️ Cloud delete failed: ${fbErr.message}\n💾 Queued for deletion`,
                    { id: toastId, duration: 3000, style: TS.warn }
                );
                await addToSyncQueue({
                    type: 'delete_user',
                    operation: 'delete',
                    collection: 'users',
                    docId: uid,
                    priority: 1,
                });
                
                // Hide locally but don't delete so it doesn't get restored
                const existing = await localGetUser(uid);
                if (existing) {
                    await localSaveUser({ ...existing, isDeleted: true, _hardDeleted: true, _syncStatus: 'pending' });
                }
                await logAction('user_deleted_hard_offline', { uid, by: currentAdmin.uid });
                return { success: true };
            }
        } else {
            // Offline: mark for deletion, will sync later
            await addToSyncQueue({
                type: 'delete_user',
                operation: 'delete',
                collection: 'users',
                docId: uid,
                priority: 1,
            });
            toast('📡 Offline — will delete from cloud when online', {
                icon: '⏳', style: TS.warn,
            });
            
            // Hide locally but don't delete so it doesn't get restored
            const existing = await localGetUser(uid);
            if (existing) {
                await localSaveUser({ ...existing, isDeleted: true, _hardDeleted: true, _syncStatus: 'pending' });
            }
            await logAction('user_deleted_hard_offline', { uid, by: currentAdmin.uid });
            return { success: true };
        }
        return { success: true };

    } catch (err) {
        console.error('[userSync] deleteUser:', err);
        toast.error(`❌ Delete failed: ${err.message}`, {
            id: toastId, style: TS.error,
        });
        return { success: false, error: err.message };
    }
};

// ══════════════════════════════════════════════════════════════
// FETCH USERS — Offline-first
// §1: Returns IDB instantly, syncs Firebase in background
// ✅ FIX: Handles old docs without isDeleted field
// ══════════════════════════════════════════════════════════════
export const fetchUsersOfflineFirst = async (storeId = null) => {
    // STEP 1: Return local IMMEDIATELY
    let localUsers = await localGetAllUsers();

    if (storeId) {
        localUsers = localUsers.filter(u =>
            !u.storeIds?.length || u.storeIds.includes(storeId)
        );
    }

    // STEP 2: Background sync (non-blocking)
    if (navigator.onLine) {
        processSyncQueue().catch(err =>
            console.warn('[userSync] processSyncQueue failed:', err?.message)
        );
        _syncUsersFromFirebase(storeId).catch(err =>
            console.warn('[userSync] background sync failed:', err?.message)
        );
    }

    return localUsers;
};

// ── Background Firebase → IDB sync ──────────────────────────
const _syncUsersFromFirebase = async (storeId = null, options = {}) => {
    const { silent = false } = options;
    try {
        // ✅ FIX: No isDeleted filter in query
        // Old docs may not have this field
        const snap = await getDocs(collection(db, 'users'));

        const fbUsers = snap.docs
            .map(d => ({ id: d.id, ...d.data(), uid: d.data().uid || d.id }))
            .filter(u => u.isDeleted !== true); // JS-level filter (handles missing field)

        // Repair legacy docs stored under wrong document id (e.g. userCode vs Auth uid)
        for (const d of snap.docs) {
            const data = d.data();
            const canonicalUid = data.uid && !String(data.uid).startsWith('temp_') ? data.uid : null;
            if (canonicalUid && d.id !== canonicalUid) {
                try {
                    await setDoc(doc(db, 'users', canonicalUid), {
                        ...data,
                        uid: canonicalUid,
                        email: (data.email || '').trim().toLowerCase(),
                        _legacyDocId: d.id,
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                } catch (repairErr) {
                    console.warn('[userSync] profile path repair skipped:', d.id, repairErr?.message);
                }
            }
        }

        const added = [];
        const updated = [];
        const removed = [];

        // Merge strategy: Firebase wins if newer
        for (const fbUser of fbUsers) {
            if (storeId && fbUser.storeIds?.length && !fbUser.storeIds.includes(storeId)) {
                continue;
            }

            const local = await localGetUser(fbUser.uid);
            const fbTime = fbUser.updatedAt?.toMillis?.() || fbUser.updatedAt || 0;
            const locTime = local?._localUpdatedAt || 0;

            // Firebase wins if no local OR Firebase is newer
            // But DON'T overwrite pending local changes
            if (!local) {
                added.push(fbUser);
                await localSaveUser({
                    ...fbUser,
                    _syncStatus: 'synced',
                    _syncedAt: Date.now(),
                });
            } else if (fbTime > locTime && local._syncStatus !== 'pending') {
                updated.push(fbUser);
                await localSaveUser({
                    ...fbUser,
                    _syncStatus: 'synced',
                    _syncedAt: Date.now(),
                });
            }
        }

        // Remove local users deleted from another device
        const fbUidSet = new Set(fbUsers.map(u => u.uid));
        const localAll = await localGetAllUsers();

        for (const lu of localAll) {
            const isTempUser = lu.uid?.startsWith('temp_');
            const isPending = lu._syncStatus === 'pending';
            const notInFirebase = !fbUidSet.has(lu.uid);

            // Only remove if: not temp, not pending, not in Firebase
            if (!isTempUser && !isPending && notInFirebase) {
                removed.push(lu);
                await localDeleteUser(lu.uid);
                console.log(`[userSync] Removed stale local user: ${lu.uid}`);
            }
        }

        if (added.length || updated.length || removed.length) {
            const parts = [];
            if (added.length) parts.push(`${added.length} added`);
            if (updated.length) parts.push(`${updated.length} updated`);
            if (removed.length) parts.push(`${removed.length} removed`);
            const msg = `🔁 Firebase sync: ${parts.join(', ')}`;
            if (silent) {
                console.log(`[userSync] ${msg}`);
            } else {
                toastOnce('firebase-user-sync', () => toast.success(msg));
            }
        }

        console.log(`[userSync] ✅ Background sync complete (${fbUsers.length} users)`);
    } catch (err) {
        console.warn('[userSync] _syncUsersFromFirebase failed:', err?.message);
        throw err;
    }
};

// ══════════════════════════════════════════════════════════════
// PROCESS SYNC QUEUE
// §5: FIFO + exponential backoff + dead-letter
// Call on: app start, network restore
// ══════════════════════════════════════════════════════════════
export const processSyncQueue = async () => {
    if (!navigator.onLine) return;
    if (_syncQueueLock) return;
    if (Date.now() - _lastSyncQueueAt < SYNC_QUEUE_COOLDOWN_MS) return;

    _syncQueueLock = true;
    _lastSyncQueueAt = Date.now();

    try {
    const items = await getPendingSyncItems();
    if (!items.length) return;

    console.log(`[userSync] Processing ${items.length} queued operations`);

    for (const item of items) {
        const qid = syncQueueKey(item);
        if (qid == null) {
            console.warn('[userSync] Skipping sync queue item without queueId:', item?.type);
            continue;
        }
        try {
            await updateSyncQueueItem(qid, 'syncing', {
                attempts: (item.attempts || 0) + 1,
            });

            if (item.type === 'create_user') {
                const { _tempUid, _currentAdminUid, _currentAdminRoles, ...userData } = item.data;
                const fakeAdmin = {
                    uid: _currentAdminUid,
                    roles: _currentAdminRoles?.length ? _currentAdminRoles : ['superAdmin'],
                };

                let firebaseUid = item.data?.firebaseUid || null;
                if (!firebaseUid) {
                    const existingByEmail = await findLocalUserByEmail(userData.email);
                    firebaseUid = existingByEmail?.uid || null;
                }

                // Check if already created (idempotent)
                if (_tempUid) {
                    const local = await localGetUser(_tempUid);
                    if (local && !local.uid.startsWith('temp_')) {
                        // Already synced
                        await dbDelete(STORES.SYNC_QUEUE, qid);
                        continue;
                    }
                }

                if (firebaseUid) {
                    const docId = firebaseUid;
                    const mergedRoles = userData.roles || [];
                    const firestoreData = {
                        uid: docId,
                        name: userData.name?.trim() || '',
                        email: userData.email?.trim().toLowerCase() || '',
                        phone: userData.phone || '',
                        roles: mergedRoles,
                        role: getPrimaryRole(mergedRoles),
                        primaryRole: getPrimaryRole(mergedRoles),
                        userCode: userData.userCode || await generateUserCode(mergedRoles, userData.email),
                        storeIds: userData.storeIds || [],
                        storeId: userData.primaryStore || userData.storeIds?.[0] || '',
                        primaryStore: userData.primaryStore || userData.storeIds?.[0] || '',
                        permissions: mergePermissions(mergedRoles),
                        isActive: userData.isActive !== false,
                        status: userData.isActive !== false ? 'active' : 'inactive',
                        notes: userData.notes || '',
                        loginCount: userData.loginCount || 0,
                        lastLogin: userData.lastLogin || null,
                        isDeleted: false,
                        deletedAt: null,
                        createdBy: _currentAdminUid || 'system',
                        updatedBy: _currentAdminUid || 'system',
                    };

                    try {
                        await setDoc(doc(db, 'users', docId), {
                            ...firestoreData,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        }, { merge: true });

                        if (_tempUid) await localDeleteUser(_tempUid);
                        await localSaveUser({
                            ...firestoreData,
                            uid: docId,
                            _syncStatus: 'synced',
                            _syncedAt: Date.now(),
                        });

                        await dbDelete(STORES.SYNC_QUEUE, qid);
                        continue;
                    } catch (err) {
                        console.warn('[userSync] Retried create_user Firestore write failed:', err?.message);
                        await markSyncFailed(qid, err);
                        continue;
                    }
                }

                const result = await createUser(
                    { ...userData, _tempUid },
                    fakeAdmin,
                    false,
                    {
                        silentToast: true,
                        fromSyncQueue: true,
                        trustSuperAdmin: true,
                    },
                );
                if (result.success && result.syncedToCloud) {
                    await dbDelete(STORES.SYNC_QUEUE, qid);
                } else if (result.error === 'Permission denied') {
                    await dbDelete(STORES.SYNC_QUEUE, qid);
                } else {
                    await markSyncFailed(qid, new Error(result.error || 'Sync failed'));
                }

            } else if (item.type === 'update_user') {
                await updateDoc(doc(db, 'users', item.docId), {
                    ...item.data,
                    updatedAt: serverTimestamp(),
                });
                await localMarkSynced(item.docId);
                await dbDelete(STORES.SYNC_QUEUE, qid);

            } else if (item.type === 'delete_user') {
                try {
                    const authResult = await deleteUserAccount(item.docId);
                    if (authResult?.skipped) {
                        console.info('[userSync] Deferred auth delete skipped (Spark / no function)');
                    }
                } catch (authErr) {
                    console.warn('[userSync] Deferred auth delete failed:', authErr?.message);
                }
                await deleteDoc(doc(db, 'users', item.docId));
                await localDeleteUser(item.docId);
                await dbDelete(STORES.SYNC_QUEUE, qid);
            }

        } catch (err) {
            console.warn(`[userSync] Queue item ${qid} failed:`, err?.message);
            await markSyncFailed(qid, err);
        }
    }
    } finally {
        _syncQueueLock = false;
    }
};

// ── Auto-process on network restore ─────────────────────────
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        console.log('[userSync] 🌐 Online — processing queue');
        processSyncQueue().catch(console.warn);
    });
}

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════
export default {
    createUser,
    updateUser,
    deleteUser,
    fetchUsersOfflineFirst,
    repairAllUserProfiles,
    resolveCanonicalUserUid,
    checkEmailUnique,
    generateUserCode,
    localGetAllUsers,
    localGetUser,
    localSaveUser,
    localDeleteUser,
    normalizeUserRoles,
    subscribeToUserChanges,
    processSyncQueue,
};