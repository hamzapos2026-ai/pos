// File: aone-jewelry-pos/src/routes/SetupRoute.jsx
// Setup route component for initial super admin creation

import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/ui/LoadingSpinner';

const SetupRoute = ({ children }) => {
  const { isSetupComplete, isAuthenticated, loading, initializing } = useAuth();

  // Show loading while checking auth state
  if (loading || initializing) {
    return <LoadingSpinner fullScreen />;
  }

  // If already authenticated, redirect to dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  // Check if setup is complete (localStorage + Firestore check)
  const [setupComplete, setSetupComplete] = useState(null);

  useEffect(() => {
    const checkSetup = async () => {
      const complete = await isSetupComplete();
      setSetupComplete(complete);
    };
    checkSetup();
  }, [isSetupComplete]);

  if (setupComplete === null) {
    return <LoadingSpinner fullScreen />;
  }

  if (setupComplete) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default SetupRoute;