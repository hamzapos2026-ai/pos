// src/components/activity/ActivityLogsDashboard.jsx
// Shared Activity Logs UI — Admin + Manager (same filters, table, export)
// ✅ Reads from ALL collections: auditLogs, cashierActions, clearedData, deletedBills, activityLogs, devices, users
// ✅ Real-time Firebase snapshots + Dexie offline fallback
// ✅ Advanced filters: role, action, store, branch, biller, date range, device
// ✅ Full pagination, CSV export, responsive, dark/light theme

import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue, Fragment } from 'react';
import { Link } from 'react-router-dom';
import {
  collection, query, orderBy, limit, getDocs, where, doc, getDoc
} from 'firebase/firestore';
import { db as firebaseDb, isFirebaseReady } from '../../services/firebase';
import { db as dexieDb } from '../../db/index';
import {
  Activity, Search, Filter, Download, RefreshCw, Wifi, WifiOff,
  User, Shield, Monitor, MapPin, Clock, Calendar, ChevronLeft,
  ChevronRight, LogIn, LogOut, FileText, Trash2, Edit, Lock,
  Unlock, ShieldAlert, CheckCircle, XCircle, AlertTriangle,
  Eye, EyeOff, Database, Smartphone, TrendingUp, Users, X,
  ChevronDown, CreditCard, DollarSign, RotateCcw, Eraser,
  Package, Hash, Zap, Globe, Layers, BarChart3
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useNetwork } from '../../context/NetworkContext';
import { useLanguage } from '../../hooks/useLanguage';
import { cn } from '../../utils/cn';
import { activityLogMatchesBranch, dedupeActivityLogs } from '../../utils/activityLogNormalizer';
import useStoresMap, { resolveStoreName, findStoreRecord } from '../../hooks/useStoresMap';
import {
  getDeviceLabel,
  resolveLogDeviceLabel,
  mergeDeviceFilterOptions,
  getLocalDevicesMap,
  mergeDeviceMaps,
} from '../../utils/deviceRegistry';
import {
  getActionMeta,
  categoryMatchesTab,
  FIRESTORE_ACTIVITY_SOURCES,
  inferActivityRole,
  resolveActivityLogRole,
} from '../../utils/activityLogMeta';
import { toast } from 'react-hot-toast';

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION & CONSTANTS
// ═══════════════════════════════════════════════════════════════

const PAGE_SIZES = [25, 50, 100, 200, 500];
const DEFAULT_PAGE_SIZE = 50;
import { ACTIVITY_LOGS_DOC_LIMIT, VISIBILITY_RECONCILE_COOLDOWN_MS, ACTIVITY_LOGS_POLL_MS } from '../../utils/firebaseQuotaConfig';
import DatePresetBar from '../shared/DatePresetBar';
import { resolveDatePresetRange, toDateInputValue } from '../../utils/datePresetUtils';

const MAX_FIREBASE_DOCS = ACTIVITY_LOGS_DOC_LIMIT;

const FIRESTORE_SOURCES = FIRESTORE_ACTIVITY_SOURCES;

const CATEGORY_TAB_KEYS = [
  { key: 'all',     labelKey: 'activityLog.allActivity', shortKey: 'activityLog.all',   icon: Layers },
  { key: 'auth',    labelKey: 'activityLog.loginLogout', shortKey: 'activityLog.auth',  icon: LogIn },
  { key: 'billing', labelKey: 'activityLog.billing',     shortKey: 'activityLog.bills', icon: FileText },
  { key: 'payment', labelKey: 'activityLog.payments', shortKey: 'activityLog.pay', icon: DollarSign },
  { key: 'cleared', labelKey: 'activityLog.deletedCleared', shortKey: 'activityLog.del', icon: Trash2 },
  { key: 'admin',   labelKey: 'activityLog.adminSettings', shortKey: 'activityLog.adminShort', icon: ShieldAlert },
];

const ROLE_CONFIG = {
  superAdmin:  { label: 'Super Admin', color: 'amber',   icon: Shield },
  superadmin:  { label: 'Super Admin', color: 'amber',   icon: Shield },
  admin:       { label: 'Admin',       color: 'violet',  icon: Shield },
  manager:     { label: 'Manager',     color: 'blue',    icon: Users },
  biller:      { label: 'Biller',      color: 'sky',     icon: FileText },
  cashier:     { label: 'Cashier',     color: 'emerald', icon: Monitor },
};

// ═══════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════

const parseTimestamp = (ts) => {
  if (!ts) return null;
  if (ts?.toDate) return ts.toDate();
  if (ts?.seconds) return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return isNaN(d) ? null : d;
};

const fmt = {
  date: (ts) => {
    const d = parseTimestamp(ts);
    if (!d) return '—';
    return d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
  },
  time: (ts) => {
    const d = parseTimestamp(ts);
    if (!d) return '—';
    return d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  },
  ago: (ts) => {
    const d = parseTimestamp(ts);
    if (!d) return '';
    const diff = Date.now() - d.getTime();
    if (diff < 0) return 'just now';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return fmt.date(ts);
  },
  currency: (v) => {
    if (v == null || v === '') return '';
    return `Rs. ${Number(v).toLocaleString('en-PK')}`;
  },
};

const getRoleMeta = (role) =>
  ROLE_CONFIG[role] || { label: role || 'Unknown', color: 'gray', icon: User };

const colorMap = {
  amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20' },
  emerald: { bg: 'bg-emerald-500/10',  text: 'text-emerald-400', border: 'border-emerald-500/20' },
  blue:    { bg: 'bg-blue-500/10',     text: 'text-blue-400',    border: 'border-blue-500/20' },
  sky:     { bg: 'bg-sky-500/10',      text: 'text-sky-400',     border: 'border-sky-500/20' },
  rose:    { bg: 'bg-rose-500/10',     text: 'text-rose-400',    border: 'border-rose-500/20' },
  red:     { bg: 'bg-red-500/10',      text: 'text-red-400',     border: 'border-red-500/20' },
  orange:  { bg: 'bg-orange-500/10',   text: 'text-orange-400',  border: 'border-orange-500/20' },
  yellow:  { bg: 'bg-yellow-500/10',   text: 'text-yellow-400',  border: 'border-yellow-500/20' },
  green:   { bg: 'bg-green-500/10',    text: 'text-green-400',   border: 'border-green-500/20' },
  purple:  { bg: 'bg-purple-500/10',   text: 'text-purple-400',  border: 'border-purple-500/20' },
  violet:  { bg: 'bg-violet-500/10',   text: 'text-violet-400',  border: 'border-violet-500/20' },
  indigo:  { bg: 'bg-indigo-500/10',   text: 'text-indigo-400',  border: 'border-indigo-500/20' },
  pink:    { bg: 'bg-pink-500/10',     text: 'text-pink-400',    border: 'border-pink-500/20' },
  cyan:    { bg: 'bg-cyan-500/10',     text: 'text-cyan-400',    border: 'border-cyan-500/20' },
  slate:   { bg: 'bg-slate-500/10',    text: 'text-slate-400',   border: 'border-slate-500/20' },
  gray:    { bg: 'bg-gray-500/10',     text: 'text-gray-400',    border: 'border-gray-500/20' },
};

const getColor = (c) => colorMap[c] || colorMap.gray;

/** Dexie rows still waiting to upload to Firebase */
const isPendingSyncLog = (log) =>
  log?._source === 'offline' && log?.synced !== true;

// ═══════════════════════════════════════════════════════════════
// NORMALIZER - unifies documents from all collections
// ═══════════════════════════════════════════════════════════════

const normalizeDocument = (doc, source) => {
  const d = doc;

  // Common fields
  const base = {
    _id: d._id || d.id || `${source}_${Math.random().toString(36).slice(2)}`,
    _source: source,
  };

  switch (source) {
    case 'auditLogs':
      return {
        ...base,
        action: d.action || 'UNKNOWN',
        timestamp: d.timestamp || d._serverCreatedAt || d._createdAt,
        userId: d.userId || d.cashierId || d.billerId || '',
        userName: d.cashierName || d.userName || d.billerName || '',
        role: inferActivityRole({
          action: d.action,
          userId: d.userId || d.cashierId || d.billerId,
          billerId: d.billerId,
          cashierId: d.cashierId,
          _source: 'auditLogs',
          raw: d,
        }),
        storeId: d.storeId || '',
        billSerial: d.billSerial || d.serialNo || '',
        amount: d.amount || 0,
        paymentType: d.paymentType || '',
        deviceId: d.deviceId || '',
        deviceInfo: d.userAgent || '',
        billId: d.billId || '',
        synced: d._immutable ? true : (d.synced ?? true),
        raw: d,
      };

    case 'cashierActions':
      return {
        ...base,
        action: d.type || d.actionType || d.action || 'CASHIER_ACTION',
        timestamp: d.performedAt || d.timestamp || d.createdAt,
        userId: d.cashierId || d.userId || '',
        userName: d.cashierName || d.userName || '',
        billerName: d.billerName || '',
        billerId: d.billerId || '',
        role: inferActivityRole({
          action: d.type || d.actionType || d.action,
          userId: d.cashierId || d.userId,
          billerId: d.billerId,
          cashierId: d.cashierId,
          _source: 'cashierActions',
          raw: d,
        }),
        storeId: d.storeId || '',
        billSerial: d.billSerial || d.serialNo || '',
        amount: d.amount || d.totalAmount || 0,
        paymentType: d.paymentMethod || d.paymentType || '',
        totalQty: d.totalQty || 0,
        totalDiscount: d.totalDiscount || 0,
        customer: d.customer || {},
        items: d.items || [],
        itemsCount: d.items?.length || 0,
        date: d.date || '',
        time: d.time || '',
        synced: true,
        raw: d,
      };

    case 'clearedData':
      return {
        ...base,
        action: d.type || d.reason || 'item_cleared',
        timestamp: d.deletedAt,
        userId: d.billerId || '',
        userName: d.billerName || '',
        role: 'biller',
        storeId: d.storeId || '',
        billSerial: d.serialNo || '',
        amount: 0,
        items: d.items || [],
        itemsCount: d.items?.length || 0,
        reason: d.reason || '',
        date: d.date || '',
        synced: true,
        raw: d,
      };

    case 'deletedBills':
      return {
        ...base,
        action: 'BILL_DELETED',
        timestamp: d.deletedAt || d.hardDeletedAt || d.cancelledAt || d.timestamp,
        userId: d.deletedById || d.billerId || d.hardDeletedByUid || d.orderSnapshot?.billerId || '',
        userName: d.deletedByName || d.billerName || d.hardDeletedByEmail || d.orderSnapshot?.billerName || '',
        billerName: d.billerName || d.orderSnapshot?.billerName || '',
        billerId: d.billerId || d.orderSnapshot?.billerId || '',
        role: 'biller',
        storeId: d.storeId || d.orderSnapshot?.storeId || '',
        billSerial: d.billSerial || d.serialNo || d.orderSnapshot?.billSerial || '',
        amount: d.totalAmount || d.grandTotal || d.orderSnapshot?.totalAmount || d.orderSnapshot?.grandTotal || 0,
        reason: d.reason || d.deleteReason || d.hardDeleteReason || '',
        customer: d.customer || d.orderSnapshot?.customer || {},
        items: d.items || d.orderSnapshot?.items || [],
        itemsCount: d.items?.length || d.itemCount || d.orderSnapshot?.items?.length || 0,
        totalQty: d.totalQty || d.orderSnapshot?.totalQty || 0,
        originalOrderId: d.originalOrderId || d.orderId || d.billId || '',
        synced: true,
        raw: d,
      };

    case 'activityLogs':
      return {
        ...base,
        action: d.action || 'UNKNOWN',
        timestamp: d.timestamp || d._serverCreatedAt || d._createdAt,
        userId: d.userId || d.cashierId || d.billerId || '',
        userName: d.userName || d.cashierName || d.billerName || '',
        role: inferActivityRole({
          action: d.action,
          userId: d.userId || d.cashierId || d.billerId,
          billerId: d.billerId,
          cashierId: d.cashierId,
          _source: 'activityLogs',
          raw: d,
        }),
        storeId: d.storeId || '',
        billSerial: d.billSerial || d.serialNo || '',
        amount: d.amount || 0,
        paymentType: d.paymentType || '',
        deviceId: d.deviceId || '',
        deviceName: d.deviceName || '',
        deviceInfo: d.deviceInfo || d.userAgent || '',
        deviceOS: d.deviceOS || '',
        deviceBrowser: d.deviceBrowser || '',
        platform: d.platform || '',
        timezone: d.timezone || '',
        geo: d.geo || '',
        networkTag: d.networkTag || (d.capturedOnline === false ? 'offline' : 'online'),
        // Firestore rows are already in cloud — ignore legacy synced:false on online captures
        synced: d._pendingFirebase === true || (d.synced === false && d.offlineCaptured === true)
          ? false
          : true,
        raw: d,
      };

    case 'offline':
      return {
        ...base,
        action: d.action || d.actionType || d.type || 'UNKNOWN',
        timestamp: d.timestamp || d._createdAt || d.localISO,
        userId: d.userId || d.cashierId || d.billerId || '',
        userName: d.userName || d.cashierName || d.billerName || d.userId || '',
        role: d.role || '',
        storeId: d.storeId || '',
        billSerial: d.billSerial || d.serialNo || '',
        amount: d.amount || d.totalAmount || 0,
        paymentType: d.paymentType || '',
        deviceId: d.deviceId || '',
        deviceName: d.deviceName || '',
        deviceInfo: d.deviceInfo || d.userAgent || '',
        deviceOS: d.deviceOS || '',
        deviceBrowser: d.deviceBrowser || '',
        platform: d.platform || '',
        timezone: d.timezone || '',
        geo: d.geo || '',
        networkTag: 'offline',
        synced: d.synced !== true,
        raw: d,
      };

    default:
      return {
        ...base,
        action: d.action || d.actionType || d.type || 'UNKNOWN',
        timestamp: d.timestamp || d.createdAt || d._createdAt,
        userId: d.userId || d.cashierId || d.billerId || '',
        userName: d.userName || d.cashierName || d.billerName || '',
        role: d.role || '',
        storeId: d.storeId || '',
        billSerial: d.billSerial || d.serialNo || '',
        amount: d.amount || d.totalAmount || 0,
        deviceId: d.deviceId || '',
        deviceName: d.deviceName || '',
        deviceInfo: d.deviceInfo || d.userAgent || '',
        timezone: d.timezone || '',
        geo: d.geo || '',
        networkTag: d.networkTag || '',
        synced: d.synced ?? true,
        raw: d,
      };
  }
};

// ═══════════════════════════════════════════════════════════════
// CSV EXPORT
// ═══════════════════════════════════════════════════════════════

const exportCSV = (logs, filename) => {
  const headers = [
    'Date', 'Time', 'Action', 'User', 'Role', 'Store', 'Bill Serial',
    'Amount', 'Payment Type', 'Items', 'Device', 'Source', 'Synced'
  ];
  const rows = logs.map(l => [
    fmt.date(l.timestamp),
    fmt.time(l.timestamp),
    getActionMeta(l.action).label,
    l.userName || l.userId || '',
    l.role || '',
    l.storeId || '',
    l.billSerial || '',
    l.amount || '',
    l.paymentType || '',
    l.itemsCount || '',
    l.deviceId || '',
    l._source || '',
    isPendingSyncLog(l) ? 'Offline' : 'Synced',
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `activity_logs_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success(`Exported ${logs.length} records`);
};

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

const ActionBadge = ({ action, compact = false }) => {
  const meta = getActionMeta(action);
  const c = getColor(meta.color);
  const Icon = meta.icon;
  return (
    <span
      title={meta.label}
      className={cn(
        'flex items-start gap-1 rounded-lg font-semibold leading-snug w-full max-w-full overflow-hidden',
        compact ? 'px-1.5 py-0.5 text-[9px] gap-0.5' : 'px-2 py-1 text-[10px] gap-1',
        c.bg, c.text,
      )}
    >
      <Icon className={cn('shrink-0 mt-0.5', compact ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
      <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{meta.label}</span>
    </span>
  );
};

const RoleBadge = ({ role }) => {
  const meta = getRoleMeta(role);
  const c = getColor(meta.color);
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap', c.bg, c.text)}>
      <Icon className="w-2.5 h-2.5 shrink-0" />
      {meta.label}
    </span>
  );
};

const SourceBadge = ({ source, isDark }) => {
  const labels = {
    auditLogs: 'Audit', cashierActions: 'Cashier', clearedData: 'Cleared',
    deletedBills: 'Deleted', activityLogs: 'Activity', offline: 'Offline'
  };
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider',
      isDark ? 'bg-gray-800/50 text-gray-500' : 'bg-gray-100 text-gray-500'
    )}>
      <Database className="w-2.5 h-2.5" />
      {labels[source] || source}
    </span>
  );
};

const LogStatCard = ({ label, value, icon: Icon, color, isDark, onClick, active }) => {
  const c = getColor(color);
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-xl border p-3 sm:p-4 flex items-center gap-3 text-left transition-all w-full',
        'hover:scale-[1.02] active:scale-[0.98]',
        active
          ? cn(c.bg, c.border, 'border-2 shadow-lg')
          : isDark
            ? 'bg-[#0f0a05] border-[#2a1f0d] hover:border-amber-500/30'
            : 'bg-white border-amber-100 hover:border-amber-300'
      )}
    >
      <div className={cn('w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0', c.bg)}>
        <Icon className={cn('w-4 h-4 sm:w-5 sm:h-5', c.text)} />
      </div>
      <div className="min-w-0">
        <p className={cn('text-lg sm:text-xl font-bold leading-none', isDark ? 'text-white' : 'text-gray-900')}>{value}</p>
        <p className={cn('text-[10px] sm:text-xs mt-0.5 truncate', isDark ? 'text-gray-500' : 'text-gray-500')}>{label}</p>
      </div>
    </button>
  );
};

// ── EXPANDED ROW DETAIL ──────────────────────────────────
const ExpandedDetail = ({ log, isDark, usersMap, storesMap, devicesMap }) => {
  const storeRec = findStoreRecord(log.storeId, storesMap);
  const storeName = resolveStoreName(log.storeId, storesMap);
  const storeLocation = storeRec?.location || storeRec?.address || '';
  const userName = usersMap[log.userId]?.name || log.userName || '—';
  const userEmail = usersMap[log.userId]?.email || '';
  const userRole = resolveActivityLogRole(log, usersMap) || '—';
  const deviceName = resolveLogDeviceLabel(log, devicesMap);

  const sections = [
    {
      title: '👤 User Details',
      items: [
        { label: 'Name', value: userName },
        { label: 'Email', value: userEmail },
        { label: 'User ID', value: log.userId, mono: true },
        { label: 'Role', value: userRole },
        ...(log.billerName ? [{ label: 'Biller', value: log.billerName }] : []),
      ]
    },
    {
      title: '🏪 Store & Location',
      items: [
        { label: 'Store', value: storeName },
        { label: 'Location', value: storeLocation },
        { label: 'Store ID', value: log.storeId, mono: true },
      ]
    },
    {
      title: '🧾 Bill Details',
      items: [
        { label: 'Bill Serial', value: log.billSerial, mono: true },
        { label: 'Amount', value: log.amount ? fmt.currency(log.amount) : '' },
        { label: 'Payment', value: log.paymentType },
        { label: 'Items', value: log.itemsCount || '' },
        { label: 'Total Qty', value: log.totalQty || '' },
        { label: 'Discount', value: log.totalDiscount ? fmt.currency(log.totalDiscount) : '' },
        ...(log.reason ? [{ label: 'Reason', value: log.reason }] : []),
        ...(log.customer?.name ? [{ label: 'Customer', value: `${log.customer.name} ${log.customer.phone || ''}` }] : []),
      ]
    },
    {
      title: '📱 Device & Network',
      items: [
        { label: 'Device', value: resolveLogDeviceLabel(log, devicesMap) },
        { label: 'Device ID', value: log.deviceId, mono: true },
        {
          label: 'Browser/OS',
          value: (log.deviceBrowser && log.deviceOS)
            ? `${log.deviceBrowser} · ${log.deviceOS}`
            : resolveLogDeviceLabel(log, devicesMap),
        },
        { label: 'Platform', value: log.platform || '' },
        { label: 'Network', value: log.networkTag ? (log.networkTag === 'offline' ? '📴 Offline' : '🌐 Online') : '' },
        { label: 'Source', value: log._source },
        { label: 'Sync Status', value: isPendingSyncLog(log) ? '⚠️ Offline (pending sync)' : '✅ Synced' },
      ]
    },
    {
      title: '📍 Location & Time',
      items: [
        { label: 'Geo', value: log.geo || '' },
        { label: 'Timezone', value: log.timezone || '' },
        { label: 'Date', value: log.date || log.raw?.localDate || fmt.date(log.timestamp) },
        { label: 'Time', value: log.time || log.raw?.localTime || fmt.time(log.timestamp) },
        { label: 'Captured', value: fmt.ago(log.timestamp) },
      ]
    },
  ];

  // Items list (if available)
  const items = log.items || log.raw?.items || [];

  return (
    <div className={cn(
      'mx-2 mb-2 mt-1 rounded-xl border overflow-hidden',
      isDark ? 'bg-[#080603] border-[#2a1f0d]' : 'bg-amber-50/50 border-amber-100'
    )}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0">
        {sections.map((sec) => (
          <div key={sec.title} className={cn('p-3 border-b sm:border-r last:border-r-0', isDark ? 'border-[#1a1208]' : 'border-amber-100/50')}>
            <p className={cn('text-[10px] font-bold uppercase tracking-wider mb-2', isDark ? 'text-gray-500' : 'text-gray-400')}>{sec.title}</p>
            <div className="space-y-1.5">
              {sec.items.map(({ label, value, mono }) =>
                value ? (
                  <div key={label} className="flex justify-between gap-2">
                    <span className={cn('text-[10px] shrink-0', isDark ? 'text-gray-600' : 'text-gray-400')}>{label}</span>
                    <span className={cn('text-[11px] font-medium text-right break-all', mono ? 'font-mono' : '', isDark ? 'text-gray-300' : 'text-gray-700')} title={String(value)}>
                      {String(value).slice(0, 40)}
                    </span>
                  </div>
                ) : null
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Items table */}
      {items.length > 0 && (
        <div className={cn('border-t p-3', isDark ? 'border-[#1a1208]' : 'border-amber-100/50')}>
          <p className={cn('text-[10px] font-bold uppercase tracking-wider mb-2', isDark ? 'text-gray-500' : 'text-gray-400')}>
            📦 Items ({items.length})
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className={isDark ? 'text-gray-600' : 'text-gray-400'}>
                  <th className="text-left py-1 pr-3">#</th>
                  <th className="text-left py-1 pr-3">Product</th>
                  <th className="text-right py-1 pr-3">Qty</th>
                  <th className="text-right py-1 pr-3">Price</th>
                  <th className="text-right py-1">Total</th>
                </tr>
              </thead>
              <tbody className={isDark ? 'text-gray-400' : 'text-gray-600'}>
                {items.slice(0, 10).map((item, i) => (
                  <tr key={i} className={cn('border-t', isDark ? 'border-[#1a1208]' : 'border-amber-100/30')}>
                    <td className="py-1 pr-3 font-mono">{i + 1}</td>
                    <td className="py-1 pr-3 font-medium">{item.productName || '—'}</td>
                    <td className="py-1 pr-3 text-right">{item.qty || 0}</td>
                    <td className="py-1 pr-3 text-right">{fmt.currency(item.price)}</td>
                    <td className="py-1 text-right font-semibold">{fmt.currency(item.total || (item.qty * item.price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length > 10 && (
              <p className={cn('text-[10px] mt-1', isDark ? 'text-gray-600' : 'text-gray-400')}>
                +{items.length - 10} more items...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

/**
 * @param {object} props
 * @param {boolean} [props.canExport=true] — show CSV export (manager: permission)
 * @param {string[]|null} [props.branchIds=null] — restrict to branches (manager stores)
 * @param {boolean} [props.embedded=false] — inside manager layout (no full-page shell)
 * @param {boolean} [props.accessDenied=false]
 */
const ActivityLogsDashboard = ({
  canExport = true,
  branchIds = null,
  embedded = false,
  accessDenied = false,
  showDevicesLink = false,
}) => {
  const { isDark } = useTheme();
  const storesMap = useStoresMap();
  const { t, isRTL } = useLanguage();
  const isOnline = useNetwork()?.isOnline ?? navigator.onLine;

  const categoryTabs = useMemo(() => CATEGORY_TAB_KEYS.map((tab) => ({
    ...tab,
    label: t(tab.labelKey, tab.labelKey),
    short: t(tab.shortKey, tab.shortKey),
  })), [t]);

  // ── Data ────────────────────────────────────────────────
  const [allLogs,      setAllLogs]      = useState([]);
  const [offlineLogs,  setOfflineLogs]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [lastUpdated,  setLastUpdated]  = useState(null);
  const [usersMap,     setUsersMap]     = useState({});
  const [devicesMap,   setDevicesMap]   = useState({});

  // ── Filters ─────────────────────────────────────────────
  const [search,       setSearch]       = useState('');
  const deferredSearch = useDeferredValue(search);
  const [category,     setCategory]     = useState('all');
  const [roleFilter,   setRoleFilter]   = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [storeFilter,  setStoreFilter]  = useState('all');
  const [billerFilter, setBillerFilter] = useState('all');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [datePreset,   setDatePreset]   = useState('today');
  const [customFromPreset, setCustomFromPreset] = useState('');
  const [customToPreset, setCustomToPreset] = useState('');
  const [showFilters,  setShowFilters]  = useState(false);

  useEffect(() => {
    if (datePreset === 'all') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    const { from, to } = resolveDatePresetRange(datePreset, customFromPreset, customToPreset);
    setDateFrom(toDateInputValue(from));
    setDateTo(toDateInputValue(to));
  }, [datePreset, customFromPreset, customToPreset]);

  // ── Pagination ──────────────────────────────────────────
  const [page,         setPage]         = useState(1);
  const [pageSize,     setPageSize]     = useState(DEFAULT_PAGE_SIZE);
  const [expandedId,   setExpandedId]   = useState(null);

  const fetchSeqRef = useRef(0);
  const loadedSourcesRef = useRef(new Set());
  const lastOnlineFetchRef = useRef(0);

  const fetchSources = useCallback(async (sourceKeys = null, { force = false, silent = false } = {}) => {
    if (!isFirebaseReady() || !firebaseDb) {
      if (!silent) setLoading(false);
      return;
    }

    const targets = sourceKeys
      ? FIRESTORE_SOURCES.filter((s) => sourceKeys.includes(s.key))
      : FIRESTORE_SOURCES;

    const toFetch = force
      ? targets
      : targets.filter((s) => !loadedSourcesRef.current.has(s.key));

    if (!toFetch.length) {
      if (!silent) setLoading(false);
      return;
    }

    const seq = ++fetchSeqRef.current;
    if (!silent) setLoading(true);

    const fetchOne = async ({ key, collection: colName, orderField, orderFieldAlt }) => {
      const runQuery = async (field) => {
        const q = query(
          collection(firebaseDb, colName),
          orderBy(field, 'desc'),
          limit(MAX_FIREBASE_DOCS),
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) =>
          normalizeDocument({ _id: d.id, ...d.data() }, key),
        );
      };
      try {
        return await runQuery(orderField);
      } catch (err) {
        if (orderFieldAlt && orderFieldAlt !== orderField) {
          try { return await runQuery(orderFieldAlt); } catch { /* fall through */ }
        }
        console.warn(`[ActivityLogs] ${key} fetch error:`, err?.message || err);
        return [];
      }
    };

    try {
      const pairs = await Promise.all(
        toFetch.map(async (src) => ({ key: src.key, docs: await fetchOne(src) })),
      );
      if (seq !== fetchSeqRef.current) return;

      pairs.forEach(({ key }) => loadedSourcesRef.current.add(key));

      setAllLogs((prev) => {
        const byKey = {};
        FIRESTORE_SOURCES.forEach((s) => { byKey[s.key] = []; });
        prev.forEach((log) => {
          const k = log._source;
          if (k && byKey[k]) byKey[k].push(log);
        });
        pairs.forEach(({ key, docs }) => { byKey[key] = docs; });
        const merged = Object.values(byKey).flat();
        merged.sort((a, b) => {
          const ta = parseTimestamp(a.timestamp) || new Date(0);
          const tb = parseTimestamp(b.timestamp) || new Date(0);
          return tb - ta;
        });
        return merged;
      });
      if (seq === fetchSeqRef.current) setLastUpdated(Date.now());
    } finally {
      if (seq === fetchSeqRef.current && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadUsersFromCache = async () => {
      try {
        if (!dexieDb?.users) return;
        const rows = await dexieDb.users.toArray();
        if (cancelled) return;
        const map = {};
        rows.forEach((u) => {
          const id = u.uid || u.id;
          if (id) map[id] = { id, ...u, name: u.name || u.displayName };
        });
        setUsersMap(map);
      } catch { /* ignore */ }
    };

    loadUsersFromCache();
    setDevicesMap(mergeDeviceMaps({}, getLocalDevicesMap()));
    const localDevTimer = setInterval(() => {
      setDevicesMap((prev) => mergeDeviceMaps(prev, getLocalDevicesMap()));
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(localDevTimer);
    };
  }, []);

  // ══════════════════════════════════════════════════════════
  // FIRESTORE LOG FETCH (one-time per visit — no live listeners)
  // ══════════════════════════════════════════════════════════

  const PRIMARY_LOG_SOURCES = ['activityLogs', 'auditLogs'];

  // ── Offline logs from Dexie ─────────────────────────────
  const loadOfflineLogs = useCallback(async () => {
    try {
      if (!dexieDb?.activity_logs_local) return;
      const rows = await dexieDb.activity_logs_local
        .filter((r) => r.synced !== true || r._pendingFirebase === true)
        .reverse()
        .limit(500)
        .toArray();
      setOfflineLogs(rows.map((r) =>
        normalizeDocument({ _id: `offline_${r.id ?? r.timestamp}`, ...r }, 'offline')
      ));
    } catch (e) {
      console.warn('[ActivityLogs] Dexie error:', e);
    }
  }, []);

  useEffect(() => {
    fetchSources(PRIMARY_LOG_SOURCES);
    loadOfflineLogs();
  }, [fetchSources, loadOfflineLogs]);

  // Lazy-load remaining collections when user picks a source tab
  useEffect(() => {
    if (sourceFilter === 'all') {
      fetchSources(FIRESTORE_SOURCES.map((s) => s.key).filter(
        (k) => !PRIMARY_LOG_SOURCES.includes(k),
      ));
      return;
    }
    if (sourceFilter !== 'all' && !PRIMARY_LOG_SOURCES.includes(sourceFilter)) {
      fetchSources([sourceFilter]);
    }
  }, [sourceFilter, fetchSources]);

  // ── Offline Dexie polling (local only — no Firebase reads) ──
  useEffect(() => {
    let timer;
    const schedule = () => {
      timer = setInterval(() => {
        loadOfflineLogs();
      }, 8000);
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadOfflineLogs();
        const now = Date.now();
        if (now - lastOnlineFetchRef.current >= VISIBILITY_RECONCILE_COOLDOWN_MS) {
          lastOnlineFetchRef.current = now;
          fetchSources(null, { force: true });
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    const onOnline = () => {
      loadOfflineLogs();
      const now = Date.now();
      if (now - lastOnlineFetchRef.current < VISIBILITY_RECONCILE_COOLDOWN_MS) return;
      lastOnlineFetchRef.current = now;
      fetchSources(null, { force: true });
    };
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [loadOfflineLogs, fetchSources]);

  // ── Live auto-refresh — silent Firestore poll (tab visible + online) ──
  useEffect(() => {
    if (!isOnline) return undefined;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      fetchSources(null, { force: true, silent: true });
      loadOfflineLogs();
    };
    const timer = setInterval(tick, ACTIVITY_LOGS_POLL_MS);
    return () => clearInterval(timer);
  }, [isOnline, fetchSources, loadOfflineLogs]);

  const handleRefresh = () => {
    loadedSourcesRef.current.clear();
    fetchSources(null, { force: true });
    loadOfflineLogs();
    toast.success('Refreshing all sources...');
  };

  // ══════════════════════════════════════════════════════════
  // MERGE & DEDUPLICATE
  // ══════════════════════════════════════════════════════════

  const mergedLogs = useMemo(() => {
    const combined = [...allLogs];
    const ids = new Set(combined.map(l => l._id));
    offlineLogs.forEach(ol => { if (!ids.has(ol._id)) combined.push(ol); });
    return dedupeActivityLogs(combined);
  }, [allLogs, offlineLogs]);

  const displayLogs = useMemo(() => {
    const scoped = !branchIds?.length
      ? mergedLogs
      : mergedLogs.filter((l) => activityLogMatchesBranch(l, branchIds));
    return scoped.map((l) => ({
      ...l,
      role: resolveActivityLogRole(l, usersMap),
    }));
  }, [mergedLogs, branchIds, usersMap]);

  // ══════════════════════════════════════════════════════════
  // DERIVED: unique values for filters
  // ══════════════════════════════════════════════════════════

  const filterOptions = useMemo(() => {
    const stores = new Set();
    const billers = new Map();
    const roles = new Set();

    displayLogs.forEach(l => {
      if (l.storeId) stores.add(l.storeId);
      if (l.role) roles.add(l.role);
      const uid = l.userId || l.billerId;
      const name = l.userName || l.billerName;
      if (uid && name) billers.set(uid, name);
    });

    return {
      stores: [...stores],
      billers: [...billers.entries()],
      roles: [...roles].filter(r => r && r !== 'unknown'),
      devices: mergeDeviceFilterOptions(devicesMap, displayLogs),
    };
  }, [displayLogs, devicesMap]);

  // ══════════════════════════════════════════════════════════
  // FILTER
  // ══════════════════════════════════════════════════════════

  const categoryCounts = useMemo(() => {
    const counts = { all: displayLogs.length };
    displayLogs.forEach((l) => {
      const cat = getActionMeta(l.action).category;
      categoryTabs.forEach(({ key }) => {
        if (key === 'all') return;
        if (categoryMatchesTab(cat, key)) {
          counts[key] = (counts[key] || 0) + 1;
        }
      });
    });
    return counts;
  }, [displayLogs, categoryTabs]);

  const filtered = useMemo(() => {
    let logs = [...displayLogs];

    // Category
    if (category !== 'all') {
      logs = logs.filter((l) =>
        categoryMatchesTab(getActionMeta(l.action).category, category),
      );
    }

    // Role
    if (roleFilter !== 'all') {
      logs = logs.filter(l => resolveActivityLogRole(l, usersMap) === roleFilter);
    }

    // Source — offline = local Dexie queue only (pending sync)
    if (sourceFilter !== 'all') {
      logs = sourceFilter === 'offline'
        ? logs.filter(isPendingSyncLog)
        : logs.filter(l => l._source === sourceFilter);
    }

    // Store
    if (storeFilter !== 'all') {
      logs = logs.filter(l => l.storeId === storeFilter);
    }

    // Device (id or name: prefix from filter)
    if (deviceFilter !== 'all') {
      logs = logs.filter((l) => {
        if (deviceFilter.startsWith('name:')) {
          const n = deviceFilter.slice(5);
          return (l.deviceName || l.deviceInfo || '').includes(n);
        }
        return l.deviceId === deviceFilter;
      });
    }

    // Biller / User
    if (billerFilter !== 'all') {
      logs = logs.filter(l => l.userId === billerFilter || l.billerId === billerFilter);
    }

    // Date range
    if (dateFrom) {
      const from = new Date(dateFrom).setHours(0, 0, 0, 0);
      logs = logs.filter(l => {
        const d = parseTimestamp(l.timestamp);
        return d && d >= from;
      });
    }
    if (dateTo) {
      const to = new Date(dateTo).setHours(23, 59, 59, 999);
      logs = logs.filter(l => {
        const d = parseTimestamp(l.timestamp);
        return d && d <= to;
      });
    }

    // Search
    if (deferredSearch.trim()) {
      const s = deferredSearch.toLowerCase();
      logs = logs.filter(l => {
        const uName = usersMap[l.userId]?.name || l.userName || '';
        const sName = resolveStoreName(l.storeId, storesMap);
        const deviceLabel = resolveLogDeviceLabel(l, devicesMap);
        return (
          (l.action || '').toLowerCase().includes(s) ||
          uName.toLowerCase().includes(s) ||
          (l.userId || '').toLowerCase().includes(s) ||
          (l.billSerial || '').toLowerCase().includes(s) ||
          (l.storeId || '').toLowerCase().includes(s) ||
          sName.toLowerCase().includes(s) ||
          (l.deviceId || '').toLowerCase().includes(s) ||
          deviceLabel.toLowerCase().includes(s) ||
          (l.deviceName || '').toLowerCase().includes(s) ||
          (l.deviceInfo || '').toLowerCase().includes(s) ||
          (l.geo || '').toLowerCase().includes(s) ||
          (l.billerName || '').toLowerCase().includes(s) ||
          (l.paymentType || '').toLowerCase().includes(s) ||
          (l.reason || '').toLowerCase().includes(s) ||
          (l.customer?.name || '').toLowerCase().includes(s) ||
          (l._source || '').toLowerCase().includes(s) ||
          (l.networkTag || '').toLowerCase().includes(s)
        );
      });
    }

    return logs;
  }, [displayLogs, category, roleFilter, sourceFilter, storeFilter, billerFilter, deviceFilter, dateFrom, dateTo, deferredSearch, usersMap, storesMap, devicesMap]);

  // ══════════════════════════════════════════════════════════
  // PAGINATION
  // ══════════════════════════════════════════════════════════

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [category, roleFilter, sourceFilter, storeFilter, billerFilter, deviceFilter, dateFrom, dateTo, search, pageSize]);

  // ══════════════════════════════════════════════════════════
  // STATS
  // ══════════════════════════════════════════════════════════

  const stats = useMemo(() => ({
    total: displayLogs.length,
    logins: displayLogs.filter(l => ['USER_LOGIN', 'LOGIN_ATTEMPT'].includes(l.action)).length,
    payments: displayLogs.filter(l => [
      'PAYMENT_RECEIVED', 'PAID', 'BILL_PAID', 'PAYMENT_COLLECTED',
      'MANAGER_PAYMENT', 'MANAGER_PAYMENT_CONFIRMED', 'SUPER_ADMIN_PAYMENT',
    ].includes(l.action)).length,
    deleted: displayLogs.filter(l => ['BILL_DELETED', 'bill_deleted', 'BILL_CANCELLED', 'CANCELLED', 'bill_cancelled', 'item_cleared', 'row_deleted'].includes(l.action)).length,
    offline: displayLogs.filter(isPendingSyncLog).length,
  }), [displayLogs]);

  const activeCategoryLabel = categoryTabs.find((tab) => tab.key === category)?.label || t('activityLog.all', 'All');

  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (category !== 'all') chips.push({ key: 'category', label: activeCategoryLabel });
    if (roleFilter !== 'all') chips.push({ key: 'role', label: getRoleMeta(roleFilter).label });
    if (storeFilter !== 'all') chips.push({ key: 'store', label: resolveStoreName(storeFilter, storesMap) });
    if (billerFilter !== 'all') chips.push({ key: 'biller', label: usersMap[billerFilter]?.name || billerFilter.slice(0, 12) });
    if (deviceFilter !== 'all') {
      const devName = filterOptions.devices.find(([id]) => id === deviceFilter)?.[1] || deviceFilter;
      chips.push({ key: 'device', label: devName });
    }
    if (sourceFilter !== 'all') chips.push({ key: 'source', label: sourceFilter === 'offline' ? 'Offline' : sourceFilter });
    if (dateFrom) chips.push({ key: 'dateFrom', label: `From ${dateFrom}` });
    if (dateTo) chips.push({ key: 'dateTo', label: `To ${dateTo}` });
    if (deferredSearch.trim()) chips.push({ key: 'search', label: `"${deferredSearch.trim().slice(0, 24)}"` });
    return chips;
  }, [category, roleFilter, storeFilter, billerFilter, deviceFilter, sourceFilter, dateFrom, dateTo, deferredSearch, activeCategoryLabel, storesMap, usersMap, filterOptions.devices]);

  const activeFilterCount = activeFilterChips.length;

  const removeFilterChip = (key) => {
    switch (key) {
      case 'category': setCategory('all'); break;
      case 'role': setRoleFilter('all'); break;
      case 'store': setStoreFilter('all'); break;
      case 'biller': setBillerFilter('all'); break;
      case 'device': setDeviceFilter('all'); break;
      case 'source': setSourceFilter('all'); break;
      case 'dateFrom': setDateFrom(''); break;
      case 'dateTo': setDateTo(''); break;
      case 'search': setSearch(''); break;
      default: break;
    }
  };

  const resetFilters = () => {
    setCategory('all'); setRoleFilter('all'); setSourceFilter('all');
    setStoreFilter('all'); setBillerFilter('all'); setDeviceFilter('all');
    setDateFrom(''); setDateTo(''); setSearch('');
  };

  // ══════════════════════════════════════════════════════════
  // STYLES
  // ══════════════════════════════════════════════════════════

  const card = cn(
    'rounded-2xl border',
    isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100'
  );
  const sub = isDark ? 'text-gray-500' : 'text-gray-400';
  const inputCls = cn(
    'rounded-xl border px-3 py-2 text-xs outline-none transition-all w-full',
    isDark
      ? 'bg-[#0a0805] border-[#2a1f0d] text-white placeholder-gray-600 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20'
      : 'bg-white border-amber-200 text-gray-900 placeholder-gray-400 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20'
  );
  const headBg = isDark
    ? 'bg-[#0a0805] text-gray-500 border-[#2a1f0d]'
    : 'bg-amber-50/60 text-gray-500 border-amber-100';
  const rowHover = isDark
    ? 'border-[#1a1208] hover:bg-[#1a1208]/70'
    : 'border-amber-50 hover:bg-amber-50/50';

  if (accessDenied) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center">
        <div className={cn(
          'w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center',
          isDark ? 'bg-red-500/10' : 'bg-red-50',
        )}>
          <ShieldAlert className="w-8 h-8 text-red-500" />
        </div>
        <h2 className={cn('text-lg font-bold mb-2', isDark ? 'text-white' : 'text-gray-900')}>
          {t('activityLog.accessDenied', 'Access Denied')}
        </h2>
        <p className={cn('text-sm leading-relaxed', isDark ? 'text-gray-400' : 'text-gray-600')}>
          {t('activityLog.accessDeniedHint', 'Super Admin: Roles & Permissions → Manager → Activity Logs → View ON')}
        </p>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className={cn(
      embedded
        ? 'space-y-4 sm:space-y-5'
        : 'min-h-screen p-3 sm:p-5 lg:p-6 space-y-4 sm:space-y-5 max-w-[1920px] mx-auto',
      !embedded && (isDark ? 'bg-[#070501]' : 'bg-amber-50/20'),
    )}>

      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center border border-amber-500/20">
            <Activity className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className={cn('text-lg sm:text-xl font-bold', isDark ? 'text-white' : 'text-gray-900')}>
              {t('activityLog.title', 'Activity Logs')}
            </h1>
            <p className={cn('text-[11px]', sub)}>
              {t('activityLog.subtitle', 'Unified audit trail • {{count}} unique events', { count: displayLogs.length.toLocaleString() })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Connection */}
          <span className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium border',
            isOnline
              ? isDark ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-600'
              : isDark ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' : 'bg-orange-50 border-orange-200 text-orange-600'
          )}>
            {isOnline ? <><Wifi className="w-3 h-3" /><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{t('activityLog.live', 'Live')}</> : <><WifiOff className="w-3 h-3" />{t('activityLog.offline', 'Offline')}</>}
          </span>

          {lastUpdated && (
            <span className={cn(
              'hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-medium border',
              isDark ? 'bg-[#0f0a05] border-[#2a1f0d] text-gray-500' : 'bg-white border-amber-100 text-gray-400',
            )}>
              <Clock className="w-3 h-3" />
              {t('activityLog.updatedAt', 'Updated')} {new Date(lastUpdated).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          <button onClick={handleRefresh} className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium border transition-all',
            isDark ? 'bg-[#0f0a05] border-[#2a1f0d] text-gray-300 hover:border-amber-500/40' : 'bg-white border-amber-200 text-gray-700 hover:border-amber-400'
          )}>
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            {t('activityLog.refresh', 'Refresh')}
          </button>

          {canExport && (
            <button onClick={() => exportCSV(filtered)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-amber-500 hover:bg-amber-400 text-black transition-all shadow-md shadow-amber-500/20 hover:shadow-lg">
              <Download className="w-3.5 h-3.5" />
              {t('activityLog.export', 'Export ({{count}})', { count: filtered.length })}
            </button>
          )}
        </div>
      </div>

      {/* ═══ STAT CARDS ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <LogStatCard label={t('activityLog.totalEvents', 'Total Events')} value={stats.total.toLocaleString()} icon={Activity} color="amber" isDark={isDark} onClick={() => { resetFilters(); }} active={category === 'all' && activeFilterCount === 0} />
        <LogStatCard label={t('activityLog.logins', 'Logins')} value={stats.logins} icon={LogIn} color="emerald" isDark={isDark} onClick={() => { resetFilters(); setCategory('auth'); }} active={category === 'auth'} />
        <LogStatCard label={t('activityLog.payments', 'Payments')} value={stats.payments} icon={DollarSign} color="sky" isDark={isDark} onClick={() => { resetFilters(); setCategory('payment'); }} active={category === 'payment'} />
        <LogStatCard label={t('activityLog.deletedCleared', 'Deleted / Cleared')} value={stats.deleted} icon={Trash2} color="rose" isDark={isDark} onClick={() => { resetFilters(); setCategory('cleared'); }} active={category === 'cleared'} />
        <LogStatCard label={t('activityLog.offlineQueue', 'Offline Queue')} value={stats.offline} icon={Database} color="orange" isDark={isDark} onClick={() => { resetFilters(); setSourceFilter('offline'); }} active={sourceFilter === 'offline'} />
      </div>

      {/* ═══ CATEGORY TABS ═══ */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
        {categoryTabs.map(({ key, label, short, icon: Icon }) => {
          const count = categoryCounts[key] ?? 0;
          const isActive = category === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold border transition-all shrink-0',
                isActive
                  ? 'bg-amber-500 border-amber-500 text-black shadow-lg shadow-amber-500/25'
                  : isDark
                    ? 'bg-[#0f0a05] border-[#2a1f0d] text-gray-400 hover:border-amber-500/30 hover:text-amber-400'
                    : 'bg-white border-amber-100 text-gray-500 hover:border-amber-300 hover:text-amber-600',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{short}</span>
              <span className={cn(
                'min-w-[1.25rem] px-1.5 py-0.5 rounded-md text-[9px] font-bold tabular-nums',
                isActive ? 'bg-black/15 text-black' : isDark ? 'bg-white/5 text-gray-500' : 'bg-gray-100 text-gray-500',
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {showDevicesLink && (
        <div className={cn(
          'flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-[11px]',
          isDark ? 'bg-sky-500/5 border-sky-500/20 text-sky-300' : 'bg-sky-50 border-sky-200 text-sky-800',
        )}>
          <span className="flex items-center gap-2 min-w-0">
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            <span>
              Terminal online/offline, lock &amp; branch — manage on{' '}
              <strong>Device Management</strong>. Audit logs only show which device each action came from.
            </span>
          </span>
          <Link
            to="/admin/devices"
            className={cn(
              'inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg font-semibold shrink-0 transition-colors',
              isDark ? 'bg-sky-500/15 text-sky-300 hover:bg-sky-500/25' : 'bg-white text-sky-700 hover:bg-sky-100 border border-sky-200',
            )}
          >
            Open Devices
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* ═══ SEARCH + FILTERS ═══ */}
      <DatePresetBar
        datePreset={datePreset}
        onPresetChange={setDatePreset}
        customFrom={customFromPreset}
        customTo={customToPreset}
        onCustomFromChange={setCustomFromPreset}
        onCustomToChange={setCustomToPreset}
        isDark={isDark}
        className="px-1"
      />

      <div className={card}>
        <div className="p-3 sm:p-4 flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className={cn('absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4', isDark ? 'text-gray-600' : 'text-gray-400')} />
            <input
              className={cn(inputCls, 'pl-9')}
              placeholder={t('activityLog.searchPh', 'Search action, user, bill, device…')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-200 transition-colors" />
              </button>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowFilters(v => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium border transition-all',
                showFilters
                  ? 'bg-amber-500 border-amber-500 text-black'
                  : isDark ? 'bg-[#0a0805] border-[#2a1f0d] text-gray-300 hover:border-amber-500/40' : 'bg-white border-amber-200 text-gray-700 hover:border-amber-400'
              )}>
              <Filter className="w-3.5 h-3.5" />
              {t('activityLog.filters', 'Filters')}
              {activeFilterCount > 0 && (
                <span className={cn('min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center', showFilters ? 'bg-black/20' : 'bg-amber-500 text-black')}>{activeFilterCount}</span>
              )}
              <ChevronDown className={cn('w-3 h-3 transition-transform', showFilters && 'rotate-180')} />
            </button>

            {activeFilterCount > 0 && (
              <button onClick={resetFilters} className={cn(
                'inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium border transition-all',
                isDark ? 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10' : 'border-rose-200 text-rose-500 hover:bg-rose-50'
              )}>
                <X className="w-3.5 h-3.5" />
                {t('common.clearAll', 'Clear All')}
              </button>
            )}
          </div>
        </div>

        {/* Expandable Advanced Filters */}
        {showFilters && (
          <div className={cn(
            'px-3 sm:px-4 pb-4 pt-1 border-t',
            isDark ? 'border-[#2a1f0d]' : 'border-amber-100'
          )}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 pt-3">
              {/* Role */}
              <div className="space-y-1">
                <label className={cn('text-[9px] font-bold uppercase tracking-widest', sub)}>Role</label>
                <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className={inputCls}>
                  <option value="all">All Roles</option>
                  {filterOptions.roles.map(r => (
                    <option key={r} value={r}>{getRoleMeta(r).label}</option>
                  ))}
                </select>
              </div>

              {/* Store */}
              <div className="space-y-1">
                <label className={cn('text-[9px] font-bold uppercase tracking-widest', sub)}>Store</label>
                <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)} className={inputCls}>
                  <option value="all">All Stores</option>
                  {filterOptions.stores.map(s => (
                    <option key={s} value={s}>{resolveStoreName(s, storesMap)}</option>
                  ))}
                </select>
              </div>

              {/* Biller / User */}
              <div className="space-y-1">
                <label className={cn('text-[9px] font-bold uppercase tracking-widest', sub)}>User / Biller</label>
                <select value={billerFilter} onChange={e => setBillerFilter(e.target.value)} className={inputCls}>
                  <option value="all">All Users</option>
                  {filterOptions.billers.map(([uid, name]) => (
                    <option key={uid} value={uid}>{name}</option>
                  ))}
                </select>
              </div>

              {/* Device — filter logs by terminal, not device management */}
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <label className={cn('text-[9px] font-bold uppercase tracking-widest flex items-center gap-1', sub)}>
                  Terminal (action from)
                  {filterOptions.devices.length > 0 && (
                    <span className={cn('px-1.5 py-0.5 rounded text-[8px] font-bold', isDark ? 'bg-sky-500/15 text-sky-400' : 'bg-sky-100 text-sky-600')}>
                      {filterOptions.devices.length}
                    </span>
                  )}
                </label>
                <select value={deviceFilter} onChange={e => setDeviceFilter(e.target.value)} className={inputCls}>
                  <option value="all">All Devices ({filterOptions.devices.length})</option>
                  {filterOptions.devices.length === 0 && (
                    <option value="" disabled>— Login on a terminal to register —</option>
                  )}
                  {filterOptions.devices.map(([id, name]) => (
                    <option key={id} value={id}>{name || id}</option>
                  ))}
                </select>
              </div>

              {/* Source */}
              <div className="space-y-1">
                <label className={cn('text-[9px] font-bold uppercase tracking-widest', sub)}>Source</label>
                <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className={inputCls}>
                  <option value="all">All Sources</option>
                  {FIRESTORE_SOURCES.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                  <option value="offline">Offline (Dexie)</option>
                </select>
              </div>

              {/* Date From */}
              <div className="space-y-1">
                <label className={cn('text-[9px] font-bold uppercase tracking-widest', sub)}>From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
              </div>

              {/* Date To */}
              <div className="space-y-1">
                <label className={cn('text-[9px] font-bold uppercase tracking-widest', sub)}>To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
              </div>

              {/* Page Size */}
              <div className="space-y-1">
                <label className={cn('text-[9px] font-bold uppercase tracking-widest', sub)}>Per Page</label>
                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className={inputCls}>
                  {PAGE_SIZES.map(s => <option key={s} value={s}>{s} rows</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Active filter chips */}
      {activeFilterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('text-[10px] font-bold uppercase tracking-wider', sub)}>Active:</span>
          {activeFilterChips.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => removeFilterChip(key)}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors',
                isDark ? 'bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/20' : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100',
              )}
            >
              {label}
              <X className="w-3 h-3 opacity-70" />
            </button>
          ))}
          <button
            type="button"
            onClick={resetFilters}
            className={cn('text-[10px] font-semibold underline underline-offset-2', isDark ? 'text-rose-400' : 'text-rose-600')}
          >
            Clear all
          </button>
        </div>
      )}

      {/* ═══ TABLE ═══ */}
      <div className={cn(card, 'overflow-hidden shadow-xl')}>
        {/* Table Title Bar */}
        <div className={cn(
          'px-4 sm:px-5 py-3 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2',
          isDark ? 'border-[#2a1f0d]' : 'border-amber-100'
        )}>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={cn('font-bold text-sm', isDark ? 'text-white' : 'text-gray-900')}>
              Activity Records
            </h3>
            <span className={cn('px-2.5 py-1 rounded-lg text-[11px] font-bold', isDark ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-100 text-amber-700')}>
              {filtered.length.toLocaleString()} of {displayLogs.length.toLocaleString()}
            </span>
            {activeFilterCount > 0 && (
              <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-medium', isDark ? 'bg-sky-500/10 text-sky-400' : 'bg-sky-50 text-sky-600')}>
                {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
              </span>
            )}
          </div>
          <span className={cn('text-[11px]', sub)}>
            Page {safePage} of {totalPages} • {pageSize}/page
          </span>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="relative">
              <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
              <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-amber-500 animate-ping" />
            </div>
            <p className={cn('text-sm font-medium', sub)}>Loading from all sources...</p>
            <div className="flex gap-1.5 flex-wrap justify-center">
              {FIRESTORE_SOURCES.map(s => (
                <span key={s.key} className={cn('text-[9px] px-2 py-0.5 rounded-full', isDark ? 'bg-[#1a1208] text-gray-600' : 'bg-gray-100 text-gray-400')}>
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 sm:py-24 gap-3 px-4 text-center">
            <Activity className={cn('w-12 h-12', isDark ? 'text-gray-800' : 'text-gray-200')} />
            <p className={cn('text-sm font-semibold', isDark ? 'text-gray-500' : 'text-gray-400')}>
              No logs in <span className="text-amber-400">{activeCategoryLabel}</span>
            </p>
            <p className={cn('text-xs max-w-md', sub)}>
              {category !== 'all'
                ? `This category has ${categoryCounts[category] ?? 0} total events. Try another tab or clear filters.`
                : 'Try adjusting your search or date filters.'}
            </p>
            {activeFilterCount > 0 && (
              <button onClick={resetFilters} className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop / Tablet Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full min-w-[1200px] table-fixed text-xs text-left border-collapse">
                <colgroup>
                  <col className="w-[40px]" />
                  <col className="w-[124px]" />
                  <col className="w-[192px]" />
                  <col className="w-[136px]" />
                  <col className="w-[92px]" />
                  <col className="w-[116px]" />
                  <col className="w-[108px]" />
                  <col className="w-[116px]" />
                  <col className="w-[40px]" />
                </colgroup>
                <thead className={cn('sticky top-0 z-10 border-b', headBg)}>
                  <tr>
                    <th className={cn('px-2 py-3 font-semibold uppercase tracking-wider text-[10px] text-center', sub)}>#</th>
                    <th className={cn('px-3 py-3 font-semibold uppercase tracking-wider text-[10px]', sub)}>Date & Time</th>
                    <th className={cn('px-3 py-3 font-semibold uppercase tracking-wider text-[10px]', sub)}>Action</th>
                    <th className={cn('px-3 py-3 font-semibold uppercase tracking-wider text-[10px]', sub)}>User</th>
                    <th className={cn('px-3 py-3 font-semibold uppercase tracking-wider text-[10px]', sub)}>Role</th>
                    <th className={cn('px-3 py-3 font-semibold uppercase tracking-wider text-[10px]', sub)}>Store</th>
                    <th className={cn('px-3 py-3 font-semibold uppercase tracking-wider text-[10px]', sub)}>Bill / Amount</th>
                    <th className={cn('px-3 py-3 font-semibold uppercase tracking-wider text-[10px] hidden xl:table-cell', sub)}>Device</th>
                    <th className="px-2 py-3" aria-label="Expand" />
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((log, idx) => {
                    const isExp = expandedId === log._id;
                    const gIdx = (safePage - 1) * pageSize + idx + 1;
                    const uName = usersMap[log.userId]?.name || log.userName || log.billerName || '—';
                    const uEmail = usersMap[log.userId]?.email || '';
                    const sName = resolveStoreName(log.storeId, storesMap);
                    const sLoc = findStoreRecord(log.storeId, storesMap)?.location || '';
                    const role = log.role || resolveActivityLogRole(log, usersMap);

                    return (
                      <Fragment key={log._id}>
                        <tr
                          onClick={() => setExpandedId(isExp ? null : log._id)}
                          className={cn(
                            'border-t transition-all cursor-pointer select-none group align-top',
                            rowHover,
                            isExp && (isDark ? 'bg-[#1a1208] !border-amber-500/20' : 'bg-amber-50 !border-amber-200'),
                            isPendingSyncLog(log) && 'border-l-2 border-l-orange-500/40',
                          )}
                        >
                          <td className={cn('px-2 py-3 font-mono text-[10px] font-bold text-center align-top', sub)}>{gIdx}</td>

                          <td className="px-3 py-3 align-top min-w-0">
                            <p className={cn('font-medium text-[11px] leading-tight', isDark ? 'text-gray-300' : 'text-gray-700')}>{fmt.date(log.timestamp)}</p>
                            <p className={cn('font-mono text-[10px] leading-tight mt-0.5', sub)}>{fmt.time(log.timestamp)}</p>
                            <p className={cn('text-[9px] mt-0.5', sub)}>{fmt.ago(log.timestamp)}</p>
                          </td>

                          <td className="px-3 py-3 align-top overflow-hidden">
                            <ActionBadge action={log.action} />
                          </td>

                          <td className="px-3 py-3 align-top overflow-hidden">
                            <p className={cn('font-semibold text-[11px] leading-tight break-words [overflow-wrap:anywhere]', isDark ? 'text-gray-200' : 'text-gray-800')} title={uName}>{uName}</p>
                            {uEmail && <p className={cn('text-[9px] mt-0.5 break-all line-clamp-2', sub)} title={uEmail}>{uEmail}</p>}
                          </td>

                          <td className="px-3 py-3 align-top"><RoleBadge role={role} /></td>

                          <td className="px-3 py-3 align-top overflow-hidden">
                            <p className={cn('font-medium text-[11px] leading-tight break-words [overflow-wrap:anywhere]', isDark ? 'text-gray-300' : 'text-gray-700')} title={sName}>{sName || '—'}</p>
                            {sLoc && <p className={cn('text-[9px] mt-0.5 line-clamp-2', sub)} title={sLoc}>{sLoc}</p>}
                          </td>

                          <td className="px-3 py-3 align-top min-w-0">
                            {log.billSerial && log.billSerial !== '----' && (
                              <p className={cn('text-[10px] font-mono leading-tight break-all', isDark ? 'text-sky-400' : 'text-sky-600')} title={log.billSerial}>
                                #{log.billSerial.length > 18 ? log.billSerial.slice(-12) : log.billSerial}
                              </p>
                            )}
                            {log.amount > 0 && (
                              <p className={cn('text-[11px] font-semibold mt-0.5', isDark ? 'text-emerald-400' : 'text-emerald-600')}>
                                {fmt.currency(log.amount)}
                              </p>
                            )}
                          </td>

                          <td className="px-3 py-3 align-top overflow-hidden hidden xl:table-cell">
                            {(() => {
                              const label = resolveLogDeviceLabel(log, devicesMap);
                              if (label === '—') return <span className={sub}>—</span>;
                              return (
                                <p className={cn('text-[10px] font-medium leading-tight break-words [overflow-wrap:anywhere]', isDark ? 'text-gray-200' : 'text-gray-800')} title={label}>
                                  {label}
                                </p>
                              );
                            })()}
                          </td>

                          <td className="px-2 py-3 text-center align-top">
                            <Eye className={cn('w-4 h-4 mx-auto transition-all', isExp ? 'text-amber-400 scale-110' : 'text-gray-700 group-hover:text-gray-400')} />
                          </td>
                        </tr>

                        {isExp && (
                          <tr className={cn(isDark ? 'bg-[#080603]' : 'bg-amber-50/30')}>
                            <td colSpan={9} className="p-0">
                              <ExpandedDetail log={log} isDark={isDark} usersMap={usersMap} storesMap={storesMap} devicesMap={devicesMap} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile + Tablet Cards */}
            <div className={cn('lg:hidden divide-y', isDark ? 'divide-[#1a1208]' : 'divide-amber-100')}>
              {paginated.map((log, idx) => {
                const isExp = expandedId === log._id;
                const gIdx = (safePage - 1) * pageSize + idx + 1;
                const uName = usersMap[log.userId]?.name || log.userName || log.billerName || '—';
                const sName = resolveStoreName(log.storeId, storesMap);
                const role = log.role || resolveActivityLogRole(log, usersMap);
                const deviceName = resolveLogDeviceLabel(log, devicesMap);

                return (
                  <div key={log._id}>
                    <button
                      onClick={() => setExpandedId(isExp ? null : log._id)}
                      className={cn(
                        'w-full text-left p-3 sm:p-4 transition-all',
                        isExp ? (isDark ? 'bg-[#1a1208]' : 'bg-amber-50') : (isDark ? 'hover:bg-[#1a1208]/50' : 'hover:bg-amber-50/50'),
                        isPendingSyncLog(log) && 'border-l-2 border-l-orange-500/40'
                      )}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <div className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5',
                            isDark ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-100 text-amber-600'
                          )}>
                            {uName[0]?.toUpperCase() || '#'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn('font-semibold text-xs', isDark ? 'text-gray-200' : 'text-gray-800')}>{uName}</span>
                              <RoleBadge role={role} />
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <ActionBadge action={log.action} />
                              <SourceBadge source={log._source} isDark={isDark} />
                            </div>
                            <div className={cn('flex items-center gap-3 mt-1.5 text-[10px]', sub)}>
                              <span className="flex items-center gap-1"><Calendar className="w-2.5 h-2.5" />{fmt.date(log.timestamp)}</span>
                              <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{fmt.time(log.timestamp)}</span>
                            </div>
                            {/* Extra info row */}
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {sName && <span className={cn('text-[10px] flex items-center gap-0.5', sub)}><MapPin className="w-2.5 h-2.5" />{sName}</span>}
                              {deviceName && <span className={cn('text-[10px] flex items-center gap-0.5', sub)}><Smartphone className="w-2.5 h-2.5" />{deviceName}</span>}
                              {log.billSerial && log.billSerial !== '----' && (
                                <span className={cn('text-[10px] font-mono', isDark ? 'text-sky-500' : 'text-sky-600')}>#{log.billSerial.slice(-10)}</span>
                              )}
                              {log.amount > 0 && (
                                <span className={cn('text-[10px] font-bold', isDark ? 'text-emerald-400' : 'text-emerald-600')}>{fmt.currency(log.amount)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn('text-[9px]', sub)}>{fmt.ago(log.timestamp)}</span>
                          <Eye className={cn('w-3.5 h-3.5 transition-all', isExp ? 'text-amber-400' : 'text-gray-700')} />
                        </div>
                      </div>
                    </button>
                    {isExp && <ExpandedDetail log={log} isDark={isDark} usersMap={usersMap} storesMap={storesMap} devicesMap={devicesMap} />}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ═══ PAGINATION ═══ */}
        {!loading && paginated.length > 0 && (
          <div className={cn(
            'px-4 sm:px-5 py-3 sm:py-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3',
            isDark ? 'border-[#2a1f0d]' : 'border-amber-100'
          )}>
            <p className={cn('text-[11px]', sub)}>
              Showing{' '}
              <span className="font-bold text-amber-400">{(safePage - 1) * pageSize + 1}</span>
              –
              <span className="font-bold text-amber-400">{Math.min(safePage * pageSize, filtered.length)}</span>
              {' '}of{' '}
              <span className="font-bold">{filtered.length.toLocaleString()}</span>
            </p>

            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              {/* First */}
              <PaginationBtn onClick={() => setPage(1)} disabled={safePage === 1} isDark={isDark}>«</PaginationBtn>
              {/* Prev */}
              <PaginationBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} isDark={isDark}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </PaginationBtn>

              {/* Page numbers */}
              {(() => {
                const pages = [];
                let start = Math.max(1, safePage - 2);
                let end = Math.min(totalPages, start + 4);
                if (end - start < 4) start = Math.max(1, end - 4);

                for (let p = start; p <= end; p++) {
                  pages.push(
                    <button key={p} onClick={() => setPage(p)}
                      className={cn(
                        'w-8 h-8 rounded-lg text-[11px] font-bold border transition-all',
                        p === safePage
                          ? 'bg-amber-500 border-amber-500 text-black shadow-md shadow-amber-500/30 scale-105'
                          : isDark
                            ? 'bg-[#0a0805] border-[#2a1f0d] text-gray-400 hover:border-amber-500/40 hover:text-amber-400'
                            : 'bg-white border-amber-200 text-gray-600 hover:border-amber-400'
                      )}>
                      {p}
                    </button>
                  );
                }
                return pages;
              })()}

              {/* Next */}
              <PaginationBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} isDark={isDark}>
                <ChevronRight className="w-3.5 h-3.5" />
              </PaginationBtn>
              {/* Last */}
              <PaginationBtn onClick={() => setPage(totalPages)} disabled={safePage === totalPages} isDark={isDark}>»</PaginationBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── PAGINATION BUTTON ──
const PaginationBtn = ({ children, onClick, disabled, isDark }) => (
  <button onClick={onClick} disabled={disabled}
    className={cn(
      'inline-flex items-center justify-center min-w-[32px] h-8 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-25 disabled:cursor-not-allowed',
      isDark
        ? 'bg-[#0a0805] border-[#2a1f0d] text-gray-300 hover:border-amber-500/40 hover:text-amber-400'
        : 'bg-white border-amber-200 text-gray-700 hover:border-amber-400'
    )}>
    {children}
  </button>
);

export default ActivityLogsDashboard;