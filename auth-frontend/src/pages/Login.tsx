import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(params.get('error') ? 'Google login failed' : '')
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname
      navigate(from ?? '/', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="card">
      <h1>Log in</h1>
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button disabled={submitting}>{submitting ? 'Logging in…' : 'Log in'}</button>
      </form>

      {/* A full-page navigation, not fetch: the browser must follow Google's redirects */}
      <a className="button secondary" href="/api/auth/google">Continue with Google</a>

      <p>
        <Link to="/forgot-password">Forgot password?</Link> · <Link to="/signup">Create an account</Link>
      </p>
    </main>
  )
}
