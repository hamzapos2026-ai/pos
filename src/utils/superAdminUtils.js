/** Shared Super Admin role detection — use everywhere for consistency */

export const SUPER_ADMIN_ROLES = ['superAdmin', 'superadmin', 'super_admin'];

export const normalizeRoles = (user) => {
  if (!user) return [];
  if (Array.isArray(user.roles) && user.roles.length > 0) return user.roles;
  if (typeof user.role === 'string' && user.role) return [user.role];
  return [];
};

export const isSuperAdminUser = (user) =>
  normalizeRoles(user).some((r) => SUPER_ADMIN_ROLES.includes(r));
