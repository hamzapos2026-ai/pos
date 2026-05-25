// File: src/routes/ProtectedRoute.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/ui/LoadingSpinner';

/**
 * ProtectedRoute
 * - Shows spinner while auth is initialising
 * - Redirects unauthenticated users to /login
 * - Passes authenticated users straight through
 */
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading, initializing } = useAuth();
  const location = useLocation();

  // Still resolving Firebase auth state
  if (loading || initializing) {
    return <LoadingSpinner fullScreen />;
  }

  // Not logged in → send to login, remember where they wanted to go
  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        state={{ from: location }}
        replace
      />
    );
  }

  return children;
};

export default ProtectedRoute;