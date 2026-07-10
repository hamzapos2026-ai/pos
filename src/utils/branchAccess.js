// Utility: branchAccess
// Branch resolution and scoping for multi-store POS (A One, J1, etc.)

import { ROLES } from './rolePermissions';
import { isSuperAdminUser } from './superAdminUtils';
import { buildStoreIdAliases, orderMatchesStore } from '../hooks/useStoresMap';

const normalizeRoles = (userDoc = {}) => {
  if (Array.isArray(userDoc.roles) && userDoc.roles.length > 0) return userDoc.roles;
  if (typeof userDoc.role === 'string' && userDoc.role) return [userDoc.role];
  return [];
};

/** Super Admin / Admin — see all branches */
export const isElevatedRole = (userDoc = {}) => {
  if (isSuperAdminUser(userDoc)) return true;
  const roles = normalizeRoles(userDoc);
  return roles.includes(ROLES.superAdmin) || roles.includes(ROLES.admin);
};

/** Admin Reports / Bills / Cash Flow — null storeIds = all branches. */
export const resolveAdminDataScope = (userDoc = {}, storesMap = {}) => {
  if (isElevatedRole(userDoc)) {
    return { storeId: null, branchId: null, storeIds: null };
  }
  const listenIds = resolveUserStoreListenIds(userDoc, storesMap);
  const primary = resolveUserPrimaryBranch(userDoc);
  return {
    storeId: primary || listenIds?.[0] || null,
    branchId: userDoc?.branchId || primary || null,
    storeIds: listenIds?.length ? listenIds : null,
  };
};

/** Manager — always single-branch scope (never all stores). */
export const resolveManagerDataScope = (userDoc = {}, storesMap = {}) => {
  const primary = resolveUserPrimaryBranch(userDoc);
  const storeIds = resolveUserStoreListenIds(userDoc, storesMap)
    || (primary ? expandBranchIds([primary], storesMap) : null);
  return {
    storeId: primary || storeIds?.[0] || null,
    branchId: userDoc?.branchId || primary || null,
    storeIds: storeIds?.length ? storeIds : null,
    restrictToBranch: true,
  };
};

/** All branch IDs assigned to a user (supports legacy field names). */
export const resolveUserBranchIds = (userDoc = {}) => {
  const fromStoreIds = Array.isArray(userDoc.storeIds) && userDoc.storeIds.length > 0
    ? userDoc.storeIds
    : [];
  const fromAssigned = userDoc.assignedBranches
    || userDoc.assignedStores
    || userDoc.branchIds
    || [];
  const assigned = Array.isArray(fromAssigned) ? fromAssigned : [];

  const merged = [
    ...fromStoreIds,
    ...assigned,
    ...(userDoc.storeId ? [userDoc.storeId] : []),
    ...(userDoc.primaryStore ? [userDoc.primaryStore] : []),
  ].filter(Boolean);

  const unique = [...new Set(merged)];
  if (unique.length <= 1) return unique;

  // One branch per user — dual assignment never allowed
  const primary = userDoc.primaryStore || userDoc.storeId || unique[0];
  return [unique.includes(primary) ? primary : unique[0]];
};

/** Collapse any branch list to a single id (create/update payloads). */
export const toSingleBranchIds = (storeIds = [], primaryStore = '') => {
  const ids = (Array.isArray(storeIds) ? storeIds : [storeIds]).filter(Boolean);
  if (!ids.length) return [];
  if (ids.length === 1) return ids;
  const pick = primaryStore && ids.includes(primaryStore) ? primaryStore : ids[0];
  return [pick];
};

/** Primary branch for biller / cashier (single-store operations). */
export const resolveUserPrimaryBranch = (userDoc = {}) =>
  userDoc.primaryStore
  || userDoc.storeId
  || resolveUserBranchIds(userDoc)[0]
  || '';

/** Biller must have a branch before using POS. */
export const billerRequiresBranch = (userDoc = {}) => {
  const roles = normalizeRoles(userDoc);
  if (!roles.includes(ROLES.biller)) return false;
  return !resolveUserPrimaryBranch(userDoc);
};

/** Expand JM-1 / Firebase id / shortCode into all ids on orders.storeId. */
export const expandBranchIds = (branchIds = [], storesMap = {}) => {
  const out = new Set((branchIds || []).filter(Boolean).map((id) => String(id).trim()));
  for (const id of branchIds || []) {
    try {
      buildStoreIdAliases(id, storesMap).forEach((a) => out.add(String(a).trim()));
    } catch { /* ignore */ }
  }
  return [...out];
};

/** Firebase query + filter ids for one user's branch (biller / cashier / manager). */
export const resolveUserStoreListenIds = (userDoc = {}, storesMap = {}, extraIds = []) => {
  if (isElevatedRole(userDoc)) return null;
  const primary = resolveUserPrimaryBranch(userDoc);
  const ids = resolveUserBranchIds(userDoc);
  return expandBranchIds(
    [...new Set([primary, ...ids, ...extraIds].filter(Boolean))],
    storesMap,
  ).slice(0, 10);
};

/**
 * Check whether the user document allows access to a given branchId.
 * Alias-aware (JM-1 ↔ Firebase doc id).
 */
export const userCanAccessBranch = (userDoc = {}, branchId, storesMap = {}) => {
  if (!branchId || !userDoc) return false;
  if (isElevatedRole(userDoc)) return true;
  const allowed = resolveUserStoreListenIds(userDoc, storesMap);
  if (!allowed?.length) return false;
  return orderMatchesStore({ storeId: branchId, branchId }, allowed);
};

/** Build filter scope from manager context + optional explicit branch filter. */
export const getBranchScopeFromContext = (ctx = {}, filterBranchId = null) => {
  if (filterBranchId) {
    return { restrict: true, branchIds: [filterBranchId] };
  }
  if (!ctx.restrictBranches) {
    return { restrict: false, branchIds: [] };
  }
  return { restrict: true, branchIds: ctx.branchIds || [] };
};

const defaultPickBranchId = (item) => item?.storeId || item?.branchId;

/** Filter a list to the user's branch scope. Empty scope when restricted = no data. */
export const filterByBranchScope = (items, scope, options = {}) => {
  const {
    allowMissingBranch = false,
    pickBranchId = defaultPickBranchId,
    storesMap = scope?.storesMap || {},
  } = options;

  if (!scope?.restrict) return items || [];
  if (!scope.branchIds?.length) return [];

  const aliasSet = expandBranchIds(scope.branchIds, storesMap);

  return (items || []).filter((item) => {
    const id = pickBranchId(item);
    if (!id) return allowMissingBranch;
    return orderMatchesStore(item, aliasSet);
  });
};

/** Inline check for order/expense loops. */
export const itemMatchesBranchScope = (scope, storeId, { allowMissing = false, storesMap = {} } = {}) => {
  if (!scope?.restrict) return true;
  if (!scope.branchIds?.length) return false;
  if (!storeId) return allowMissing;
  const aliasSet = expandBranchIds(scope.branchIds, storesMap || scope.storesMap || {});
  return orderMatchesStore({ storeId, branchId: storeId }, aliasSet);
};

/** User record matches manager's branch scope (salesperson list, etc.). */
export const userMatchesBranchScope = (scope, user = {}) => {
  if (!scope?.restrict) return true;
  if (!scope.branchIds?.length) return false;
  if (user.fromSettings === true) return true;
  if (scope.branchIds.includes(user.storeId)) return true;
  if (user.storeIds?.some((s) => scope.branchIds.includes(s))) return true;
  return false;
};

export default {
  isElevatedRole,
  resolveAdminDataScope,
  resolveManagerDataScope,
  resolveUserBranchIds,
  resolveUserPrimaryBranch,
  toSingleBranchIds,
  billerRequiresBranch,
  expandBranchIds,
  resolveUserStoreListenIds,
  userCanAccessBranch,
  getBranchScopeFromContext,
  filterByBranchScope,
  itemMatchesBranchScope,
  userMatchesBranchScope,
};
