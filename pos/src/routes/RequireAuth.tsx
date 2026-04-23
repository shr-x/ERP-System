import { Navigate, Outlet } from 'react-router-dom';
import { getAuth } from '../lib/auth';

export function RequireAuth() {
  const auth = getAuth();
  if (!auth?.accessToken) return <Navigate to="/login" replace />;
  return <Outlet />;
}

