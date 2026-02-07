import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { apiLogout, apiMe, apiRefresh, type ServerUser } from '../api/auth'
import { apiStaffingMe } from '../api/staffing'
import { setAccessToken } from '../api/token'
import { Footer } from '../components/Footer'
import { StaffingShell } from './components/StaffingShell'
import { ClockStationPage } from './pages/ClockStationPage'
import { MyTimesPage } from './pages/MyTimesPage'
import { NotAuthorizedPage } from './pages/NotAuthorizedPage'
import { MarketingLandingPage } from './pages/auth/MarketingLandingPage'
import { LoginSetupPage } from './pages/auth/LoginSetupPage'
import { LoginPageV2 } from './pages/auth/LoginPageV2'
import { CompleteProfilePage } from './pages/auth/CompleteProfilePage'

type AuthStatus = 'loading' | 'authed' | 'anon'

export function StaffingApp() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<ServerUser | null>(null)
  const [eligible, setEligible] = useState<boolean | null>(null)

  const nav = useNavigate()
  const loc = useLocation()

  const handleLogout = useCallback(async () => {
    await apiLogout()
    setUser(null)
    setAuthStatus('anon')
    setEligible(null)
    try {
      sessionStorage.removeItem('jim.auth.loginPreference')
      sessionStorage.removeItem('jim.auth.lastLocation')
      sessionStorage.removeItem('jim.auth.provisionedUserId')
    } catch {
      // ignore
    }
    nav('/', { replace: true })
  }, [nav])

  const handleLock = useCallback(() => {
    // Soft-lock: clear access token + punch token cache, but do not revoke refresh cookie.
    setAccessToken(null)
    try {
      sessionStorage.removeItem('jim.staffing.punchToken')
      sessionStorage.removeItem('jim.auth.loginPreference')
      sessionStorage.removeItem('jim.auth.lastLocation')
      sessionStorage.removeItem('jim.auth.provisionedUserId')
    } catch {
      // ignore
    }
    setUser(null)
    setEligible(null)
    setAuthStatus('anon')
    nav('/login?locked=1', { replace: true })
  }, [nav])

  useEffect(() => {
    let mounted = true
    const run = async () => {
      try {
        try {
          await apiRefresh()
        } catch {
          // ignore refresh failure
        }
        const me = await apiMe()
        if (!mounted) return
        if (!me) {
          setUser(null)
          setAuthStatus('anon')
          setEligible(null)
          return
        }
        setUser(me)
        setAuthStatus('authed')

        try {
          const staffing = await apiStaffingMe()
          if (!mounted) return
          setEligible(Boolean(staffing.eligible))
        } catch {
          if (!mounted) return
          // Staffing portal must explicitly authorize contractors (LTC/STC).
          setEligible(false)
        }
      } catch {
        if (!mounted) return
        setUser(null)
        setAuthStatus('anon')
        setEligible(null)
      }
    }
    void run()
    return () => {
      mounted = false
    }
  }, [])

  // MUST #3 — Idle timeout + auto-lock on background (low friction: re-login only after idle/background).
  useEffect(() => {
    if (authStatus !== 'authed') return
    const idleMinutesRaw = String((import.meta as unknown as { env?: Record<string, unknown> }).env?.VITE_STAFFING_IDLE_MINUTES ?? '12')
    const idleMinutes = Number(idleMinutesRaw)
    const idleMs = Number.isFinite(idleMinutes) && idleMinutes > 0 ? idleMinutes * 60_000 : 12 * 60_000

    let timer: number | null = null
    const bump = () => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => handleLock(), idleMs)
    }
    const onVis = () => {
      if (document.hidden) handleLock()
    }

    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    for (const e of events) window.addEventListener(e, bump, { passive: true })
    document.addEventListener('visibilitychange', onVis)
    bump()

    return () => {
      if (timer) window.clearTimeout(timer)
      for (const e of events) window.removeEventListener(e, bump as EventListener)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [authStatus, handleLock])

  const shell = useMemo(
    () => (
      <StaffingShell
        user={user}
        onLogout={handleLogout}
      />
    ),
    [handleLogout, user],
  )

  // Protected routes guard (dashboard only). Public: /, /login/setup, /login, /login/profile
  const isPublic =
    loc.pathname === '/' ||
    loc.pathname === '/login' ||
    loc.pathname === '/login/setup' ||
    loc.pathname === '/login/profile'
  const mustLogin = authStatus === 'anon' && !isPublic
  if (mustLogin) return <Navigate to="/login" replace />

  // Render /login immediately even while checking session (avoids slow/cold-start blocking screen).
  if (authStatus === 'loading' && loc.pathname !== '/login') {
    return (
      <div className="min-h-screen bg-slate-100/70 px-4 py-10 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Loading JIM Staffing…</div>
            <div className="mt-1 text-sm text-slate-600">Verifying session.</div>
          </div>
        </div>
      </div>
    )
  }

  const guard = (node: React.ReactNode) => {
    if (authStatus !== 'authed') return <Navigate to="/login" replace />
    if (eligible === false) return <Navigate to="/not-authorized" replace />
    return node
  }

  return (
    <Routes>
      <Route
        path="/"
        element={authStatus === 'authed' ? <Navigate to="/clock-station" replace /> : <MarketingLandingPage />}
      />
      <Route
        path="/login/setup"
        element={<LoginSetupPage />}
      />
      <Route
        path="/login"
        element={
          <LoginPageV2
            onAuthed={(u) => {
              setUser(u)
              setAuthStatus('authed')
            }}
          />
        }
      />
      <Route
        path="/login/profile"
        element={authStatus === 'authed' ? <CompleteProfilePage /> : <Navigate to="/login" replace />}
      />
      <Route path="/not-authorized" element={<NotAuthorizedPage user={user} onLogout={() => void handleLogout()} />} />

      <Route
        path="/clock-station"
        element={guard(
          <div className="flex min-h-screen flex-col bg-[#f4f6fb] overflow-x-hidden md:overflow-x-visible">
            {shell}
            <main className="flex-1">
              <ClockStationPage user={user!} />
            </main>
            <Footer />
          </div>
        )}
      />
      <Route
        path="/my-timecard"
        element={guard(
          <div className="flex min-h-screen flex-col bg-[#f4f6fb] overflow-x-hidden md:overflow-x-visible">
            {shell}
            <main className="flex-1">
              <MyTimesPage user={user!} />
            </main>
            <Footer />
          </div>
        )}
      />

      <Route path="/my-times" element={<Navigate to="/my-timecard" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

