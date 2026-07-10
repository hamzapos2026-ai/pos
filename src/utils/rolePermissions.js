// File: src/utils/rolePermissions.js
// ✅ COMPLETE — Multi-role permission system
// ✅ All exports needed by UserForm, RoleSelector, PermissionMatrix
// ✅ Offline-safe pure functions

import { canViewCommissionFromMatrix } from './roleFeaturePermissions';

export const ROLES = {
  superAdmin: 'superAdmin',
  admin: 'admin',
  manager: 'manager',
  biller: 'biller',
  cashier: 'cashier',
};

// ─── ROLE INFO (used by UI components) ──────────────────────
export const ROLE_INFO = {
  superAdmin: {
    label: 'Super Admin',
    shortDesc: 'Full system control',
    description: 'Complete access to everything',
    icon: 'Crown',
    color: 'red',
    textColor: 'text-red-400',
    bgColor: 'bg-red-500/15',
    ringColor: 'ring-red-500/30',
    gradientFrom: 'from-red-500',
    gradientTo: 'to-rose-600',
    chipBg: 'bg-red-500/15',
    chipText: 'text-red-300',
    chipBorder: 'border-red-500/30',
  },
  admin: {
    label: 'Admin',
    shortDesc: 'Branch management',
    description: 'Manage users, view all reports',
    icon: 'ShieldCheck',
    color: 'purple',
    textColor: 'text-purple-400',
    bgColor: 'bg-purple-500/15',
    ringColor: 'ring-purple-500/30',
    gradientFrom: 'from-purple-500',
    gradientTo: 'to-indigo-600',
    chipBg: 'bg-purple-500/15',
    chipText: 'text-purple-300',
    chipBorder: 'border-purple-500/30',
  },
  manager: {
    label: 'Manager',
    shortDesc: 'Reports & oversight',
    description: 'View reports, approve discounts',
    icon: 'Users',
    color: 'blue',
    textColor: 'text-blue-400',
    bgColor: 'bg-blue-500/15',
    ringColor: 'ring-blue-500/30',
    gradientFrom: 'from-blue-500',
    gradientTo: 'to-cyan-600',
    chipBg: 'bg-blue-500/15',
    chipText: 'text-blue-300',
    chipBorder: 'border-blue-500/30',
  },
  biller: {
    label: 'Biller',
    shortDesc: 'Create bills',
    description: 'Fast billing operations',
    icon: 'Receipt',
    color: 'green',
    textColor: 'text-green-400',
    bgColor: 'bg-green-500/15',
    ringColor: 'ring-green-500/30',
    gradientFrom: 'from-green-500',
    gradientTo: 'to-emerald-600',
    chipBg: 'bg-green-500/15',
    chipText: 'text-green-300',
    chipBorder: 'border-green-500/30',
  },
  cashier: {
    label: 'Cashier',
    shortDesc: 'Receive payments',
    description: 'Handle payments & verify',
    icon: 'CreditCard',
    color: 'orange',
    textColor: 'text-orange-400',
    bgColor: 'bg-orange-500/15',
    ringColor: 'ring-orange-500/30',
    gradientFrom: 'from-orange-500',
    gradientTo: 'to-amber-600',
    chipBg: 'bg-orange-500/15',
    chipText: 'text-orange-300',
    chipBorder: 'border-orange-500/30',
  },
};

// ─── DEFAULT PERMISSIONS PER ROLE ───────────────────────────
export const DEFAULT_PERMISSIONS = {
  superAdmin: {
    viewAllStores: true,
    createUsers: true,
    deleteUsers: true,
    assignRoles: true,
    changeSettings: true,
    viewAllReports: true,
    editPayments: true,
    deleteBills: true,
    viewAuditLog: true,
    exportData: true,
    createBackups: true,
    createBills: true,
    canHoldBill: true,
    canReturn: true,
    canCancel: true,
    receivePayments: true,
    approveDiscounts: true,
    manageStores: true,
    viewFraudAlerts: true,
    resetPasswords: false,
    showProductNames: true,
    manageCommission: true,
    viewCommissionReports: true,
    maxDiscountPercent: 100,
    maxBillDiscountPercent: 100,
  },
  admin: {
    viewAllStores: false,
    createUsers: true,
    deleteUsers: false,
    assignRoles: true,
    changeSettings: true,
    viewAllReports: true,
    editPayments: true,
    deleteBills: true,
    viewAuditLog: true,
    exportData: true,
    createBackups: true,
    createBills: true,
    canHoldBill: true,
    canReturn: true,
    canCancel: true,
    receivePayments: true,
    approveDiscounts: true,
    manageStores: false,
    viewFraudAlerts: true,
    resetPasswords: true,
    showProductNames: false,
    manageCommission: false,
    viewCommissionReports: true,
    maxDiscountPercent: 50,
    maxBillDiscountPercent: 50,
  },
  manager: {
    viewAllStores: false,
    createUsers: false,
    deleteUsers: false,
    assignRoles: false,
    changeSettings: false,
    viewAllReports: true,
    editPayments: true,
    deleteBills: true,
    viewAuditLog: true,
    exportData: false,
    createBackups: false,
    createBills: true,
    canHoldBill: true,
    canReturn: true,
    canCancel: true,
    receivePayments: true,
    approveDiscounts: true,
    manageStores: false,
    viewFraudAlerts: true,
    resetPasswords: false,
    showProductNames: false,
    manageCommission: false,
    viewCommissionReports: false,
    maxDiscountPercent: 20,
    maxBillDiscountPercent: 20,
  },
  biller: {
    viewAllStores: false,
    createUsers: false,
    deleteUsers: false,
    assignRoles: false,
    changeSettings: false,
    viewAllReports: false,
    editPayments: false,
    deleteBills: false,
    viewAuditLog: false,
    exportData: false,
    createBackups: false,
    createBills: true,
    canHoldBill: true,
    canReturn: false,
    canCancel: false,
    receivePayments: false,
    approveDiscounts: false,
    manageStores: false,
    viewFraudAlerts: false,
    resetPasswords: false,
    showProductNames: false,
    manageCommission: false,
    viewCommissionReports: false,
    maxDiscountPercent: 10,
    maxBillDiscountPercent: 10,
  },
  cashier: {
    viewAllStores: false,
    createUsers: false,
    deleteUsers: false,
    assignRoles: false,
    changeSettings: false,
    viewAllReports: false,
    editPayments: true,
    deleteBills: false,
    viewAuditLog: false,
    exportData: false,
    createBackups: false,
    createBills: false,
    canHoldBill: false,
    canReturn: false,
    canCancel: true,
    receivePayments: true,
    approveDiscounts: false,
    manageStores: false,
    viewFraudAlerts: false,
    resetPasswords: false,
    showProductNames: false,
    manageCommission: false,
    viewCommissionReports: false,
    maxDiscountPercent: 5,
    maxBillDiscountPercent: 5,
  },
};

// Backward compat alias
export const PERMISSIONS = DEFAULT_PERMISSIONS;

// ─── PERMISSION GROUPS (for PermissionMatrix UI) ────────────
export const PERMISSION_GROUPS = [
  {
    label: 'Billing',
    icon: 'Receipt',
    color: 'green',
    keys: [
      { key: 'createBills', label: 'Create Bills' },
      { key: 'canHoldBill', label: 'Hold Bills' },
      { key: 'canReturn', label: 'Process Returns' },
      { key: 'canCancel', label: 'Cancel Bills' },
      { key: 'deleteBills', label: 'Delete Bills' },
      { key: 'showProductNames', label: 'Show Product Names' },
    ],
  },
  {
    label: 'Payments',
    icon: 'CreditCard',
    color: 'orange',
    keys: [
      { key: 'receivePayments', label: 'Receive Payments' },
      { key: 'editPayments', label: 'Edit Payments' },
      { key: 'approveDiscounts', label: 'Approve Discounts' },
      { key: 'maxDiscountPercent', label: 'Max Item Discount %', isNumber: true },
      { key: 'maxBillDiscountPercent', label: 'Max Bill Discount %', isNumber: true },
    ],
  },
  {
    label: 'Reports & Audit',
    icon: 'BarChart2',
    color: 'blue',
    keys: [
      { key: 'viewAllReports', label: 'View All Reports' },
      { key: 'viewCommissionReports', label: 'Can View Commission Reports' },
      { key: 'viewAuditLog', label: 'View Audit Log' },
      { key: 'viewFraudAlerts', label: 'View Fraud Alerts' },
      { key: 'exportData', label: 'Export Data' },
      { key: 'createBackups', label: 'Create Backups' },
    ],
  },
  {
    label: 'Users & Access',
    icon: 'Users',
    color: 'purple',
    keys: [
      { key: 'createUsers', label: 'Create Users' },
      { key: 'deleteUsers', label: 'Delete Users' },
      { key: 'assignRoles', label: 'Assign Roles' },
      { key: 'resetPasswords', label: 'Reset Passwords' },
    ],
  },
  {
    label: 'Stores & Settings',
    icon: 'Store',
    color: 'amber',
    keys: [
      { key: 'viewAllStores', label: 'View All Stores' },
      { key: 'manageStores', label: 'Manage Stores' },
      { key: 'changeSettings', label: 'Change Settings' },
      { key: 'manageCommission', label: 'Manage Commission Module' },
    ],
  },
];

/** Manager/SuperAdmin commission report access */
export const canViewCommissionReports = (userDoc, roleFeatureMatrix = null) => {
  const roles = normalizeUserRoles(userDoc);
  if (roles.some((r) => ['superAdmin', 'superadmin', 'admin'].includes(r))) return true;

  if (roleFeatureMatrix && canViewCommissionFromMatrix(roles, roleFeatureMatrix)) {
    return true;
  }

  return Boolean(userHasPermission(userDoc, 'viewCommissionReports'));
};

export const canManageCommission = (userDoc) =>
  Boolean(userHasPermission(userDoc, 'manageCommission'));

// ─── ROLE PRESETS (Quick selection in RoleSelector) ─────────
export const ROLE_PRESETS = [
  { label: 'Biller Only', icon: 'Receipt', roles: ['biller'] },
  { label: 'Cashier Only', icon: 'CreditCard', roles: ['cashier'] },
  { label: 'Biller + Cashier', icon: 'Layers', roles: ['biller', 'cashier'] },
  { label: 'Manager', icon: 'UserCheck', roles: ['manager'] },
  { label: 'Manager + Biller', icon: 'UserCog', roles: ['manager', 'biller'] },
  { label: 'Admin', icon: 'ShieldCheck', roles: ['admin'] },
  { label: 'Super Admin', icon: 'Crown', roles: ['superAdmin'] },
];

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Get the primary role based on hierarchy
 */
export const getPrimaryRole = (roles) => {
  if (!roles || !Array.isArray(roles) || roles.length === 0) return 'biller';
  const hierarchy = ['superAdmin', 'admin', 'manager', 'cashier', 'biller'];
  for (const role of hierarchy) {
    if (roles.includes(role)) return role;
  }
  return roles[0];
};

/**
 * Merge permissions from multiple roles
 * Boolean: ANY true = true
 * Number: MAX value wins
 */
export const mergePermissions = (roles) => {
  if (!roles || !Array.isArray(roles) || roles.length === 0) {
    return { ...DEFAULT_PERMISSIONS.biller };
  }

  const merged = {};
  roles.forEach((role) => {
    const rolePerms = DEFAULT_PERMISSIONS[role] || {};
    Object.entries(rolePerms).forEach(([key, value]) => {
      if (typeof value === 'boolean') {
        merged[key] = (merged[key] === true) || value;
      } else if (typeof value === 'number') {
        merged[key] = Math.max(merged[key] || 0, value);
      } else {
        merged[key] = value;
      }
    });
  });

  return merged;
};

/**
 * Check if a permission is overridden in custom permissions
 */
export const isPermissionOverridden = (key, customPermissions = {}) => {
  return customPermissions && Object.prototype.hasOwnProperty.call(customPermissions, key);
};

/**
 * Validate role combination
 */
export const validateRoleCombination = (roles) => {
  if (!roles || !Array.isArray(roles) || roles.length === 0) {
    return { valid: false, error: 'Select at least one role' };
  }

  const validRoles = Object.keys(ROLES);
  for (const role of roles) {
    if (!validRoles.includes(role)) {
      return { valid: false, error: `Invalid role: ${role}` };
    }
  }

  // SuperAdmin should be alone
  if (roles.includes('superAdmin') && roles.length > 1) {
    return { valid: false, error: 'Super Admin cannot be combined with other roles' };
  }

  return { valid: true, error: null };
};

/**
 * 🔧 NORMALIZE USER ROLES — handles old (string) + new (array) format
 * Old: { role: "biller" }       → roles: ["biller"]
 * New: { roles: ["biller"] }    → roles: ["biller"]
 */
export const normalizeUserRoles = (userDoc) => {
  if (!userDoc) return ['biller'];
  if (Array.isArray(userDoc.roles) && userDoc.roles.length > 0) {
    return userDoc.roles;
  }
  if (typeof userDoc.role === 'string' && userDoc.role) {
    return [userDoc.role];
  }
  if (Array.isArray(userDoc.role)) return userDoc.role;
  return ['biller'];
};

/**
 * Check if user has specific permission
 */
export const userHasPermission = (userDoc, permissionKey) => {
  const roles = normalizeUserRoles(userDoc);
  const merged = mergePermissions(roles);
  // Custom override wins
  if (userDoc?.permissions && Object.prototype.hasOwnProperty.call(userDoc.permissions, permissionKey)) {
    return userDoc.permissions[permissionKey];
  }
  return merged[permissionKey];
};

const rolePermissions = {
  ROLES,
  ROLE_INFO,
  PERMISSIONS,
  DEFAULT_PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_PRESETS,
  getPrimaryRole,
  mergePermissions,
  validateRoleCombination,
  normalizeUserRoles,
  userHasPermission,
  isPermissionOverridden,
};

export default rolePermissions;