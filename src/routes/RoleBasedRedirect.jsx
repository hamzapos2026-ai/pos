// File: src/routes/RoleBasedRedirect.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { resolveRoleHome } from '../utils/roleHome';

const RoleBasedRedirect = () => {
  const {
    isAuthenticated,
    userData,
    loading,
    initializing,
    hasPermission,
    activeRole,
  } = useAuth();

  if (loading || initializing) {
    return <LoadingSpinner fullScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const destination = resolveRoleHome({ userData, activeRole, hasPermission });

  return <Navigate to={destination} replace />;
};

export default RoleBasedRedirect;
