import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import api from '../../lib/axios';

/**
 * Route guard which validates the token with the backend.
 * - If no token found: redirect to /
 * - If token found: add Authorization header and validate /user.
 * - If validation fails: remove token and redirect to /
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    // Basic guard for SSR-safety
    if (typeof window === 'undefined') return;

    const token = localStorage.getItem('api_token');
    if (!token) {
      setChecking(false);
      setAuthorized(false);
      return;
    }

    // Ensure axios has auth header if token exists
    if (!api.defaults.headers.common['Authorization']) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    // Validate token by requesting /user
    (async () => {
      try {
        await api.get('/user');
        setAuthorized(true);
      } catch (e) {
        // invalid token — clear and require login
        try { localStorage.removeItem('api_token'); } catch {}
        try { delete api.defaults.headers.common['Authorization']; } catch {}
        setAuthorized(false);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  if (checking) {
    // Full-screen spinner while we validate session
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-gray-200 dark:border-gray-700 border-t-brand-500 rounded-full animate-spin"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Checking session...</p>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
