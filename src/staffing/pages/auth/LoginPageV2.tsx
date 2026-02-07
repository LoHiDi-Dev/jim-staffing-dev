import { AlertCircle, Eye, EyeOff, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../../../api/config'
import { apiLogin, apiLoginByName, type ServerUser } from '../../../api/auth'
import { AlertBanner } from '../../../components/ui/AlertBanner'
import { PrimaryButton } from '../../../components/ui/Button'
import { Checkbox } from '../../../components/ui/Controls'
import { TextInput } from '../../../components/ui/Fields'
import { SelectTileGroup } from '../../../components/ui/SelectTileGroup'
import { ui } from '../../../components/ui/tokens'
import { BrandMark } from '../../../components/BrandMark'
import {
  AUTH_LOCATIONS,
  AUTH_STORAGE_KEYS,
  type AuthLocationCode,
  type AuthLoginPreference,
} from './authKeys'

function userIdToEmail(userId: string): string {
  const raw = userId.trim().toLowerCase()
  if (!raw) return ''
  if (raw.includes('@')) return raw
  const key = userId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  const m = /^([A-Z]{3})([A-Z]{2})(\d{4})$/.exec(key)
  const canonical = m ? `${m[1]}-${m[2]}-${m[3]}` : key
  return `${canonical.toLowerCase()}@jillamy.local`
}

export function LoginPageV2(props: { onAuthed: (u: ServerUser) => void }) {
  const { onAuthed } = props
  const nav = useNavigate()
  const loc = useLocation()
  const qs = useMemo(() => new URLSearchParams(loc.search), [loc.search])
  const mode = qs.get('mode') === 'newEmployee' ? 'newEmployee' : 'normal'

  const wasLocked = new URLSearchParams(loc.search).get('locked') === '1'
  const apiNotConfigured = !API_BASE_URL

  type SetupPrefill = {
    method: AuthLoginPreference
    locationCode: AuthLocationCode
    fullName?: string
    userId?: string
  }

  const [sharedDevice, setSharedDevice] = useState(false)
  const [pref, setPref] = useState<AuthLoginPreference | null>(null)
  const [locationCode, setLocationCode] = useState<AuthLocationCode | null>(null)
  const [locationOpen, setLocationOpen] = useState(false)

  // Identity fields
  const [fullName, setFullName] = useState('')
  const [userId, setUserId] = useState('')
  const [pin, setPin] = useState('')
  const [revealPin, setRevealPin] = useState(false)

  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  const pinRef = useRef<HTMLInputElement | null>(null)
  const appliedPrefillRef = useRef(false)
  const prevModeRef = useRef(mode)

  // Rule: all users / new devices start at /login/setup. Redirect /login → /login/setup unless they came from setup (have setupPrefill).
  useEffect(() => {
    const setupPrefill = (loc.state as { setupPrefill?: SetupPrefill } | null)?.setupPrefill
    if (mode === 'newEmployee') return

    if (setupPrefill && !appliedPrefillRef.current) {
      appliedPrefillRef.current = true
      setPref(setupPrefill.method)
      setLocationCode(setupPrefill.locationCode)
      if (setupPrefill.method === 'USER_ID') setUserId(setupPrefill.userId ?? '')
      else setFullName(setupPrefill.fullName ?? '')
      setPin('')
      setFormError('')
      // Clear navigation state after prefill is applied (prevents persistence on refresh/back).
      nav(loc.pathname + loc.search, { replace: true, state: {} })
      return
    }

    if (!setupPrefill && !appliedPrefillRef.current) {
      nav('/login/setup', { replace: true })
    }
  }, [loc.pathname, loc.search, loc.state, mode, nav])

  // When switching from new employee → current employee, clear all selections.
  useEffect(() => {
    const prev = prevModeRef.current
    prevModeRef.current = mode
    if (prev === 'newEmployee' && mode === 'normal') {
      setLocationCode(null)
      setLocationOpen(false)
      setPref(null)
      setFullName('')
      setUserId('')
      setPin('')
      setFormError('')
      appliedPrefillRef.current = false
    }
  }, [mode])

  // When landing on /login?mode=newEmployee (from any page), clear all selections so the new user makes their own choices.
  useEffect(() => {
    if (mode !== 'newEmployee') return
    setLocationCode(null)
    setLocationOpen(false)
    setPref(null)
    setFullName('')
    setUserId('')
    setPin('')
    setFormError('')
    appliedPrefillRef.current = false
  }, [mode])

  const effectivePref: AuthLoginPreference | null = mode === 'newEmployee' ? 'USER_ID' : pref
  const selectedLocation = locationCode != null ? AUTH_LOCATIONS.find((l) => l.code === locationCode) ?? null : null

  const setPreference = (next: AuthLoginPreference) => {
    setPref(next)
  }

  const setLocation = (next: AuthLocationCode) => {
    setLocationCode(next)
    setLocationOpen(false)
  }

  const identityOk =
    effectivePref === 'FULL_NAME'
      ? Boolean(fullName.trim())
      : effectivePref === 'USER_ID'
        ? Boolean(userId.trim())
        : false
  const pinOk = pin.trim().length === 4
  const canSubmit = Boolean(locationCode != null && identityOk && pinOk && !busy && !apiNotConfigured)

  const submitLabel = mode === 'newEmployee' ? 'Continue' : 'Log In'

  const doSubmit = () => {
    if (!canSubmit || !effectivePref || !selectedLocation) return
    void (async () => {
      setFormError('')
      setBusy(true)
      try {
        const siteId = selectedLocation.siteId
        const password = pin.trim()

        let u: ServerUser
        if (effectivePref === 'USER_ID') {
          const email = userIdToEmail(userId)
          u = await apiLogin({ email, password, siteId })
        } else {
          u = await apiLoginByName({ name: fullName.trim(), password, siteId })
        }

        onAuthed(u)

        const requiresProfile = Boolean((u as unknown as { requiresProfileCompletion?: boolean }).requiresProfileCompletion)
        if (mode === 'newEmployee' || requiresProfile) {
          try {
            sessionStorage.setItem(AUTH_STORAGE_KEYS.provisionedUserId, (effectivePref === 'USER_ID' ? userId.trim() : '').trim())
          } catch {
            // ignore
          }
          nav(`/login/profile?userId=${encodeURIComponent((effectivePref === 'USER_ID' ? userId.trim() : '').trim())}`, { replace: true })
          return
        }

        nav('/clock-station', { replace: true })
      } catch (e) {
        const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : 'Login failed.'
        setFormError(msg)
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      <div className="flex min-h-screen items-start justify-center overflow-x-hidden px-4 pb-4 pt-6 sm:items-start sm:px-6 sm:pb-4 sm:pt-4 sm:overflow-x-visible">
        <div className="relative w-full max-w-[480px] rounded-2xl bg-white px-6 py-6 shadow-[0_14px_35px_rgba(15,23,42,0.12)] ring-1 ring-slate-200">
          <button
            type="button"
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-500 ring-1 ring-slate-100 transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-[rgba(23,42,130,0.18)]"
            aria-label="Exit"
            onClick={() => nav('/', { replace: true })}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="flex w-full flex-col items-center text-center">
            <BrandMark size="lg" subtitle="Workforce Attendance" wrapTitle wrapSubtitle className="w-full flex-col" />
          </div>

          <div className="mt-6 space-y-4 sm:mt-7 sm:space-y-5">
            {wasLocked ? (
              <AlertBanner
                tone="warn"
                icon={AlertCircle}
                title="Session Locked"
                description="Your session was locked for security. Please log in again to continue."
              />
            ) : null}
            {apiNotConfigured ? (
              <AlertBanner
                tone="warn"
                icon={AlertCircle}
                title="API not configured"
                description={
                  <>
                    Set <code className="rounded bg-slate-200 px-1 font-mono text-sm">VITE_API_BASE_URL</code> and redeploy.
                  </>
                }
              />
            ) : null}
            {formError ? <AlertBanner tone="danger" icon={AlertCircle} title={formError} /> : null}

            {/* Work Location (dropdown-like) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Work Location</div>
                <button
                  type="button"
                  className={`${ui.focusRing} text-sm font-semibold text-[color:var(--brand-primary)] underline underline-offset-4`}
                  onClick={() => setLocationOpen((v) => !v)}
                >
                  Change
                </button>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900">
                {selectedLocation?.label ?? 'Select work location'}
              </div>
              {locationOpen ? (
                <SelectTileGroup
                  ariaLabel="Work location"
                  columns={1}
                  value={locationCode}
                  onChange={(v) => {
                    const next = v as AuthLocationCode
                    if (next === 'HQs' || next === 'DTX' || next === 'RCA' || next === 'FHPA') setLocation(next)
                  }}
                  options={AUTH_LOCATIONS.map((l) => ({ value: l.code, label: l.label }))}
                />
              ) : null}
            </div>

            {/* Identity + switch link */}
            {effectivePref == null ? (
              <AlertBanner tone="info" title="Complete first-time setup to choose your sign-in method." />
            ) : effectivePref === 'USER_ID' ? (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-900">User ID</div>
                <TextInput value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Enter your user ID" />
                {mode !== 'newEmployee' ? (
                  <button
                    type="button"
                    className={`${ui.focusRing} text-sm font-semibold text-[color:var(--brand-primary)] underline underline-offset-4`}
                    onClick={() => setPreference('FULL_NAME')}
                  >
                    Use Full Name instead
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-900">Full Name</div>
                <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />
                <button
                  type="button"
                  className={`${ui.focusRing} text-sm font-semibold text-[color:var(--brand-primary)] underline underline-offset-4`}
                  onClick={() => setPreference('USER_ID')}
                >
                  Use User ID instead
                </button>
              </div>
            )}

            {/* PIN */}
            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-900">PIN</div>
              <div className="relative">
                <TextInput
                  ref={pinRef}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                  placeholder="Enter 4-digit PIN"
                  type={revealPin ? 'text' : 'password'}
                />
                <button
                  type="button"
                  className={`${ui.focusRing} absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 hover:text-slate-900`}
                  onClick={() => setRevealPin((v) => !v)}
                  aria-label={revealPin ? 'Hide PIN' : 'Show PIN'}
                >
                  {revealPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Shared device */}
            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-4">
              <Checkbox
                className="mt-1"
                checked={sharedDevice}
                onChange={(e) => {
                  const next = e.target.checked
                  setSharedDevice(next)
                }}
                aria-label="This is a shared device"
              />
              <div>
                <div className="text-sm font-semibold text-slate-900">This is a shared device</div>
                <div className="text-sm text-slate-500">You'll be logged out automatically after inactivity</div>
              </div>
            </label>

            <PrimaryButton
              type="button"
              className="h-12 w-full justify-center text-base"
              disabled={!canSubmit}
              onClick={doSubmit}
            >
              {busy ? 'Signing in…' : submitLabel}
            </PrimaryButton>

            <div className="border-t border-slate-200 pt-4 text-center text-sm text-slate-600">
              <div className="font-semibold text-slate-500">Switch user</div>
              {mode !== 'newEmployee' ? (
                <div className="mt-2 text-sm">
                  New employee?{' '}
                  <button
                    type="button"
                    className={`${ui.focusRing} font-semibold text-[color:var(--brand-primary)] underline underline-offset-4`}
                    onClick={() => nav('/login?mode=newEmployee', { replace: true, state: {} })}
                  >
                    Get started
                  </button>
                </div>
              ) : (
                <div className="mt-2 text-sm">
                  Current employee?{' '}
                  <button
                    type="button"
                    className={`${ui.focusRing} font-semibold text-[color:var(--brand-primary)] underline underline-offset-4`}
                    onClick={() => nav('/login', { replace: true, state: {} })}
                  >
                    Log in
                  </button>
                </div>
              )}
              <div className="mt-3 text-sm">
                Forgot your PIN?{' '}
                <button type="button" className={`${ui.focusRing} font-semibold text-[color:var(--brand-primary)] underline underline-offset-4`}>
                  Contact administrator
                </button>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 text-center text-[11px] leading-5 text-slate-500">
              Access is managed by the administrator.
              <br />
              Only authorized users may access JIM.
              <br />
              If you don't have credentials, please request access.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

