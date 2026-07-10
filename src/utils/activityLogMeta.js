// Action labels + categories for Activity Logs dashboard (admin + manager)

import {
  Activity, LogIn, LogOut, FileText, Trash2, Edit, Lock, Unlock,
  Shield, ShieldAlert, CheckCircle, XCircle, DollarSign, Database,
  Smartphone, TrendingUp, RotateCcw, Eraser, Package, Clock, CreditCard,
  AlertTriangle, Users,
} from 'lucide-react';

export const inferActivityCategory = (action) => {
  const a = String(action || '').toLowerCase();
  if (a.startsWith('device:')) return 'device';
  if (a.includes('approval')) return 'approval';
  if (
    a.startsWith('admin_') ||
    a.startsWith('setting:') ||
    a === 'settings_change' ||
    a === 'cache_cleared' ||
    a === 'data_deleted' ||
    a === 'admin_action'
  ) {
    return 'admin';
  }
  if (a.includes('login') || a.includes('logout') || a.includes('session')) return 'auth';
  if (a.includes('payment') || a === 'paid' || a === 'bill_paid') return 'payment';
  if (a.includes('clear') || a.includes('deleted') || a.includes('cancel')) return 'cleared';
  return 'other';
};

export const ACTION_CONFIG = {
  USER_LOGIN:         { label: 'Login',              icon: LogIn,          color: 'emerald', category: 'auth' },
  USER_LOGOUT:        { label: 'Logout',             icon: LogOut,         color: 'blue',    category: 'auth' },
  LOGIN_ATTEMPT:      { label: 'Login Attempt',      icon: ShieldAlert,    color: 'amber',   category: 'auth' },
  SESSION_TIMEOUT:    { label: 'Session Timeout',    icon: Clock,          color: 'orange',  category: 'auth' },
  CASHIER_PAYMENT:    { label: 'Cashier Payment',    icon: DollarSign,     color: 'emerald', category: 'payment' },
  CASHIER_CANCEL:     { label: 'Cashier Cancel',     icon: XCircle,        color: 'rose',    category: 'billing' },
  CASHIER_EDIT:       { label: 'Cashier Edit',       icon: Edit,           color: 'sky',     category: 'billing' },
  QR_SCAN_SUCCESS:    { label: 'QR Scan Success',    icon: CheckCircle,    color: 'emerald', category: 'billing' },
  QR_MISMATCH:        { label: 'QR Mismatch',        icon: AlertTriangle,  color: 'yellow',  category: 'billing' },
  OFFLINE_PAYMENT_SAVED: { label: 'Offline Payment', icon: Database,       color: 'orange',  category: 'payment' },
  BILL_CREATED:       { label: 'Bill Created',       icon: FileText,       color: 'sky',     category: 'billing' },
  ORDER_SUBMITTED:    { label: 'Order Submitted',    icon: FileText,       color: 'sky',     category: 'billing' },
  BILL_PAID:          { label: 'Bill Paid',          icon: CheckCircle,    color: 'emerald', category: 'payment' },
  PAID:               { label: 'Bill Paid',          icon: CheckCircle,    color: 'emerald', category: 'payment' },
  BILL_CANCELLED:     { label: 'Bill Cancelled',     icon: XCircle,        color: 'rose',    category: 'billing' },
  CANCELLED:          { label: 'Cancelled',          icon: XCircle,        color: 'rose',    category: 'billing' },
  BILL_DELETED:       { label: 'Bill Deleted',       icon: Trash2,         color: 'red',     category: 'billing' },
  BILL_UPDATED:       { label: 'Bill Updated',       icon: Edit,           color: 'blue',    category: 'billing' },
  BILL_EDITED:        { label: 'Bill Edited',        icon: Edit,           color: 'purple',  category: 'billing' },
  BILL_HOLD:          { label: 'Bill Hold',          icon: AlertTriangle,  color: 'yellow',  category: 'billing' },
  BILL_HOLD_RESTORE:  { label: 'Hold Restored',      icon: RotateCcw,      color: 'purple',  category: 'billing' },
  BILL_REPRINT:       { label: 'Bill Reprint',       icon: FileText,       color: 'indigo',  category: 'billing' },
  BILL_CLEARED:       { label: 'Bill Cleared',       icon: Eraser,         color: 'orange',  category: 'billing' },
  BILL_RETURNED:      { label: 'Bill Returned',      icon: RotateCcw,      color: 'amber',   category: 'billing' },
  RETURN_PROCESSED:   { label: 'Return Processed',   icon: RotateCcw,      color: 'amber',   category: 'billing' },
  ITEM_ADDED:         { label: 'Item Added',         icon: Package,        color: 'cyan',    category: 'billing' },
  PAYMENT_RECEIVED:   { label: 'Payment Received',   icon: DollarSign,     color: 'emerald', category: 'payment' },
  PAYMENT_PROCESSED:  { label: 'Payment Processed',  icon: CreditCard,     color: 'green',   category: 'payment' },
  PAYMENT_COLLECTED:  { label: 'Payment Collected',  icon: DollarSign,     color: 'emerald', category: 'payment' },
  MANAGER_PAYMENT:    { label: 'Manager Payment',    icon: DollarSign,     color: 'emerald', category: 'payment' },
  MANAGER_PAYMENT_CONFIRMED: { label: 'Manager Confirmed', icon: CheckCircle, color: 'emerald', category: 'payment' },
  SUPER_ADMIN_PAYMENT:{ label: 'Super Admin Paid',   icon: DollarSign,     color: 'violet',  category: 'payment' },
  item_cleared:       { label: 'Item Cleared',       icon: Eraser,         color: 'orange',  category: 'cleared' },
  row_deleted:        { label: 'Row Deleted',        icon: Trash2,         color: 'red',     category: 'cleared' },
  bill_cancelled:     { label: 'Bill Cancelled',     icon: XCircle,        color: 'rose',    category: 'cleared' },
  bill_deleted:       { label: 'Bill Deleted',       icon: Trash2,         color: 'red',     category: 'cleared' },
  DISCOUNT_APPLIED:   { label: 'Discount Applied',   icon: TrendingUp,     color: 'pink',    category: 'billing' },
  DISCOUNT_APPROVAL:  { label: 'Discount Approved',  icon: CheckCircle,    color: 'emerald', category: 'billing' },
  MANAGER_APPROVAL:   { label: 'Manager Approval',   icon: Shield,         color: 'violet',  category: 'billing' },
  APPROVAL_REQUEST_CREATED:  { label: 'Approval Requested', icon: Shield, color: 'violet', category: 'billing' },
  APPROVAL_REQUEST_PROCESSED:  { label: 'Approval Processed', icon: CheckCircle, color: 'emerald', category: 'billing' },
  SUPER_APPROVAL_REQUEST_PROCESSED: { label: 'Super Approval', icon: Shield, color: 'violet', category: 'billing' },
  ADMIN_ACTION:       { label: 'Admin Action',       icon: Shield,         color: 'amber',   category: 'admin' },
  SETTINGS_CHANGE:    { label: 'Settings Changed',   icon: Edit,           color: 'slate',   category: 'admin' },
  CACHE_CLEARED:      { label: 'Cache Cleared',      icon: Database,       color: 'orange',  category: 'admin' },
  DATA_DELETED:       { label: 'Data Deleted',       icon: Trash2,         color: 'red',     category: 'admin' },
  CUSTOMER_ADDED:     { label: 'Customer Added',     icon: Users,          color: 'sky',     category: 'billing' },
  CUSTOMER_UPDATED:   { label: 'Customer Updated',   icon: Edit,           color: 'blue',    category: 'billing' },
  EXPENSE_ADDED:      { label: 'Expense Added',      icon: DollarSign,     color: 'orange',  category: 'admin' },
  EXPENSE_APPROVED:   { label: 'Expense Approved',   icon: CheckCircle,    color: 'emerald', category: 'billing' },
  EXPENSE_REJECTED:   { label: 'Expense Rejected',   icon: XCircle,        color: 'rose',    category: 'billing' },
  COMMISSION_PAID:    { label: 'Commission Paid',    icon: DollarSign,     color: 'purple',  category: 'admin' },
  SHIFT_OPENED:       { label: 'Shift Opened',       icon: Clock,          color: 'green',   category: 'admin' },
  SHIFT_CLOSED:       { label: 'Shift Closed',       icon: Clock,          color: 'red',     category: 'admin' },
  'device:register':  { label: 'Device Registered',  icon: Smartphone,     color: 'sky',     category: 'admin' },
  'device:revoke':    { label: 'Device Revoked',     icon: Lock,           color: 'rose',    category: 'admin' },
  'device:authorize': { label: 'Device Authorized', icon: Unlock,         color: 'emerald', category: 'admin' },
  'device:delete':    { label: 'Device Deleted',     icon: Trash2,         color: 'red',     category: 'admin' },
  'device:update':    { label: 'Device Updated',     icon: Edit,           color: 'blue',    category: 'admin' },
};

/** Map UI tab keys to underlying action categories */
export const categoryMatchesTab = (actionCategory, tabKey) => {
  if (tabKey === 'all') return true;
  if (tabKey === 'billing') {
    return actionCategory === 'billing' || actionCategory === 'approval' || actionCategory === 'other';
  }
  if (tabKey === 'admin') {
    return actionCategory === 'admin' || actionCategory === 'device';
  }
  return actionCategory === tabKey;
};

export const getActionMeta = (action) => {
  if (ACTION_CONFIG[action]) return ACTION_CONFIG[action];
  const category = inferActivityCategory(action);
  const label = String(action || 'Unknown')
    .replace(/^device:/, 'Device ')
    .replace(/^setting:/, 'Setting ')
    .replace(/_/g, ' ');
  return {
    label,
    icon: Activity,
    color: category === 'device' ? 'sky' : category === 'approval' ? 'violet' : category === 'admin' ? 'amber' : 'gray',
    category,
  };
};

const BILLER_ACTION_RE =
  /^(BILL_CREATED|ORDER_SUBMITTED|ORDER_|ITEM_ADDED|DISCOUNT_APPLIED|BILL_HOLD|BILL_HOLD_RESTORE|BILL_REPRINT|ITEM_SALESPERSON|BILL_CLEARED|BILL_RETURNED|RETURN_PROCESSED|CUSTOMER_|BILL_UPDATED|BILL_EDITED)/;
const CASHIER_ACTION_RE =
  /^(PAID|CASHIER_|PAYMENT_|QR_|OFFLINE_PAYMENT|BILL_PAID)/;
const MANAGER_ACTION_RE =
  /^(MANAGER_|APPROVAL_|SUPER_APPROVAL|EXPENSE_APPROVED|EXPENSE_REJECTED)/;
const ADMIN_ACTION_RE =
  /^(ADMIN_|SETTING|CACHE_|DATA_DELETED|COMMISSION_|SHIFT_|DEVICE:|SUPER_ADMIN_PAYMENT)/;

const isBillerAction = (action) => {
  const act = String(action || '').toUpperCase();
  if (BILLER_ACTION_RE.test(act)) return true;
  return (/ORDER|SUBMIT|DRAFT|SEND/.test(act) && !/PAID|PAYMENT/.test(act));
};

const pickRoleForUserAndAction = (userDoc, action) => {
  if (!userDoc) return '';
  const roles = Array.isArray(userDoc.roles) && userDoc.roles.length
    ? userDoc.roles
    : userDoc.role
      ? (Array.isArray(userDoc.role) ? userDoc.role : [userDoc.role])
      : [];
  const act = String(action || '').toUpperCase();

  if (isBillerAction(act) || (/BILL|ITEM|DISCOUNT/.test(act) && !/PAID|PAYMENT/.test(act))) {
    if (roles.includes('biller')) return 'biller';
  }
  if (CASHIER_ACTION_RE.test(act)) {
    if (roles.includes('cashier')) return 'cashier';
  }
  if (MANAGER_ACTION_RE.test(act)) {
    if (roles.includes('manager')) return 'manager';
  }
  if (ADMIN_ACTION_RE.test(act)) {
    if (roles.includes('admin') || roles.includes('superAdmin') || roles.includes('superadmin')) {
      return roles.find((r) => ['superAdmin', 'superadmin', 'admin'].includes(r)) || 'admin';
    }
  }

  return userDoc.primaryRole || roles[0] || '';
};

/** Resolve display role — action/context first, usersMap last (never override biller actions with primaryRole) */
export const resolveActivityLogRole = (log, usersMap = {}) => {
  const explicit = log?.role || log?.raw?.role;
  if (explicit && explicit !== 'unknown') return explicit;

  const action = log?.action || log?.raw?.actionType || log?.raw?.type || log?.raw?.action || '';

  if (isBillerAction(action)) return 'biller';
  if (String(action).toUpperCase() === 'SUPER_ADMIN_PAYMENT') return 'superAdmin';
  if (CASHIER_ACTION_RE.test(String(action).toUpperCase())) return 'cashier';
  if (MANAGER_ACTION_RE.test(String(action).toUpperCase())) return 'manager';
  if (ADMIN_ACTION_RE.test(String(action).toUpperCase())) return 'admin';

  if (log?._source === 'clearedData' || log?._source === 'deletedBills') return 'biller';

  const uid = String(log?.userId || log?.raw?.userId || '').trim();
  const billerId = String(log?.billerId || log?.raw?.billerId || '').trim();
  const cashierId = String(log?.cashierId || log?.raw?.cashierId || '').trim();
  if (billerId && uid === billerId) return 'biller';
  if (cashierId && uid === cashierId) return 'cashier';

  if (log?._source === 'cashierActions') return 'cashier';

  const act = String(action).toUpperCase();
  if (/BILL|ITEM|DISCOUNT|ORDER|SUBMIT/.test(act) && !/PAID|PAYMENT/.test(act)) {
    return 'biller';
  }

  if (uid && usersMap[uid]) {
    return pickRoleForUserAndAction(usersMap[uid], action);
  }

  return '';
};

/** @deprecated use resolveActivityLogRole */
export const inferActivityRole = resolveActivityLogRole;

export const FIRESTORE_ACTIVITY_SOURCES = [
  { key: 'auditLogs',      collection: 'auditLogs',      orderField: 'timestamp',   orderFieldAlt: null, label: 'Audit Logs' },
  { key: 'cashierActions', collection: 'cashierActions', orderField: 'timestamp',   orderFieldAlt: 'performedAt', label: 'Cashier Actions' },
  { key: 'clearedData',    collection: 'clearedData',    orderField: 'deletedAt',   orderFieldAlt: null, label: 'Cleared Data' },
  { key: 'deletedBills',   collection: 'deletedBills',    orderField: 'deletedAt',   orderFieldAlt: 'timestamp', label: 'Deleted Bills' },
  { key: 'activityLogs',   collection: 'activityLogs',    orderField: 'timestamp',   orderFieldAlt: '_createdAt', label: 'Activity Logs' },
];
