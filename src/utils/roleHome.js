import { getTabActiveRole } from './tabSession';

export const ROLE_HOME = {
  superAdmin: '/admin',
  superadmin: '/admin',
  super_admin: '/admin',
  admin: '/admin',
  manager: '/manager',
  biller: '/biller',
  cashier: '/cashier',
};

const _normRole = (r) => String(r || '').trim().toLowerCase().replace(/_/g, '');

const _userHasRole = (userData, role) => {
  if (!role || !userData) return false;
  const want = _normRole(role);
  const primary = _normRole(userData.primaryRole || userData.role);
  if (primary === want) return true;
  const roles = Array.isArray(userData.roles) ? userData.roles : [];
  return roles.some((r) => _normRole(r) === want);
};

/** Post-login / unknown URL — respect tab role & login selection; manager before cashier. */
export const resolveRoleHome = ({
  userData = null,
  activeRole = null,
  hasPermission = () => false,
  tabRole = null,
} = {}) => {
  const tab = tabRole || getTabActiveRole();
  const candidates = [tab, activeRole, userData?.primaryRole, userData?.role].filter(Boolean);

  for (const role of candidates) {
    const key = String(role).trim();
    if (_userHasRole(userData, key) && ROLE_HOME[key]) {
      return ROLE_HOME[key];
    }
    const norm = _normRole(key);
    const match = Object.keys(ROLE_HOME).find((k) => _normRole(k) === norm);
    if (match && _userHasRole(userData, match)) return ROLE_HOME[match];
  }

  if (hasPermission('createUsers') || hasPermission('changeSettings') || hasPermission('manageStores') || hasPermission('viewAllStores')) {
    return '/admin';
  }
  if (hasPermission('viewAllReports')) return '/manager';
  if (hasPermission('createBills')) return '/biller';
  if (hasPermission('receivePayments')) return '/cashier';

  const fallback = userData?.primaryRole || userData?.roles?.[0] || userData?.role || 'biller';
  return ROLE_HOME[fallback] || '/biller';
};

export default resolveRoleHome;
