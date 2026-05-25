// File: src/routes/RoleBasedRoute.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/ui/LoadingSpinner';

/**
 * RoleBasedRoute
 *
 * Props:
 *   allowedRoles  string[]   – at least one of these roles must be in
 *                              the user's `roles` array.
 *                              If empty [] → any authenticated user passes.
 *
 * SuperAdmin always passes regardless of allowedRoles.
 *
 * Works with BOTH:
 *   • Legacy users  – single `role` string field
 *   • New users     – `roles` array field
 */
const RoleBasedRoute = ({ children, allowedRoles = [], allowedPermissions = [] }) => {
  const {
    isAuthenticated,
    roles,        // string[] – from AuthContext (normalised)
    hasPermission,
    isSuperAdmin,
    loading,
    initializing,
  } = useAuth();
  const location = useLocation();

  // ── Loading guard ──────────────────────────────────────
  if (loading || initializing) {
    return <LoadingSpinner fullScreen />;
  }

  // ── Auth guard ─────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        state={{ from: location }}
        replace
      />
    );
  }

  // ── SuperAdmin bypasses every role restriction ─────────
  if (isSuperAdmin) return children;

  // ── No restriction defined → allow any logged-in user ──
  if (allowedRoles.length === 0 && allowedPermissions.length === 0) return children;

  // ── Check whether ANY of user's roles is in allowedRoles
  //    This makes multi-role (e.g. biller + cashier) work correctly
  const hasRoleAccess = allowedRoles.length > 0 && allowedRoles.some(r => roles.includes(r));
  const hasPermissionAccess = allowedPermissions.length > 0 && allowedPermissions.some(p => hasPermission(p));

  if (!hasRoleAccess && !hasPermissionAccess) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default RoleBasedRoute;