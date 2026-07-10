import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { resolveRoleHome } from '../utils/roleHome';

/** Unknown / invalid URLs → login if guest, else role home */
const UnknownRouteRedirect = () => {
  const { isAuthenticated, loading, initializing, userData, activeRole, hasPermission } = useAuth();

  if (loading || initializing) {
    return <LoadingSpinner fullScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={resolveRoleHome({ userData, activeRole, hasPermission })} replace />;
};

export default UnknownRouteRedirect;
