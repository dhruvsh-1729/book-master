//components/ProtectedRoute.tsx - Component to protect routes
import React, { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import LoadingPage from '../components/LoadingPage';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading, requireAuth } = useAuth();

  useEffect(() => {
    requireAuth();
  }, [user, loading]);

  if (loading) {
    return <LoadingPage message="Checking authentication..." />;
  }

  if (!user) {
    return <LoadingPage message="Redirecting to login..." />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;