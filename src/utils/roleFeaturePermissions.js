// src/utils/roleFeaturePermissions.js
// ✅ UPDATED: Activity Logs feature added for Manager/Cashier/Biller
// ✅ All existing logic preserved — only activityLogs feature added

import { normalizeUserRoles } from './rolePermissions';

const normalizeMatrixRole = (role) => String(role || '').toLowerCase();

export const ROLE_FEATURE_ROLES = ['biller', 'cashier', 'manager'];

export const PERM_ACTIONS = [
  { key: 'view',    label: 'View',    short: 'Dekhna',   color: 'blue'   },
  { key: 'add',     label: 'Add',     short: 'Naya',     color: 'green'  },
  { key: 'edit',    label: 'Edit',    short: 'Tabdeel',  color: 'amber'  },
  { key: 'delete',  label: 'Delete',  short: 'Delete',   color: 'red'    },
  { key: 'approve', label: 'Approve', short: 'Manzoori', color: 'purple' },
  { key: 'export',  label: 'Export',  short: 'Export',   color: 'cyan'   },
];

export const ROLE_FEATURES = [
  {
    key:     'bills',
    label:   'Bills',
    hint:    'Create & manage invoices',
    actions: ['view', 'add', 'edit', 'delete', 'approve', 'export'],
  },
  {
    key:     'customers',
    label:   'Customers',
    hint:    'Customer database',
    actions: ['view', 'add', 'edit', 'delete', 'export'],
  },
  {
    key:     'reports',
    label:   'General Reports',
    hint:    'Sales, cash, discount reports',
    actions: ['view', 'export'],
  },
  {
    key:       'commission',
    label:     'Commission Reports',
    hint:      'Manager → Salespersons page: view, pay (approve), edit, reset (delete), export',
    highlight: true,
    actions:   ['view', 'edit', 'delete', 'approve', 'export'],
  },
  {
    key:     'cashflow',
    label:   'Cash Flow',
    hint:    'Cash register & handover',
    actions: ['view', 'add', 'edit', 'approve', 'export'],
  },
  {
    key:     'returns',
    label:   'Returns',
    hint:    'Returns & refunds',
    actions: ['view', 'add', 'approve', 'export'],
  },
  {
    key:     'expenses',
    label:   'Expenses',
    hint:    'Shop expenses',
    actions: ['view', 'add', 'edit', 'delete', 'approve', 'export'],
  },
  // ✅ NEW: Activity Logs — full audit trail access control
  {
    key:            'activityLogs',
    label:          'Activity Logs',
    hint:           'Login/logout, billing, payments, deleted bills, cleared data, devices — full audit trail',
    actions:        ['view', 'export'],
    highlight:      true,
    highlightColor: 'blue',
  },
];

// ✅ DEFAULT MATRIX — activityLogs added
// SuperAdmin always has full access (bypasses matrix)
// Manager: view ✅  export ✅
// Cashier:  view ❌  export ❌  (disabled by default, enable from UI)
// Biller:   view ❌  export ❌  (disabled by default)
export const DEFAULT_ROLE_FEATURE_MATRIX = {
  biller: {
    bills:        { view: true, add: true, edit: true },
    customers:    { view: true, add: true, edit: true },
    activityLogs: { view: false, export: false },        // ✅ NEW
  },
  cashier: {
    bills:        { view: true },
    customers:    { view: true },
    cashflow:     { view: true, add: true },
    activityLogs: { view: false, export: false },        // ✅ NEW
  },
  manager: {
    bills:        { view: true, edit: true, approve: true, export: true },
    customers:    { view: true, add: true, edit: true, export: true },
    reports:      { view: true, export: true },
    commission:   {
      view:    true,
      edit:    true,
      delete:  false,
      approve: true,
      export:  true,
    },
    cashflow:     { view: true, approve: true, export: true },
    returns:      { view: true, approve: true },
    expenses:     { view: true, add: true, approve: true, export: true },
    activityLogs: { view: true, export: true },          // ✅ NEW — manager CAN see logs
  },
};

// ═══════════════════════════════════════════════════════════════
// MERGE — saved settings override defaults
// ═══════════════════════════════════════════════════════════════

export const mergeRoleFeatureMatrix = (saved) => {
  const base = JSON.parse(JSON.stringify(DEFAULT_ROLE_FEATURE_MATRIX));
  let parsed = saved;
  if (typeof saved === 'string') {
    try { parsed = JSON.parse(saved); } catch { parsed = null; }
  }
  if (!parsed || typeof parsed !== 'object') return base;
  saved = parsed;
  ROLE_FEATURE_ROLES.forEach((role) => {
    if (!saved[role]) return;
    Object.keys(saved[role]).forEach((feature) => {
      if (!base[role]) base[role] = {};
      base[role][feature] = {
        ...(base[role][feature] || {}),
        ...saved[role][feature],
      };
    });
  });
  return base;
};

// ═══════════════════════════════════════════════════════════════
// CORE CHECKER
// ═══════════════════════════════════════════════════════════════

export const isRoleFeatureAllowed = (matrix, role, feature, action) =>
  Boolean(matrix?.[role]?.[feature]?.[action]);

// ═══════════════════════════════════════════════════════════════
// COMMISSION HELPERS (unchanged)
// ═══════════════════════════════════════════════════════════════

/** Any selected role may view commission reports (from matrix). */
export const canViewCommissionFromMatrix = (userRoles, matrix) => {
  if (!matrix) return false;
  const roles = Array.isArray(userRoles)
    ? userRoles
    : normalizeUserRoles(userRoles);
  return roles.some((role) =>
    isRoleFeatureAllowed(matrix, normalizeMatrixRole(role), 'commission', 'view'),
  );
};

const adminRoles = new Set(['superAdmin', 'superadmin', 'admin']);

/** Runtime commission permissions for manager UI */
export const resolveManagerCommissionPerms = (userDoc, matrix) => {
  const roles = normalizeUserRoles(userDoc).map(normalizeMatrixRole);

  if (
    roles.some((r) => adminRoles.has(r)) ||
    userDoc?.isSuperAdmin ||
    userDoc?.isAdmin
  ) {
    return { view: true, edit: true, delete: true, approve: true, export: true };
  }

  const check = (action) =>
    roles.some((role) =>
      isRoleFeatureAllowed(matrix, role, 'commission', action),
    );

  return {
    view:    check('view'),
    edit:    check('edit'),
    delete:  check('delete'),
    approve: check('approve'),
    export:  check('export'),
  };
};

// ═══════════════════════════════════════════════════════════════
// ✅ NEW: ACTIVITY LOGS HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Check if user can VIEW activity logs
 * SuperAdmin / Admin = always true
 * Others = check matrix
 */
export const canAccessActivityLogs = (userRoles, matrix) => {
  const roles = Array.isArray(userRoles)
    ? userRoles
    : normalizeUserRoles(userRoles);

  // SuperAdmin / Admin always allowed
  if (roles.some((r) => adminRoles.has(r))) return true;

  return roles.some((role) =>
    isRoleFeatureAllowed(matrix, normalizeMatrixRole(role), 'activityLogs', 'view'),
  );
};

/**
 * Check if user can EXPORT activity logs CSV
 * SuperAdmin / Admin = always true
 */
export const canExportActivityLogs = (userRoles, matrix) => {
  const roles = Array.isArray(userRoles)
    ? userRoles
    : normalizeUserRoles(userRoles);

  if (roles.some((r) => adminRoles.has(r))) return true;

  return roles.some((role) =>
    isRoleFeatureAllowed(matrix, normalizeMatrixRole(role), 'activityLogs', 'export'),
  );
};

/**
 * Full activity logs permission object for a user
 * Usage: const perms = resolveActivityLogsPerms(userData, matrix)
 *        if (perms.view) show logs page
 *        if (perms.export) show export button
 */
export const resolveActivityLogsPerms = (userDoc, matrix) => {
  const roles = normalizeUserRoles(userDoc).map(normalizeMatrixRole);

  // SuperAdmin / Admin = full access
  if (
    roles.some((r) => adminRoles.has(r)) ||
    userDoc?.isSuperAdmin ||
    userDoc?.isAdmin
  ) {
    return { view: true, export: true };
  }

  return {
    view:   roles.some((r) => isRoleFeatureAllowed(matrix, r, 'activityLogs', 'view')),
    export: roles.some((r) => isRoleFeatureAllowed(matrix, r, 'activityLogs', 'export')),
  };
};