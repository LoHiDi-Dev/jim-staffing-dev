import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { apiLogout, apiMe, apiRefresh, type ServerUser } from '../api/auth'
import { apiStaffingMe } from '../api/staffing'
import { StaffingShell } from './components/StaffingShell'
import { ClockStationPage } from './pages/ClockStationPage'
import { LoginPage } from './pages/LoginPage'
import { MyTimesPage } from './pages/MyTimesPage'
import { NotAuthorizedPage } from './pages/NotAuthorizedPage'

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
    nav('/login', { replace: true })
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

  const shell = useMemo(
    () => (
      <StaffingShell
        user={user}
        onLogout={handleLogout}
      />
    ),
    [handleLogout, user],
  )

  const mustLogin = authStatus === 'anon' && loc.pathname !== '/login'
  if (mustLogin) return <Navigate to="/login" replace />

  if (authStatus === 'loading') {
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
        path="/login"
        element={
          <LoginPage
            onAuthed={(u) => {
              setUser(u)
              setAuthStatus('authed')
              nav('/clock-station', { replace: true })
            }}
          />
        }
      />
      <Route path="/not-authorized" element={<NotAuthorizedPage user={user} onLogout={() => void handleLogout()} />} />

      <Route
        path="/clock-station"
        element={guard(
          <>
            {shell}
            <ClockStationPage user={user!} />
          </>,
        )}
      />
      <Route
        path="/my-times"
        element={guard(
          <>
            {shell}
            <MyTimesPage user={user!} />
          </>,
        )}
      />

      <Route path="/" element={<Navigate to="/clock-station" replace />} />
      <Route path="*" element={<Navigate to="/clock-station" replace />} />
    </Routes>
  )
}

