// Placeholder pages, one per backend flow. Replace each with a real page
// in its own file as you build it (see Login.tsx for the pattern).

function Stub({ title, todo }: { title: string; todo: string }) {
  return (
    <main className="card">
      <h1>{title}</h1>
      <p className="muted">TODO: {todo}</p>
    </main>
  )
}

export const Signup = () => (
  <Stub title="Sign up" todo="POST /api/signup { name, email, password }, then tell the user to check their email." />
)

export const VerifyEmail = () => (
  <Stub title="Verify email" todo="Read ?token= and POST /api/verify-email { token }; offer POST /api/resend-verification on failure." />
)

export const ForgotPassword = () => (
  <Stub title="Forgot password" todo="POST /api/forgot-password { email }; always show the same 'check your email' message." />
)

export const ResetPassword = () => (
  <Stub title="Reset password" todo="Read ?token= and POST /api/reset-password { token, password }, then go to /login." />
)

export const AcceptInvite = () => (
  <Stub
    title="Accept invitation"
    todo="Read ?token=, GET /api/invitations/preview?token=, then POST /api/invitations/accept with { token } or { token, name, password } if !invite.hasAccount."
  />
)

export const NotFound = () => <Stub title="Page not found" todo="Nothing here." />
