import { lazy, Suspense, useEffect, useState } from 'react'
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router'

import type { Page } from './app/navigation'
import { canSeeReport, canAccessCatalog } from './app/permissions'
import { ApiError, SESSION_EXPIRED_EVENT } from './api/client'
import { getSession, login, logout } from './api/endpoints'
import type { User } from './api/types'
import MainShell from './components/layout/MainShell'
import LoginScreen from './pages/LoginPage'
import PasswordScreen from './pages/PasswordPage'
import { getApiMessage } from './utils/errors'

const WeekPage = lazy(() => import('./pages/WeekPage'))

const HistoryPage = lazy(() => import('./pages/HistoryPage'))

const ReportPage = lazy(() => import('./pages/ReportPage'))

const CatalogPage = lazy(() => import('./pages/CatalogPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const GroupsPage = lazy(() => import('./pages/GroupsPage'))

function normalizePath(path: string): string {
  return path.replace(/\/+$/, '') || '/'
}

function pageFromPath(path: string): Page {
  const normalized = normalizePath(path)
  if (normalized === '/history') return 'history'
  if (normalized === '/profile') return 'profile'
  if (normalized === '/admin/groups') return 'groups'
  if (normalized === '/reports') return 'report'
  if (normalized === '/catalog' || normalized === '/menus') return 'catalog'
  return 'week'
}

function routeFor(page: Page): string {
  return {
    week: '/reservations',
    history: '/history',
    report: '/reports',
    catalog: '/catalog',
    profile: '/profile',
    groups: '/admin/groups',
  }[page]
}

function permittedPath(path: string, user: User): string {
  const page = pageFromPath(path)

  if (page === 'groups' && !user.is_superuser) {
    return '/reservations'
  }

  if (page === 'report' && !canSeeReport(user)) {
    return '/reservations'
  }

  if (page === 'catalog' && !canAccessCatalog(user)) {
    return '/reservations'
  }

  return routeFor(page)
}

const LOGIN_REDIRECT_KEY = 'foodesk:login-redirect'

const ALLOWED_DESTINATIONS = new Set([
  '/reservations',
  '/history',
  '/reports',
  '/catalog',
  '/menus',
  '/profile',
  '/admin/groups',
])

function validDestination(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const normalized = normalizePath(value)

  return ALLOWED_DESTINATIONS.has(normalized)
    ? normalized
    : null
}

function saveDestination(path: string): void {
  const destination = validDestination(path)

  if (destination) {
    sessionStorage.setItem(LOGIN_REDIRECT_KEY, destination)
  }
}

function requestedDestination(fallback: string): string {
  return (
    validDestination(sessionStorage.getItem(LOGIN_REDIRECT_KEY)) ??
    validDestination(fallback) ??
    '/reservations'
  )
}

function clearDestination(): void {
  sessionStorage.removeItem(LOGIN_REDIRECT_KEY)
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()

  const [user, setUser] = useState<User | null>(null)
  const [booting, setBooting] = useState(true)
  const [loginError, setLoginError] = useState('')
  const [logoutError, setLogoutError] = useState('')

  const [pendingPath, setPendingPath] = useState(() => {
    const path = normalizePath(location.pathname)
    const state = location.state as { from?: unknown } | null

    return (
      (path !== '/login' && validDestination(path)) ||
      validDestination(state?.from) ||
      validDestination(sessionStorage.getItem(LOGIN_REDIRECT_KEY)) ||
      '/reservations'
    )
  })

  useEffect(() => {
    let alive = true

    getSession()
      .then((session) => {
        if (!alive) return

        if ('authenticated' in session) {
          setUser(null)
          return
        }

        setUser(session)
      })
      .catch((error: unknown) => {
        if (!alive) return

        setUser(null)

        if (
          error instanceof ApiError &&
          error.status !== 401 &&
          error.status !== 403
        ) {
          setLoginError(error.message)
        }
      })
      .finally(() => {
        if (alive) setBooting(false)
      })

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    function handleSessionExpired() {
      const path = normalizePath(window.location.pathname)

      const destination =
        path === '/login'
          ? requestedDestination('/reservations')
          : validDestination(path) ?? '/reservations'

      saveDestination(destination)
      setPendingPath(destination)
      setLoginError('نشست شما منقضی شده است. دوباره وارد شوید.')
      setUser(null)
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired)

    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired)
    }
  }, [])

  useEffect(() => {
    if (
      booting ||
      user ||
      normalizePath(location.pathname) !== '/login'
    ) {
      return
    }

    const state = location.state as { from?: unknown } | null
    const destination = validDestination(state?.from)

    if (destination) {
      saveDestination(destination)
    }

    // Remove legacy query parameters without using them as redirects.
    if (location.search) {
      navigate('/login', {
        replace: true,
        state: location.state,
      })
    }
  }, [
    booting,
    user,
    location.pathname,
    location.search,
    location.state,
    navigate,
  ])

  async function handleLogin(username: string, password: string) {
    setLoginError('')

    try {
      const session = await login(username, password)
      setUser(session)

      if (session.must_change_password) {
        return
      }

      const destination = requestedDestination(pendingPath)
      clearDestination()

      navigate(
        permittedPath(destination, session),
        { replace: true }
      )
    } catch (error) {
      setLoginError(getApiMessage(error))
    }
  }

  async function handlePasswordChanged(session: User) {
    const destination = requestedDestination(pendingPath)

    setUser(session)
    clearDestination()

    navigate(
      permittedPath(destination, session),
      { replace: true }
    )
  }

  async function handleLogout() {
    setLogoutError('')

    try {
      await logout()
    } catch (error) {
      setLogoutError(
        `خروج از حساب انجام نشد. ${getApiMessage(error)}`
      )
      return
    }

    const path = normalizePath(location.pathname)
    const destination = path === '/login' ? pendingPath : path

    saveDestination(destination)
    setPendingPath(destination)
    setUser(null)
    setLoginError('')
    navigate('/login', { replace: true })
  }

  if (booting) {
    return (
      <div
        className="grid min-h-svh place-items-center text-muted"
        aria-live="polite"
      >
        در حال بررسی نشست کاربری…
      </div>
    )
  }

  if (!user) {
    const path = normalizePath(location.pathname)

    if (path !== '/login') {
      return (
        <Navigate
          to="/login"
          replace
          state={{ from: path }}
        />
      )
    }

    return (
      <LoginScreen
        initialError={loginError}
        onSubmit={handleLogin}
      />
    )
  }

  if (user.must_change_password) {
    return <PasswordScreen onSuccess={handlePasswordChanged} />
  }

  const pathname = normalizePath(location.pathname)
  const currentPage = pageFromPath(pathname)

  if (pathname === '/login') {
    return (
      <Navigate
        to={permittedPath(requestedDestination(pendingPath), user)}
        replace
      />
    )
  }

  if (pathname === '/') {
    return <Navigate to="/reservations" replace />
  }

  if (
    pathname === '/admin/groups' &&
    !user.is_superuser
  ) {
    return <Navigate to="/reservations" replace />
  }

  if (
    pathname === '/reports' &&
    !canSeeReport(user)
  ) {
    return <Navigate to="/reservations" replace />
  }

  if (
    (pathname === '/catalog' || pathname === '/menus') &&
    !canAccessCatalog(user)
  ) {
    return <Navigate to="/reservations" replace />
  }

  return (
    <MainShell
      user={user}
      page={currentPage}
      onNavigate={(page) => navigate(routeFor(page))}
      onLogout={handleLogout}
    >
      {logoutError && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {logoutError}
        </p>
      )}
      <Suspense
        fallback={
          <div
            role="status"
            aria-live="polite"
            className="grid min-h-[220px] place-items-center rounded-xl border border-line bg-surface p-6 text-sm text-muted"
          >
            در حال بارگذاری صفحه…
          </div>
        }
      >
        <Routes>
        <Route path="/reservations" element={<WeekPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/admin/groups" element={<GroupsPage />} />
        <Route
          path="/reports"
          element={<ReportPage />}
        />
        <Route
          path="/catalog"
          element={<CatalogPage user={user} />}
        />
        <Route
          path="/menus"
          element={<Navigate to="/catalog" replace />}
        />
        <Route
          path="*"
          element={<Navigate to="/reservations" replace />}
        />
        </Routes>
      </Suspense>
    </MainShell>
  )
}
