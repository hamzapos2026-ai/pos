// File: aone-jewelry-pos/src/routes/SetupRoute.jsx
// Setup route component for initial super admin creation

import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { resolveRoleHome } from '../utils/roleHome';

const SetupRoute = ({ children }) => {
  const { isSetupComplete, isAuthenticated, loading, initializing, userData, activeRole, hasPermission } = useAuth();
  const [setupComplete, setSetupComplete] = useState(null);

  useEffect(() => {
    const checkSetup = async () => {
      const complete = await isSetupComplete();
      setSetupComplete(complete);
    };
    checkSetup();
  }, [isSetupComplete]);

  if (loading || initializing) {
    return <LoadingSpinner fullScreen />;
  }

  if (isAuthenticated && userData) {
    return <Navigate to={resolveRoleHome({ userData, activeRole, hasPermission })} replace />;
  }

  if (setupComplete === null) {
    return <LoadingSpinner fullScreen />;
  }

  if (setupComplete) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default SetupRoute;
