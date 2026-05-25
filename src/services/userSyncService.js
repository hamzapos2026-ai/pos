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
    doc, setDoc, updateDoc, deleteDoc,
    collection, getDocs, serverTimestamp,
    query, where,
} from './firebase';
import toast from 'react-hot-toast';

import { db } from './firebase';
import { createAuthUser, sendWelcomeEmail } from './secondaryFirebase';
import { deleteUserAccount } from './firebaseUserService';
import {
    STORES, dbPut, dbGet, dbGetAll, dbDelete,
    addToSyncQueue, getPendingSyncItems,
    markSyncFailed, updateSyncQueueItem,
    logAction,
} from './indexedDBService';
import {
    getPrimaryRole, mergePermissions,
} from '../utils/rolePermissions';

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
export const normalizeUserRoles = (user) => {
    if (!user) return [];
    if (Array.isArray(user.roles) && user.roles.length > 0) return user.roles;
    if (typeof user.role === 'string' && user.role) return [user.role];
    return [];
};

const _isSuperAdmin = (user) => {
    const roles = normalizeUserRoles(user);
    return roles.some(r => ['superAdmin', 'superadmin', 'super_admin'].includes(r));
};

const _isAdminOrAbove = (user) => {
    const roles = normalizeUserRoles(user);
    return roles.some(r =>
        ['superAdmin', 'superadmin', 'super_admin', 'admin'].includes(r)
    );
};

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
    return all.filter(u => !u._hardDeleted && u.isDeleted !== true);
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
export const createUser = async (userData, currentAdmin, sendWelcome = true) => {
    // Permission check
    if (!_isAdminOrAbove(currentAdmin)) {
        toast.error('🚫 Only Admin can create users', { style: TS.error });
        return { success: false, error: 'Permission denied' };
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
                toast.error('🚫 Super Admin Already Exists', { style: TS.error });
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
    if (!userData.storeIds?.length) {
        return { success: false, error: 'At least one branch required' };
    }

    // Generate userCode
    const userCode = userData.userCode
        || await generateUserCode(userData.roles, userData.email);

    // Reuse existing tempUid if this is a sync retry
    const tempUid = userData._tempUid || `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let toastId = toast.loading('💾 Saving locally…', { style: TS.base });

    try {
        // ── Build base document ──────────────────────────────────
        const primaryRole = getPrimaryRole(userData.roles);
        const permissions = mergePermissions(userData.roles);

        const baseDoc = {
            uid: tempUid,
            name: userData.name.trim(),
            email: userData.email.trim().toLowerCase(),
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

        toast.success('✅ Saved locally', {
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
                firebaseUid: null,
            },
            priority: 1,
        });

        // ── STEP 3: If offline — done for now ───────────────────
        if (!navigator.onLine) {
            toast('📡 Offline — will sync when online', {
                icon: '⏳', duration: 3000, style: TS.warn,
            });
            return {
                success: true, uid: tempUid,
                syncedToCloud: false, offline: true, userCode,
            };
        }

        toastId = toast.loading('☁️ Syncing to cloud…', { style: TS.base });

        // ── STEP 3a: Create Firebase Auth (secondary app) ────────
        let firebaseUid;
        try {
            const authResult = await createAuthUser(
                baseDoc.email,
                userData.password,
                baseDoc.name,
            );
            firebaseUid = authResult.uid;

            if (queueId) {
                await updateSyncQueueItem(queueId, 'pending', {
                    data: {
                        ...userData,
                        userCode,
                        _tempUid: tempUid,
                        _currentAdminUid: currentAdmin.uid,
                        firebaseUid,
                    }
                });
            }
        } catch (authErr) {
            toast.error(
                `⚠️ Auth failed: ${authErr.message}\n💾 Saved locally — will retry`,
                { id: toastId, duration: 5000, style: TS.error }
            );
            await logAction('user_auth_failed', {
                tempUid, error: authErr.message, code: authErr.code,
            });
            // Keep in sync queue for retry
            return {
                success: true, uid: tempUid,
                syncedToCloud: false, error: authErr.message, userCode,
            };
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

            toast.success(`☁️ ${baseDoc.name} synced to cloud`, {
                id: toastId, duration: 2500, style: TS.success,
            });

            // ── STEP 4: Welcome email (non-blocking) ────────────────
            if (sendWelcome) {
                sendWelcomeEmail(baseDoc.email).then(sent => {
                    if (sent) {
                        toast.success(`📧 Welcome email sent`, {
                            duration: 2000, style: TS.success,
                        });
                    }
                });
            }

            return {
                success: true, uid: firebaseUid,
                syncedToCloud: true, userCode,
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

            toast.error(
                `⚠️ Firestore write failed\n💾 Auth created, local preserved`,
                { id: toastId, duration: 5000, style: TS.error }
            );
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
        toast.error(`❌ ${err.message}`, { id: toastId, style: TS.error });
        return { success: false, error: err.message };
    }
};

// ══════════════════════════════════════════════════════════════
// UPDATE USER
// §1: IDB-first → Firebase background
// ══════════════════════════════════════════════════════════════
export const updateUser = async (uid, userData, currentAdmin) => {
    if (!_isAdminOrAbove(currentAdmin)) {
        toast.error('🚫 Only Admin can update users', { style: TS.error });
        return { success: false, error: 'Permission denied' };
    }

    let toastId = toast.loading('💾 Updating locally…', { style: TS.base });

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
                    toast.error('🚫 Another Super Admin Already Exists', { style: TS.error });
                    return { success: false, error: 'Super Admin Already Exists' };
                }
            } catch(err) {
                console.warn('[userSync] Error checking duplicate super admin:', err);
            }
        }

        // Regenerate userCode if roles changed
        const existingUser = await localGetUser(uid);
        let userCode = existingUser?.userCode;
        if (!userCode || (userData.roles && userData.roles.join() !== existingUser?.roles?.join())) {
            userCode = await generateUserCode(
                userData.roles || existingUser?.roles || [],
                userData.email || existingUser?.email || '',
            );
        }

        const updateData = {
            ...(existingUser || {}),
            uid,
            name: userData.name?.trim() || existingUser?.name || '',
            phone: userData.phone || existingUser?.phone || '',
            roles: userData.roles || existingUser?.roles || [],
            role: primaryRole,
            primaryRole,
            userCode,
            storeIds: userData.storeIds || existingUser?.storeIds || [],
            storeId: userData.primaryStore || existingUser?.storeId || '',
            primaryStore: userData.primaryStore || existingUser?.primaryStore || '',
            permissions,
            isActive: userData.isActive ?? existingUser?.isActive ?? true,
            status: (userData.isActive ?? existingUser?.isActive ?? true)
                ? 'active' : 'inactive',
            notes: userData.notes ?? existingUser?.notes ?? '',
            updatedBy: currentAdmin.uid,
            _syncStatus: 'pending',
        };

        // ── STEP 1: IDB first ────────────────────────────────────
        await localSaveUser(updateData);
        await logAction('user_updated_local', { uid, userCode });

        toast.success('✅ Updated locally', {
            id: toastId, duration: 1500, style: TS.success,
        });

        // ── STEP 2: Sync queue ───────────────────────────────────
        const queueId = await addToSyncQueue({
            type: 'update_user',
            operation: 'update',
            collection: 'users',
            docId: uid,
            data: updateData,
            priority: 2,
        });

        // ── STEP 3: Firebase (if online) ─────────────────────────
        if (!navigator.onLine) {
            toast('📡 Offline — will sync when online', {
                icon: '⏳', style: TS.warn,
            });
            return { success: true, syncedToCloud: false, userCode };
        }

        toastId = toast.loading('☁️ Syncing…', { style: TS.base });

        try {
            await updateDoc(doc(db, 'users', uid), {
                ...updateData,
                updatedAt: serverTimestamp(),
            });

            await localMarkSynced(uid);
            if (queueId) await dbDelete(STORES.SYNC_QUEUE, queueId);
            await logAction('user_updated_synced', { uid });

            toast.success('☁️ Synced to cloud', {
                id: toastId, duration: 2000, style: TS.success,
            });

            return { success: true, syncedToCloud: true, userCode };

        } catch (fbErr) {
            if (queueId) await markSyncFailed(queueId, fbErr);

            toast.error('⚠️ Cloud sync failed — will retry\n💾 Local saved', {
                id: toastId, duration: 4000, style: TS.warn,
            });

            return { success: true, syncedToCloud: false, error: fbErr.message, userCode };
        }

    } catch (err) {
        console.error('[userSync] updateUser:', err);
        toast.error(`❌ ${err.message}`, { id: toastId, style: TS.error });
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
                // 🔥 Delete Firebase Auth account
                try {
                    await deleteUserAccount(uid);
                } catch (authErr) {
                    console.warn('[userSync] Firebase Auth delete failed (might be already deleted):', authErr?.message);
                    // We continue even if auth delete fails to ensure Firestore doc is deleted
                }
                
                // 🗑 Delete Firestore Document
                await deleteDoc(doc(db, 'users', uid));
                toast.success('☁️ Deleted from cloud', {
                    id: toastId, duration: 1000, style: TS.success,
                });
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
const _syncUsersFromFirebase = async (storeId = null) => {
    try {
        // ✅ FIX: No isDeleted filter in query
        // Old docs may not have this field
        const snap = await getDocs(collection(db, 'users'));

        const fbUsers = snap.docs
            .map(d => ({ id: d.id, uid: d.id, ...d.data() }))
            .filter(u => u.isDeleted !== true); // JS-level filter (handles missing field)

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
            toast.success(`🔁 Firebase sync: ${parts.join(', ')}`);
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

    const items = await getPendingSyncItems();
    if (!items.length) return;

    console.log(`[userSync] Processing ${items.length} queued operations`);

    for (const item of items) {
        try {
            await updateSyncQueueItem(item.id, 'syncing', {
                attempts: (item.attempts || 0) + 1,
            });

            if (item.type === 'create_user') {
                // Retry user creation or finish an auth-only partial sync
                const { _tempUid, _currentAdminUid, ...userData } = item.data;
                const fakeAdmin = { uid: _currentAdminUid };

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
                        await dbDelete(STORES.SYNC_QUEUE, item.id);
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

                        await dbDelete(STORES.SYNC_QUEUE, item.id);
                        continue;
                    } catch (err) {
                        console.warn('[userSync] Retried create_user Firestore write failed:', err?.message);
                        await markSyncFailed(item.id, err);
                        continue;
                    }
                }

                const result = await createUser({ ...userData, _tempUid }, fakeAdmin, false);
                if (result.success && result.syncedToCloud) {
                    await dbDelete(STORES.SYNC_QUEUE, item.id);
                } else {
                    await markSyncFailed(item.id, new Error(result.error || 'Sync failed'));
                }

            } else if (item.type === 'update_user') {
                await updateDoc(doc(db, 'users', item.docId), {
                    ...item.data,
                    updatedAt: serverTimestamp(),
                });
                await localMarkSynced(item.docId);
                await dbDelete(STORES.SYNC_QUEUE, item.id);

            } else if (item.type === 'delete_user') {
                try {
                    await deleteUserAccount(item.docId);
                } catch (authErr) {
                    console.warn('[userSync] Deferred auth delete failed:', authErr?.message);
                }
                await deleteDoc(doc(db, 'users', item.docId));
                await localDeleteUser(item.docId);
                await dbDelete(STORES.SYNC_QUEUE, item.id);
            }

        } catch (err) {
            console.warn(`[userSync] Queue item ${item.id} failed:`, err?.message);
            await markSyncFailed(item.id, err);
        }
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