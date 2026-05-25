// Utility: branchAccess
// Helpers to determine if a user can access a branch (store)

import { ROLES } from './rolePermissions';

/**
 * Check whether the user document allows access to a given branchId.
 * Supports old `storeId`/`storeIds` fields and new `assignedBranches`.
 */
export const userCanAccessBranch = (userDoc = {}, branchId) => {
  if (!branchId) return false;
  if (!userDoc) return false;

  const roles = (userDoc.roles && Array.isArray(userDoc.roles)) ? userDoc.roles : (userDoc.role ? [userDoc.role] : []);

  // Super roles can access everything
  if (roles.includes(ROLES.superAdmin) || roles.includes(ROLES.admin)) return true;

  // Normalized fields
  const assigned = userDoc.assignedBranches || userDoc.assignedStores || userDoc.branchIds || userDoc.storeIds || [];
  if (Array.isArray(assigned) && assigned.includes(branchId)) return true;

  // Single primary store/branch
  if (userDoc.storeId && userDoc.storeId === branchId) return true;
  if (userDoc.primaryStore && userDoc.primaryStore === branchId) return true;

  return false;
};

export default {
  userCanAccessBranch,
};
