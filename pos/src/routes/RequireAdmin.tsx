import { Navigate, Outlet } from 'react-router-dom';
import { getAuth } from '../lib/auth';

export function RequireAdmin() {
  const auth = getAuth();

  if (!auth?.accessToken) return <Navigate to="/login" replace />;
  if (auth.user.role !== 'ADMIN') return <Navigate to="/pos" replace />;
  return <Outlet />;
}
