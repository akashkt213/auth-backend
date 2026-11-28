import { useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const onLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <main className="card">
      <h1>Welcome{user?.name ? `, ${user.name}` : ''}</h1>
      <p>Signed in as {user?.email}</p>
      {/* TODO: create company (POST /company) and invite users (POST /company/invitations) */}
      <button onClick={onLogout}>Log out</button>
    </main>
  )
}
