export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Endpoints where a 401 means "bad credentials", not "access token expired"
const NO_REFRESH = ['/login', '/signup', '/refresh', '/logout']

// Shared so that several requests failing at once trigger a single refresh
let refreshing: Promise<boolean> | null = null

function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/refresh', { method: 'POST', credentials: 'include' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

async function send(path: string, init: RequestInit): Promise<Response> {
  return fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
}

/**
 * Calls the backend. Auth lives in httpOnly cookies, so there is no token to
 * attach. When the 15-minute access token expires, the request returns 401;
 * we refresh once and retry.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await send(path, init)

  if (res.status === 401 && !NO_REFRESH.includes(path) && (await refreshSession())) {
    res = await send(path, init)
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(res.status, data.message ?? `Request failed (${res.status})`)
  }
  return data as T
}

export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
