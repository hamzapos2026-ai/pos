// src/pages/admin/UserManagement.jsx
// ✅ MASTER PROMPT v3 — PRODUCTION FINAL
// ✅ §1:  Offline-first via userSyncService (correct API)
// ✅ §5:  Sync status badges per user row
// ✅ §7:  Hard delete SuperAdmin only
// ✅ §9:  BroadcastChannel — real-time cross-tab user updates
// ✅ §14: IDB-first data flow
// ✅ §17: Backward compat — old docs without isDeleted
// ✅ FIX: fetchUsersOfflineFirst correct usage
// ✅ FIX: toggleUserStatus + sendPasswordReset inline
// ✅ FIX: No duplicate fetch (onSnapshot removed)
// ✅ FIX: currentAdmin from useAuth context
// ✅ FIX: storeName everywhere

import {
  useState, useMemo, useCallback,
  useEffect, useRef,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  sendPasswordResetEmail,
} from 'firebase/auth';
import {
  doc, updateDoc, serverTimestamp,
} from '../../services/firebase';
import { db, auth } from '../../services/firebase';
import {
  Users, UserPlus, Search, Filter, RotateCcw,
  Edit3, KeyRound, Ban, Trash2, ChevronLeft,
  ChevronRight, ChevronDown, Crown, ShieldCheck,
  Receipt, CreditCard, MoreVertical, CheckCircle2,
  XCircle, AlertTriangle, X, Loader2, ArrowUpDown,
  ArrowUp, ArrowDown, Clock, Building2, Mail,
  Shield, UserCheck, UserX, RefreshCw, WifiOff,
  CheckCircle, AlertCircle, Database, Wifi,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import UserForm from '../../components/admin/UserForm';
import { ROLE_INFO, getPrimaryRole } from '../../utils/rolePermissions';
import {
  fetchUsersOfflineFirst,
  deleteUser as hardDeleteUser,
  localSaveUser,
  subscribeToUserChanges,
  processSyncQueue,
  normalizeUserRoles,
} from '../../services/userSyncService';
import { useAuth } from '../../context/AuthContext';

const cn = (...inputs) => twMerge(clsx(inputs));

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════
const USERS_PER_PAGE = 10;

const ROLE_ICON_MAP = {
  Crown, ShieldCheck,
  Users: UserCheck,
  Receipt, CreditCard,
};

const getRoleIcon = (role) => {
  const info = ROLE_INFO?.[role];
  return ROLE_ICON_MAP[info?.icon] || Shield;
};

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
const toDate = (v) => {
  if (!v) return null;
  try {
    if (v?.toDate) return v.toDate();
    if (v?.seconds) return new Date(v.seconds * 1000);
    if (typeof v === 'number') return new Date(v);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
};

const getRelativeTime = (v) => {
  const date = toDate(v);
  if (!date) return 'Never';
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
};

// ✅ storeName first, then name (Master Prompt + backward compat)
const getStoreName = (store) => {
  if (!store) return '';
  return (store.storeName || store.name || '')
    .replace('A One Jewelry - ', '')
    .replace('A One Jewellery - ', '')
    .trim();
};

// ══════════════════════════════════════════════════════════════
// FETCH STORES
// ══════════════════════════════════════════════════════════════
const fetchStores = async () => {
  try {
    const { getDocs, collection: col } =
      await import('firebase/firestore');
    const snap = await getDocs(col(db, 'stores'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('[UserMgmt] fetchStores:', err);
    return [];
  }
};

// ══════════════════════════════════════════════════════════════
// INLINE SERVICES (not in userSyncService yet)
// ══════════════════════════════════════════════════════════════

// Toggle user active status
const toggleUserActiveStatus = async (uid, isActive, adminUid) => {
  // Update Firestore
  try {
    await updateDoc(doc(db, 'users', uid), {
      isActive,
      status: isActive ? 'active' : 'inactive',
      updatedAt: serverTimestamp(),
      updatedBy: adminUid,
    });
  } catch (err) {
    // If offline — IDB update still works
    console.warn('[UserMgmt] toggleStatus Firebase:', err?.message);
  }

  // Always update IDB
  const { dbGet, dbPut, STORES } = await import('../../services/indexedDBService');
  const existing = await dbGet(STORES.USERS, uid);
  if (existing) {
    await dbPut(STORES.USERS, {
      ...existing,
      isActive,
      status: isActive ? 'active' : 'inactive',
      updatedAt: Date.now(),
      _syncStatus: navigator.onLine ? 'synced' : 'pending',
    });
  }
};

// Send password reset email
const sendPasswordReset = async (email) => {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
};

// ══════════════════════════════════════════════════════════════
// UI SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════

// ── User Avatar ──────────────────────────────────────────────
const UserAvatar = ({ name, primaryRole, size = 'md' }) => {
  const initials = (name || '??')
    .split(' ')
    .map(n => n?.[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const ri = ROLE_INFO?.[primaryRole];
  const sizeClass = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
  }[size] || 'h-10 w-10 text-sm';

  const colorMap = {
    amber: 'bg-amber-500/20 text-amber-400 ring-amber-500/30',
    blue: 'bg-blue-500/20 text-blue-400 ring-blue-500/30',
    purple: 'bg-purple-500/20 text-purple-400 ring-purple-500/30',
    green: 'bg-green-500/20 text-green-400 ring-green-500/30',
    orange: 'bg-orange-500/20 text-orange-400 ring-orange-500/30',
  };

  return (
    <div className="relative shrink-0">
      <div className={cn(
        'flex items-center justify-center rounded-full font-bold ring-2',
        sizeClass,
        colorMap[ri?.color] || colorMap.amber,
      )}>
        {initials}
      </div>
    </div>
  );
};

// ── Role Badge ───────────────────────────────────────────────
const RoleBadge = ({ role, size = 'sm' }) => {
  const ri = ROLE_INFO?.[role];
  if (!ri) return null;
  const Icon = getRoleIcon(role);

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-lg border font-medium whitespace-nowrap',
      ri.chipBg, ri.chipText, ri.chipBorder,
      size === 'sm'
        ? 'px-1.5 py-0.5 text-[10px]'
        : 'px-2 py-1 text-xs',
    )}>
      <Icon className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      {ri.label}
    </span>
  );
};

// ── Store Badge ──────────────────────────────────────────────
// ✅ FIX: storeName || name
const StoreBadge = ({ storeId, stores, isPrimary }) => {
  const store = stores.find(s => s.id === storeId);
  if (!store) return null;
  const displayName = getStoreName(store) || storeId.slice(0, 8) + '…';

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-lg border',
      'px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap',
      isPrimary
        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
        : 'bg-[#1a1208] text-gray-500 border-[#2a1f0d]',
    )}>
      <Building2 className="h-2.5 w-2.5" />
      {displayName}
    </span>
  );
};

// ── Status Badge ─────────────────────────────────────────────
const StatusBadge = ({ isActive }) => (
  <span className={cn(
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
    'text-[10px] font-medium whitespace-nowrap border',
    isActive
      ? 'bg-green-500/15 text-green-400 border-green-500/20'
      : 'bg-red-500/15 text-red-400 border-red-500/20',
  )}>
    {isActive
      ? <CheckCircle2 className="h-2.5 w-2.5" />
      : <XCircle className="h-2.5 w-2.5" />}
    {isActive ? 'Active' : 'Inactive'}
  </span>
);

// ── ✅ Sync Status Badge — §5 requirement ────────────────────
const SyncBadge = ({ status }) => {
  if (!status || status === 'synced') {
    return (
      <span title="Synced to cloud"
        className="inline-flex items-center text-[9px] text-green-500/60">
        <CheckCircle className="h-2.5 w-2.5" />
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span title="Pending sync — will sync when online"
        className="inline-flex items-center text-[9px] text-orange-400/80">
        <Database className="h-2.5 w-2.5 animate-pulse" />
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span title="Sync failed — check connection"
        className="inline-flex items-center text-[9px] text-red-400/80">
        <AlertCircle className="h-2.5 w-2.5" />
      </span>
    );
  }
  return null;
};

// ── Stat Card ────────────────────────────────────────────────
const StatCard = ({ label, value, icon: Icon, color = 'amber' }) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    let cur = 0;
    const step = value / (600 / 16);
    const interval = setInterval(() => {
      cur += step;
      if (cur >= value) { setDisplay(value); clearInterval(interval); }
      else setDisplay(Math.floor(cur));
    }, 16);
    return () => clearInterval(interval);
  }, [value]);

  const BG = { amber: 'bg-amber-500/10', green: 'bg-green-500/10', red: 'bg-red-500/10', blue: 'bg-blue-500/10', purple: 'bg-purple-500/10', orange: 'bg-orange-500/10' };
  const TEXT = { amber: 'text-amber-400', green: 'text-green-400', red: 'text-red-400', blue: 'text-blue-400', purple: 'text-purple-400', orange: 'text-orange-400' };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#2a1f0d] bg-[#1a1208] px-3 py-2.5">
      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', BG[color])}>
        <Icon className={cn('h-4 w-4', TEXT[color])} />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-gray-100 leading-none">{display}</p>
        <p className="text-[10px] text-gray-500 mt-0.5 truncate">{label}</p>
      </div>
    </div>
  );
};

// ── Confirm Dialog ───────────────────────────────────────────
const ConfirmDialog = ({
  isOpen, onClose, onConfirm,
  title, message, subMessage,
  confirmText = 'Confirm',
  confirmIcon: ConfirmIcon = Trash2,
  confirmColor = 'red',
  loading = false,
}) => {
  const BG = { red: 'bg-red-500/10', blue: 'bg-blue-500/10', orange: 'bg-orange-500/10' };
  const TEXT = { red: 'text-red-400', blue: 'text-blue-400', orange: 'text-orange-400' };
  const BORDER = { red: 'border-red-500/30', blue: 'border-blue-500/30', orange: 'border-orange-500/30' };
  const HOVER = { red: 'hover:bg-red-500/30', blue: 'hover:bg-blue-500/30', orange: 'hover:bg-orange-500/30' };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 24 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="w-full max-w-sm rounded-2xl border border-[#2a1f0d] bg-[#12100a] p-5 shadow-2xl"
          >
            <div className="text-center">
              <div className={cn(
                'mx-auto flex h-14 w-14 items-center justify-center rounded-2xl mb-4',
                BG[confirmColor],
              )}>
                <AlertTriangle className={cn('h-7 w-7', TEXT[confirmColor])} />
              </div>
              <h3 className="text-base font-bold text-gray-100 mb-2">{title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{message}</p>
              {subMessage && (
                <p className="text-xs text-gray-600 mt-2 font-mono">{subMessage}</p>
              )}
            </div>
            <div className="flex items-center gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 rounded-xl border border-[#2a1f0d] bg-[#1a1208] px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={loading}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5',
                  'text-sm font-semibold transition-all border',
                  BG[confirmColor], TEXT[confirmColor],
                  BORDER[confirmColor], HOVER[confirmColor],
                  'disabled:opacity-40',
                )}
              >
                {loading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                  : <><ConfirmIcon className="h-4 w-4" /> {confirmText}</>
                }
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── Skeleton Row (desktop) ───────────────────────────────────
const SkeletonRow = ({ index }) => (
  <motion.tr
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: index * 0.05 }}
    className="border-b border-[#1a1208]"
  >
    {[1, 2, 3, 4, 5, 6].map(c => (
      <td key={c} className="px-3 py-3.5">
        <div className="h-4 rounded-lg bg-[#1f1a0e] animate-pulse" />
      </td>
    ))}
  </motion.tr>
);

// ── Skeleton Card (mobile) ───────────────────────────────────
const SkeletonCard = ({ index }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: index * 0.05 }}
    className="rounded-xl border border-[#2a1f0d] bg-[#1a1208] p-3 space-y-3"
  >
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-full bg-[#1f1a0e] animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-32 rounded-lg bg-[#1f1a0e] animate-pulse" />
        <div className="h-3 w-44 rounded-lg bg-[#1f1a0e] animate-pulse" />
      </div>
    </div>
  </motion.div>
);

// ── Error State ──────────────────────────────────────────────
const ErrorState = ({ error, onRetry }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center px-4">
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 mb-4">
      <WifiOff className="h-7 w-7 text-red-400" />
    </div>
    <p className="text-sm font-semibold text-gray-300 mb-1">
      Failed to load users
    </p>
    <p className="text-xs text-gray-500 mb-4 max-w-xs">{error}</p>
    <button
      type="button"
      onClick={onRetry}
      className="flex items-center gap-2 rounded-xl border border-[#2a1f0d] bg-[#1a1208] px-4 py-2 text-xs text-amber-500 hover:text-amber-400 transition-colors"
    >
      <RefreshCw className="h-3.5 w-3.5" />
      Try Again
    </button>
  </div>
);

// ── Mobile Card ──────────────────────────────────────────────
const MobileUserCard = ({
  user, stores, isSuperAdmin,
  onEdit, onResetPassword,
  onToggleStatus, onDelete,
  index,
}) => {
  const [showActions, setShowActions] = useState(false);
  const primaryRole = user.primaryRole
    || getPrimaryRole(user.roles || [])
    || user.role
    || 'biller';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
      className="rounded-xl border border-[#2a1f0d] bg-[#1a1208] overflow-hidden"
    >
      <div className="p-3">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <UserAvatar name={user.name} primaryRole={primaryRole} size="md" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-gray-200 truncate">
                  {user.name || 'Unknown'}
                </p>
                {/* ✅ §5: Sync badge */}
                <SyncBadge status={user._syncStatus} />
              </div>
              <p className="text-[10px] text-gray-500 truncate">
                {user.email}
              </p>
              {/* userCode */}
              {user.userCode && (
                <p className="text-[9px] text-amber-500/60 font-mono">
                  {user.userCode}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <StatusBadge isActive={user.isActive !== false} />
            <button
              type="button"
              onClick={() => setShowActions(v => !v)}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-[#0f0a04] transition-colors"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Roles */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {(user.roles || (user.role ? [user.role] : [])).map(role => (
            <RoleBadge key={role} role={role} />
          ))}
        </div>

        {/* Stores + last login */}
        <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-[#0f0a04]">
          <div className="flex flex-wrap gap-1 min-w-0">
            {(user.storeIds || []).slice(0, 2).map(sid => (
              <StoreBadge
                key={sid}
                storeId={sid}
                stores={stores}
                isPrimary={sid === user.primaryStore}
              />
            ))}
            {(user.storeIds || []).length > 2 && (
              <span className="text-[10px] text-gray-600">
                +{user.storeIds.length - 2}
              </span>
            )}
          </div>
          <span className="text-[10px] text-gray-600 flex items-center gap-1 shrink-0 ml-2">
            <Clock className="h-2.5 w-2.5" />
            {getRelativeTime(user.lastLogin)}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <AnimatePresence>
        {showActions && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-[#2a1f0d]"
          >
            <div className="grid grid-cols-4 divide-x divide-[#2a1f0d]">
              <button
                type="button"
                onClick={() => { onEdit(user); setShowActions(false); }}
                className="flex flex-col items-center gap-1 py-3 text-amber-500 hover:bg-amber-500/5 transition-colors"
              >
                <Edit3 className="h-4 w-4" />
                <span className="text-[9px]">Edit</span>
              </button>
              <button
                type="button"
                onClick={() => { isSuperAdmin && onResetPassword(user); setShowActions(false); }}
                disabled={!isSuperAdmin}
                className={cn(
                  'flex flex-col items-center gap-1 py-3 transition-colors',
                  isSuperAdmin ? 'text-blue-500 hover:bg-blue-500/5' : 'text-gray-600 cursor-not-allowed'
                )}
              >
                <KeyRound className="h-4 w-4" />
                <span className="text-[9px]">Reset</span>
              </button>
              <button
                type="button"
                onClick={() => { onToggleStatus(user); setShowActions(false); }}
                className={cn(
                  'flex flex-col items-center gap-1 py-3 transition-colors',
                  user.isActive
                    ? 'text-orange-500 hover:bg-orange-500/5'
                    : 'text-green-500 hover:bg-green-500/5',
                )}
              >
                {user.isActive
                  ? <Ban className="h-4 w-4" />
                  : <CheckCircle2 className="h-4 w-4" />}
                <span className="text-[9px]">
                  {user.isActive ? 'Disable' : 'Enable'}
                </span>
              </button>
              {/* Delete — only super admin */}
              <button
                type="button"
                onClick={() => { onDelete(user); setShowActions(false); }}
                disabled={!isSuperAdmin}
                className={cn(
                  'flex flex-col items-center gap-1 py-3 transition-colors',
                  isSuperAdmin
                    ? 'text-red-500 hover:bg-red-500/5'
                    : 'text-gray-600 cursor-not-allowed',
                )}
              >
                <Trash2 className="h-4 w-4" />
                <span className="text-[9px]">Delete</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ── Desktop Row ──────────────────────────────────────────────
const DesktopUserRow = ({
  user, stores, isSuperAdmin,
  onEdit, onResetPassword,
  onToggleStatus, onDelete,
  index,
}) => {
  const primaryRole = user.primaryRole
    || getPrimaryRole(user.roles || [])
    || user.role
    || 'biller';

  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      className="border-b border-[#1a1208] hover:bg-[#0f0a04]/60 transition-colors group"
    >
      {/* User info */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <UserAvatar name={user.name} primaryRole={primaryRole} size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-gray-200 truncate max-w-[130px]">
                {user.name || 'Unknown'}
              </p>
              {/* ✅ §5: Sync status */}
              <SyncBadge status={user._syncStatus} />
            </div>
            <p className="text-[10px] text-gray-500 truncate max-w-[150px]">
              {user.email}
            </p>
            {user.userCode && (
              <p className="text-[9px] text-amber-500/50 font-mono">
                {user.userCode}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Roles */}
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1">
          {(user.roles || (user.role ? [user.role] : [])).map(role => (
            <RoleBadge key={role} role={role} />
          ))}
        </div>
      </td>

      {/* Stores */}
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1">
          {(user.storeIds || []).slice(0, 2).map(sid => (
            <StoreBadge
              key={sid}
              storeId={sid}
              stores={stores}
              isPrimary={sid === user.primaryStore}
            />
          ))}
          {(user.storeIds || []).length > 2 && (
            <span className="text-[10px] text-gray-600">
              +{user.storeIds.length - 2}
            </span>
          )}
        </div>
      </td>

      {/* Status */}
      <td className="px-3 py-3">
        <StatusBadge isActive={user.isActive !== false} />
      </td>

      {/* Last Login */}
      <td className="px-3 py-3">
        <span className="text-xs text-gray-500 flex items-center gap-1.5">
          <Clock className="h-3 w-3" />
          {getRelativeTime(user.lastLogin)}
        </span>
      </td>

      {/* Actions */}
      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onEdit(user)}
            title="Edit user"
            className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-500/10 transition-colors"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => isSuperAdmin && onResetPassword(user)}
            title={isSuperAdmin ? 'Reset password' : 'SuperAdmin only'}
            disabled={!isSuperAdmin}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              isSuperAdmin ? 'text-blue-500 hover:bg-blue-500/10' : 'text-gray-700 cursor-not-allowed'
            )}
          >
            <KeyRound className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onToggleStatus(user)}
            title={user.isActive ? 'Disable user' : 'Enable user'}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              user.isActive
                ? 'text-orange-500 hover:bg-orange-500/10'
                : 'text-green-500 hover:bg-green-500/10',
            )}
          >
            {user.isActive
              ? <Ban className="h-3.5 w-3.5" />
              : <CheckCircle2 className="h-3.5 w-3.5" />}
          </button>
          {/* ✅ §7: Delete only for superAdmin */}
          <button
            type="button"
            onClick={() => isSuperAdmin && onDelete(user)}
            title={isSuperAdmin ? 'Delete user' : 'SuperAdmin only'}
            disabled={!isSuperAdmin}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              isSuperAdmin
                ? 'text-red-500 hover:bg-red-500/10'
                : 'text-gray-700 cursor-not-allowed',
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </motion.tr>
  );
};

// ── Filter Select ────────────────────────────────────────────
const FilterSelect = ({ value, onChange, children }) => (
  <div className="relative">
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={cn(
        'appearance-none rounded-xl border border-[#2a1f0d]',
        'bg-[#0a0805] pl-3 pr-8 py-2 text-xs text-gray-300',
        'transition-all focus:outline-none focus:ring-2',
        'focus:ring-amber-500/50 cursor-pointer',
      )}
    >
      {children}
    </select>
    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-600 pointer-events-none" />
  </div>
);

// ══════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ══════════════════════════════════════════════════════════════
const UserManagement = () => {

  // ── Auth context ─────────────────────────────────────────
  const {
    userData,
    currentUser,
    isSuperAdmin: authIsSuperAdmin,
    activeRole,
  } = useAuth();

  // ── Current admin (from context, not localStorage) ───────
  const currentAdmin = useMemo(() => {
    const user = userData || currentUser;
    if (!user) {
      return {
        uid: auth.currentUser?.uid || 'unknown',
        name: 'Admin',
        email: auth.currentUser?.email || '',
        roles: ['superAdmin'],
      };
    }

    const roles = normalizeUserRoles(user);
    return {
      uid: user.uid || auth.currentUser?.uid || 'unknown',
      name: user.name || user.displayName || 'Admin',
      email: user.email || '',
      roles: roles.length > 0 ? roles : ['superAdmin'],
    };
  }, [userData, currentUser]);

  // ✅ §7: SuperAdmin check
  const isSuperAdmin = useMemo(() =>
    authIsSuperAdmin ||
    currentAdmin.roles.some(r =>
      ['superAdmin', 'superadmin', 'super_admin'].includes(r)
    ),
    [authIsSuperAdmin, currentAdmin]
  );

  // ── Data state ───────────────────────────────────────────
  const [users, setUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingStores, setLoadingStores] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [dataSource, setDataSource] = useState('local');
  const [pendingSync, setPendingSync] = useState(0);

  // ── Filter state ─────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);

  // ── UI state ─────────────────────────────────────────────
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const searchTimerRef = useRef(null);
  const syncTimerRef = useRef(null);

  // ── Responsive check ────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── ✅ Load users — offline-first, correct API ───────────
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setFetchError(null);

    try {
      if (navigator.onLine) {
        processSyncQueue().catch(err =>
          console.warn('[UserMgmt] processSyncQueue failed:', err?.message)
        );
      }

      // ✅ FIX: fetchUsersOfflineFirst returns array directly
      const localUsers = await fetchUsersOfflineFirst();

      setUsers(localUsers);
      setDataSource('local');
      setLoadingUsers(false);

      // Count pending sync
      const pending = localUsers.filter(
        u => u._syncStatus === 'pending' || u._syncStatus === 'failed'
      ).length;
      setPendingSync(pending);

    } catch (err) {
      console.error('[UserMgmt] loadUsers:', err);
      setFetchError(err?.message || 'Failed to load users');
      setLoadingUsers(false);
    }
  }, []);

  // ── Load stores ──────────────────────────────────────────
  const loadStores = useCallback(async () => {
    setLoadingStores(true);
    try {
      const data = await fetchStores();
      setStores(data);
    } catch (err) {
      console.error('[UserMgmt] loadStores:', err);
    } finally {
      setLoadingStores(false);
    }
  }, []);

  // ── Initial load ─────────────────────────────────────────
  useEffect(() => {
    loadUsers();
    loadStores();
  }, []);

  // ── ✅ §9: BroadcastChannel — cross-tab user updates ─────
  useEffect(() => {
    const unsub = subscribeToUserChanges((msg) => {
      const { type, payload } = msg;

      if (type === 'USER_CHANGED') {
        if (payload.action === 'delete') {
          setUsers(prev =>
            prev.filter(u => (u.uid || u.id) !== payload.uid)
          );
        } else if (payload.action === 'save' || payload.action === 'synced') {
          // Refresh user list from IDB
          loadUsers();
        }
      }
    });

    return unsub;
  }, [loadUsers]);

  // ── ✅ Sync queue processor (30s interval) ───────────────
  useEffect(() => {
    const run = async () => {
      try {
        await processSyncQueue();
        // Refresh after sync
        const fresh = await fetchUsersOfflineFirst();
        if (fresh?.length > 0) {
          setUsers(fresh);
          const pending = fresh.filter(
            u => u._syncStatus === 'pending' || u._syncStatus === 'failed'
          ).length;
          setPendingSync(pending);
        }
      } catch { }
    };

    // Run on network restore
    window.addEventListener('online', run);
    syncTimerRef.current = setInterval(run, 30_000);

    return () => {
      window.removeEventListener('online', run);
      clearInterval(syncTimerRef.current);
    };
  }, []);

  // ── Debounced search ─────────────────────────────────────
  const handleSearchChange = useCallback((e) => {
    const v = e.target.value;
    setSearchInput(v);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(v.trim());
      setCurrentPage(1);
    }, 280);
  }, []);

  // ── Stats ────────────────────────────────────────────────
  const stats = useMemo(() => {
    const roleCounts = {};
    users.forEach(u =>
      (u.roles || (u.role ? [u.role] : [])).forEach(r => {
        roleCounts[r] = (roleCounts[r] || 0) + 1;
      })
    );
    return {
      total: users.length,
      active: users.filter(u => u.isActive !== false).length,
      inactive: users.filter(u => u.isActive === false).length,
      roleCounts,
    };
  }, [users]);

  // ── Filtered + sorted ────────────────────────────────────
  const filteredUsers = useMemo(() => {
    let result = [...users];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(u =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phone || '').includes(q) ||
        (u.userCode || '').toLowerCase().includes(q)
      );
    }

    if (roleFilter) {
      result = result.filter(u =>
        (u.roles || (u.role ? [u.role] : [])).includes(roleFilter)
      );
    }

    if (storeFilter) {
      result = result.filter(u =>
        (u.storeIds || []).includes(storeFilter)
      );
    }

    if (statusFilter === 'active') result = result.filter(u => u.isActive !== false);
    if (statusFilter === 'inactive') result = result.filter(u => u.isActive === false);

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = (a.name || '').localeCompare(b.name || '');
      } else if (sortField === 'lastLogin') {
        cmp = (toDate(b.lastLogin)?.getTime() || 0) -
          (toDate(a.lastLogin)?.getTime() || 0);
      } else if (sortField === 'createdAt') {
        cmp = (toDate(b.createdAt)?.getTime() || 0) -
          (toDate(a.createdAt)?.getTime() || 0);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [users, searchQuery, roleFilter, storeFilter, statusFilter, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * USERS_PER_PAGE;
    return filteredUsers.slice(start, start + USERS_PER_PAGE);
  }, [filteredUsers, currentPage]);

  useEffect(() => setCurrentPage(1), [searchQuery, roleFilter, storeFilter, statusFilter]);

  const handleSort = useCallback((field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }, [sortField]);

  const handleResetFilters = useCallback(() => {
    setSearchInput('');
    setSearchQuery('');
    setRoleFilter('');
    setStoreFilter('');
    setStatusFilter('');
    setSortField('name');
    setSortDir('asc');
    setCurrentPage(1);
  }, []);

  // ── Handlers ─────────────────────────────────────────────
  const handleCreateUser = useCallback(() => {
    setEditingUser(null);
    setShowUserForm(true);
  }, []);

  const handleEditUser = useCallback((user) => {
    setEditingUser(user);
    setShowUserForm(true);
  }, []);

  const handleFormSubmit = useCallback(async (result) => {
    setShowUserForm(false);
    setEditingUser(null);
    // Refresh from IDB (service already saved it)
    await loadUsers();
    toast.success(result?.uid ? 'User saved!' : 'Done!', {
      icon: '✅',
    });
  }, [loadUsers]);

  // ── Toggle status ────────────────────────────────────────
  const handleToggleStatus = useCallback(async (user) => {
    const uid = user.uid || user.id;
    const newStatus = !(user.isActive !== false);

    // Optimistic update
    setUsers(prev =>
      prev.map(u =>
        (u.uid || u.id) === uid
          ? { ...u, isActive: newStatus }
          : u
      )
    );

    try {
      await toggleUserActiveStatus(uid, newStatus, currentAdmin.uid);
      toast.success(
        `${user.name} ${newStatus ? 'enabled' : 'disabled'}`,
        { icon: newStatus ? '✅' : '⊘' }
      );
    } catch (err) {
      // Revert on error
      setUsers(prev =>
        prev.map(u =>
          (u.uid || u.id) === uid
            ? { ...u, isActive: !newStatus }
            : u
        )
      );
      toast.error(`Failed: ${err?.message}`);
    }
  }, [currentAdmin]);

  // ── ✅ §7: Hard delete — SuperAdmin only ─────────────────
  const handleDeleteUser = useCallback(async (user) => {
    if (!isSuperAdmin) {
      toast.error('🚫 Only Super Admin can delete users!');
      setDeleteConfirm(null);
      return;
    }

    setActionLoading(true);
    try {
      const uid = user.uid || user.id;
      await hardDeleteUser(uid, currentAdmin);

      // Remove from local state immediately
      setUsers(prev =>
        prev.filter(u => (u.uid || u.id) !== uid)
      );

      setDeleteConfirm(null);
      toast.success(`${user.name} permanently deleted`, { icon: '🗑️' });
    } catch (err) {
      toast.error(`Delete failed: ${err?.message}`);
    } finally {
      setActionLoading(false);
    }
  }, [currentAdmin, isSuperAdmin]);

  // ── Reset password ───────────────────────────────────────
  const handleResetPassword = useCallback(async (user) => {
    if (!isSuperAdmin) {
      toast.error('🚫 Only Super Admin can reset passwords');
      setResetConfirm(null);
      return;
    }

    setActionLoading(true);
    try {
      await sendPasswordReset(user.email);
      setResetConfirm(null);
      toast.success(`Reset email sent to ${user.email}`, { icon: '📧' });
    } catch (err) {
      toast.error(`Failed: ${err?.message}`);
    } finally {
      setActionLoading(false);
    }
  }, []);

  // ── Sort icon ────────────────────────────────────────────
  const SortIcon = ({ field }) => {
    if (sortField !== field)
      return <ArrowUpDown className="h-3 w-3 text-gray-600" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 text-amber-500" />
      : <ArrowDown className="h-3 w-3 text-amber-500" />;
  };

  // Pagination numbers
  const pageNumbers = useMemo(() => {
    const pages = [];
    const max = 5;
    if (totalPages <= max) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 3) {
      for (let i = 1; i <= max; i++) pages.push(i);
    } else if (currentPage >= totalPages - 2) {
      for (let i = totalPages - max + 1; i <= totalPages; i++) pages.push(i);
    } else {
      for (let i = currentPage - 2; i <= currentPage + 2; i++) pages.push(i);
    }
    return pages;
  }, [totalPages, currentPage]);

  const isLoading = loadingUsers || loadingStores;

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#0a0805] p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-4">

        {/* ── PAGE HEADER ──────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-100 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
                <Users className="h-5 w-5 text-amber-500" />
              </div>
              User Management
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1 ml-[48px]">
              {/* Data source indicator */}
              <span className={cn(
                'text-xs flex items-center gap-1',
                dataSource === 'firebase'
                  ? 'text-green-500/70'
                  : 'text-gray-500',
              )}>
                {dataSource === 'firebase'
                  ? <Wifi className="h-3 w-3" />
                  : <Database className="h-3 w-3" />}
                {dataSource === 'firebase' ? 'Live' : 'Cached'}
                · {users.length} users
              </span>
              {/* ✅ §5: Sync queue indicators */}
              {pendingSync > 0 && (
                <span className="text-xs text-orange-400 flex items-center gap-1">
                  <Database className="h-3 w-3 animate-pulse" />
                  {pendingSync} pending sync
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadUsers}
              disabled={loadingUsers}
              className="flex items-center gap-1.5 rounded-xl border border-[#2a1f0d] bg-[#1a1208] px-3 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loadingUsers && 'animate-spin')} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <motion.button
              type="button"
              onClick={handleCreateUser}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2.5 text-sm font-semibold text-[#0a0805] shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 transition-all"
            >
              <UserPlus className="h-4 w-4" />
              Add User
            </motion.button>
          </div>
        </div>

        {/* ── STATS ────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <StatCard label="Total" value={stats.total} icon={Users} color="amber" />
          <StatCard label="Active" value={stats.active} icon={UserCheck} color="green" />
          <StatCard label="Inactive" value={stats.inactive} icon={UserX} color="red" />
          <StatCard label="Billers" value={stats.roleCounts.biller || 0} icon={Receipt} color="green" />
          <StatCard label="Cashiers" value={stats.roleCounts.cashier || 0} icon={CreditCard} color="orange" />
          <StatCard label="Managers" value={stats.roleCounts.manager || 0} icon={Shield} color="purple" />
        </div>

        {/* ── FILTERS ──────────────────────────────────── */}
        <div className="rounded-xl border border-[#2a1f0d] bg-[#1a1208] p-3">
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" />
              <input
                type="text"
                placeholder="Search by name, email, phone or userCode…"
                value={searchInput}
                onChange={handleSearchChange}
                className={cn(
                  'w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805]',
                  'pl-10 pr-9 py-2 text-sm text-gray-200 placeholder-gray-600',
                  'focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500',
                )}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {/* Role filter */}
              <FilterSelect value={roleFilter} onChange={v => { setRoleFilter(v); setCurrentPage(1); }}>
                <option value="">All Roles</option>
                <option value="superAdmin">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="biller">Biller</option>
                <option value="cashier">Cashier</option>
              </FilterSelect>

              {/* ✅ FIX: Store filter uses storeName */}
              <FilterSelect value={storeFilter} onChange={v => { setStoreFilter(v); setCurrentPage(1); }}>
                <option value="">All Stores</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>
                    {getStoreName(s) || s.id}
                  </option>
                ))}
              </FilterSelect>

              {/* Status filter */}
              <FilterSelect value={statusFilter} onChange={v => { setStatusFilter(v); setCurrentPage(1); }}>
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </FilterSelect>

              {/* Reset filters */}
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex items-center gap-1.5 rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            </div>
          </div>

          {/* Active filter chips */}
          <AnimatePresence>
            {(searchQuery || roleFilter || storeFilter || statusFilter) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-[#0f0a04]">
                  <Filter className="h-3 w-3 text-gray-600" />
                  <span className="text-xs text-gray-500">
                    {filteredUsers.length} of {users.length} users
                  </span>

                  {searchQuery && (
                    <span className="flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full text-[10px]">
                      "{searchQuery}"
                      <button type="button" onClick={() => { setSearchInput(''); setSearchQuery(''); }}>
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  )}
                  {roleFilter && (
                    <span className="flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full text-[10px]">
                      {ROLE_INFO?.[roleFilter]?.label || roleFilter}
                      <button type="button" onClick={() => setRoleFilter('')}>
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  )}
                  {/* ✅ FIX: chip shows storeName */}
                  {storeFilter && (
                    <span className="flex items-center gap-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full text-[10px]">
                      {getStoreName(stores.find(s => s.id === storeFilter)) || storeFilter}
                      <button type="button" onClick={() => setStoreFilter('')}>
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  )}
                  {statusFilter && (
                    <span className="flex items-center gap-1 bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full text-[10px]">
                      {statusFilter}
                      <button type="button" onClick={() => setStatusFilter('')}>
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── USER TABLE / CARDS ────────────────────────── */}
        <div className="rounded-xl border border-[#2a1f0d] bg-[#1a1208] overflow-hidden">

          {fetchError && !isLoading && (
            <ErrorState error={fetchError} onRetry={loadUsers} />
          )}

          {/* Desktop Table */}
          {!isMobile && !fetchError && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2a1f0d] bg-[#0f0a04]">
                    {[
                      { label: 'User', field: 'name', sortable: true },
                      { label: 'Roles', field: null, sortable: false },
                      { label: 'Branch', field: null, sortable: false },
                      { label: 'Status', field: null, sortable: false },
                      { label: 'Last Login', field: 'lastLogin', sortable: true },
                      { label: 'Actions', field: null, sortable: false, align: 'right' },
                    ].map(col => (
                      <th
                        key={col.label}
                        className={cn(
                          'px-3 py-3 text-left',
                          col.align === 'right' && 'text-right',
                        )}
                      >
                        {col.sortable ? (
                          <button
                            type="button"
                            onClick={() => handleSort(col.field)}
                            className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors"
                          >
                            {col.label}
                            <SortIcon field={col.field} />
                          </button>
                        ) : (
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                            {col.label}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {isLoading
                      ? Array.from({ length: 6 }).map((_, i) => (
                        <SkeletonRow key={`sk-${i}`} index={i} />
                      ))
                      : paginatedUsers.map((user, idx) => (
                        <DesktopUserRow
                          key={user.uid || user.id}
                          user={user}
                          stores={stores}
                          isSuperAdmin={isSuperAdmin}
                          onEdit={handleEditUser}
                          onResetPassword={u => setResetConfirm(u)}
                          onToggleStatus={handleToggleStatus}
                          onDelete={u => setDeleteConfirm(u)}
                          index={idx}
                        />
                      ))
                    }
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}

          {/* Mobile Cards */}
          {isMobile && !fetchError && (
            <div className="p-2 space-y-2">
              <AnimatePresence mode="popLayout">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonCard key={`sk-${i}`} index={i} />
                  ))
                  : paginatedUsers.map((user, idx) => (
                    <MobileUserCard
                      key={user.uid || user.id}
                      user={user}
                      stores={stores}
                      isSuperAdmin={isSuperAdmin}
                      onEdit={handleEditUser}
                      onResetPassword={u => setResetConfirm(u)}
                      onToggleStatus={handleToggleStatus}
                      onDelete={u => setDeleteConfirm(u)}
                      index={idx}
                    />
                  ))
                }
              </AnimatePresence>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !fetchError && filteredUsers.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16 text-center px-4"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1f1a0e] mb-4">
                <Users className="h-7 w-7 text-gray-600" />
              </div>
              <p className="text-sm font-medium text-gray-400 mb-1">No users found</p>
              <p className="text-xs text-gray-600 max-w-xs">
                {searchQuery
                  ? `No results for "${searchQuery}"`
                  : users.length === 0
                    ? 'No users yet — create one!'
                    : 'Try adjusting filters'}
              </p>
              {(searchQuery || roleFilter || storeFilter || statusFilter) && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-4 flex items-center gap-1.5 text-xs text-amber-500 hover:text-amber-400 transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset filters
                </button>
              )}
            </motion.div>
          )}

          {/* Pagination */}
          {!isLoading && !fetchError && filteredUsers.length > USERS_PER_PAGE && (
            <div className="flex items-center justify-between border-t border-[#2a1f0d] px-3 py-3">
              <span className="text-xs text-gray-500">
                {(currentPage - 1) * USERS_PER_PAGE + 1}–
                {Math.min(currentPage * USERS_PER_PAGE, filteredUsers.length)} of {filteredUsers.length}
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 rounded-lg border border-[#2a1f0d] bg-[#0a0805] px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Prev</span>
                </button>

                <div className="hidden sm:flex items-center gap-1">
                  {pageNumbers.map(page => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-all',
                        currentPage === page
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : 'text-gray-500 hover:text-gray-300 hover:bg-[#0f0a04]',
                      )}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                <span className="sm:hidden text-xs text-gray-500 px-2">
                  {currentPage}/{totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-1 rounded-lg border border-[#2a1f0d] bg-[#0a0805] px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── USER FORM MODAL ───────────────────────────── */}
      <UserForm
        isOpen={showUserForm}
        onClose={() => {
          setShowUserForm(false);
          setEditingUser(null);
        }}
        onSubmit={handleFormSubmit}
        editUser={editingUser}
        stores={stores}
        currentAdmin={currentAdmin}
      />

      {/* ── DELETE CONFIRM ────────────────────────────── */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        onClose={() => !actionLoading && setDeleteConfirm(null)}
        onConfirm={() => handleDeleteUser(deleteConfirm)}
        title="Permanently Delete User"
        message={`Delete "${deleteConfirm?.name}" from the system?`}
        subMessage={
          isSuperAdmin
            ? 'This will remove the user from Firestore permanently. This action cannot be undone.'
            : '⚠️ You need Super Admin role to delete users.'
        }
        confirmText={isSuperAdmin ? 'Delete Forever' : 'No Permission'}
        confirmIcon={Trash2}
        confirmColor="red"
        loading={actionLoading}
      />

      {/* ── RESET PASSWORD CONFIRM ────────────────────── */}
      <ConfirmDialog
        isOpen={!!resetConfirm}
        onClose={() => !actionLoading && setResetConfirm(null)}
        onConfirm={() => handleResetPassword(resetConfirm)}
        title="Send Password Reset Email"
        message="A password reset link will be sent to:"
        subMessage={resetConfirm?.email}
        confirmText="Send Email"
        confirmIcon={Mail}
        confirmColor="blue"
        loading={actionLoading}
      />
    </div>
  );
};

export default UserManagement;