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
  loadLastLocation,
  loadLoginPreference,
  saveLastLocation,
  saveLoginPreference,
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

  const [sharedDevice, setSharedDevice] = useState(false)
  const [pref, setPref] = useState<AuthLoginPreference | null>(() => loadLoginPreference())
  const [locationCode, setLocationCode] = useState<AuthLocationCode>(() => loadLastLocation() ?? 'DTX')
  const [locationOpen, setLocationOpen] = useState(false)

  // Identity fields
  const [fullName, setFullName] = useState('')
  const [userId, setUserId] = useState('')
  const [pin, setPin] = useState('')
  const [revealPin, setRevealPin] = useState(false)

  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  const pinRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    // If no preference is stored, send the user through /login/setup once per device.
    if (mode === 'newEmployee') return
    if (!pref) nav('/login/setup', { replace: true })
  }, [mode, nav, pref])

  const effectivePref: AuthLoginPreference = mode === 'newEmployee' ? 'USER_ID' : (pref ?? 'USER_ID')
  const selectedLocation = AUTH_LOCATIONS.find((l) => l.code === locationCode) ?? AUTH_LOCATIONS[1]!

  const setPreference = (next: AuthLoginPreference) => {
    setPref(next)
    // Default to local storage unless the user explicitly chose shared device.
    saveLoginPreference(next, sharedDevice ? 'session' : 'local')
  }

  const setLocation = (next: AuthLocationCode) => {
    setLocationCode(next)
    saveLastLocation(next, sharedDevice ? 'session' : 'local')
    setLocationOpen(false)
  }

  const identityOk = effectivePref === 'FULL_NAME' ? Boolean(fullName.trim()) : Boolean(userId.trim())
  const pinOk = pin.trim().length === 4
  const canSubmit = Boolean(identityOk && pinOk && !busy && !apiNotConfigured)

  const submitLabel = mode === 'newEmployee' ? 'Continue' : 'Log In'

  const doSubmit = () => {
    if (!canSubmit) return
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
                {selectedLocation.label}
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
            {effectivePref === 'USER_ID' ? (
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
                  // Move preference/location to the correct storage.
                  const storage = next ? 'session' : 'local'
                  if (pref) saveLoginPreference(pref, storage)
                  saveLastLocation(locationCode, storage)
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

            <div className="pt-2 text-center text-sm text-slate-600">
              <div className="font-semibold text-slate-500">Switch user</div>
              <div className="mt-2">
                <button
                  type="button"
                  className={`${ui.focusRing} text-sm font-semibold text-[color:var(--brand-primary)] underline underline-offset-4`}
                  onClick={() => nav('/login?mode=newEmployee', { replace: true })}
                >
                  First time here? Get started
                </button>
              </div>
              <div className="mt-3 text-sm">
                Forgot your PIN?{' '}
                <button type="button" className={`${ui.focusRing} font-semibold text-[color:var(--brand-primary)] underline underline-offset-4`}>
                  Contact administrator
                </button>
              </div>
            </div>

            <div className="pt-2 text-center text-[11px] leading-5 text-slate-500">
              Access is managed by the administrator. Only authorized users may access JIM. If you don’t have credentials, please request access.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

