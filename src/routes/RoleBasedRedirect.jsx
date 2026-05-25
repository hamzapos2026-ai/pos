// File: src/routes/RoleBasedRedirect.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/ui/LoadingSpinner';

/**
 * ROLE → HOME ROUTE MAP
 *
 * After login the user lands here and is sent to the right dashboard.
 * Priority follows ROLE_ORDER (highest role wins).
 *
 * Multi-role example:
 *   roles = ['biller', 'cashier']
 *   primaryRole = 'biller'  → goes to /biller
 */
const ROLE_HOME = {
  superAdmin: '/admin',
  admin:      '/admin',
  manager:    '/manager',
  biller:     '/biller',
  cashier:    '/cashier',
};

const DEFAULT_HOME = '/biller'; // fallback if no route mapping is found

const RoleBasedRedirect = () => {
  const {
    isAuthenticated,
    userData,
    loading,
    initializing,
    hasPermission,
  } = useAuth();

  // ── Still loading ──────────────────────────────────────
  if (loading || initializing) {
    return <LoadingSpinner fullScreen />;
  }

  // ── Not authenticated ──────────────────────────────────
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // ── Choose destination based on highest-priority permission
  const destination = (() => {
    if (hasPermission('manageUsers') || hasPermission('viewAllStores') || hasPermission('changeSettings')) {
      return '/admin';
    }
    if (hasPermission('receivePayments')) {
      return '/cashier';
    }
    if (hasPermission('createBills')) {
      return '/biller';
    }
    if (hasPermission('viewAllReports')) {
      return '/manager';
    }

    // Fallback to primary role if permissions are not populated
    const primary =
      userData?.primaryRole ||
      userData?.roles?.[0]  ||
      userData?.role        ||
      'biller';

    return ROLE_HOME[primary] || DEFAULT_HOME;
  })();

  return <Navigate to={destination} replace />;
};

export default RoleBasedRedirect;