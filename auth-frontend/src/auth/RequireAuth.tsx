import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './AuthContext'

export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <p>Loading…</p>
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}
