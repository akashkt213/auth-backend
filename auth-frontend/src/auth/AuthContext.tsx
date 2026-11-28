import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, post } from '../lib/api'

// Shape returned by GET /api/me
export type User = {
  id: string
  name: string | null
  email: string
  isEmailVerified: boolean
  createdAt: string
}

type AuthState = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  reload: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Asks the backend who we are; the cookies decide.
  const reload = useCallback(async () => {
    try {
      const data = await api<{ user: User }>('/me')
      setUser(data.user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const login = async (email: string, password: string) => {
    await post('/login', { email, password })
    await reload()
  }

  const logout = async () => {
    await post('/logout').catch(() => {})
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, reload }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
