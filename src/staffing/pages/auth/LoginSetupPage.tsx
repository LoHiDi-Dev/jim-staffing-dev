import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertBanner } from '../../../components/ui/AlertBanner'
import { PrimaryButton, SecondaryButton } from '../../../components/ui/Button'
import { SelectTileGroup } from '../../../components/ui/SelectTileGroup'
import { TextInput } from '../../../components/ui/Fields'
import { BrandMark } from '../../../components/BrandMark'
import { ui } from '../../../components/ui/tokens'
import { AUTH_STORAGE_KEYS, loadLoginPreference, saveLoginPreference, type AuthLoginPreference } from './authKeys'

export function LoginSetupPage() {
  const nav = useNavigate()
  const loc = useLocation()
  const qs = useMemo(() => new URLSearchParams(loc.search), [loc.search])
  const force = qs.get('force') === '1'
  const next = qs.get('next')

  const [method, setMethod] = useState<AuthLoginPreference | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  useEffect(() => {
    if (force) return
    const existing = loadLoginPreference()
    if (existing) {
      // Auto-forward when preference already exists (device/browser remembered).
      nav('/login', { replace: true })
    }
  }, [force, nav])

  const canContinue =
    method === 'USER_ID'
      ? true
      : method === 'FULL_NAME'
        ? Boolean(firstName.trim() && lastName.trim())
        : false

  return (
      <div className="min-h-screen bg-[#f4f6fb]">
        <div className="px-4 pt-5 sm:px-6 sm:pt-6">
          <button
            type="button"
            className={`${ui.focusRing} inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900`}
            onClick={() => nav('/login', { replace: true })}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to login
          </button>
        </div>

        <div className="flex items-start justify-center px-4 pb-8 pt-4 sm:px-6">
          <div className="w-full max-w-[520px] rounded-2xl bg-white px-6 py-6 shadow-[0_14px_35px_rgba(15,23,42,0.12)] ring-1 ring-slate-200">
            <div className="flex w-full flex-col items-center text-center">
              <BrandMark size="lg" subtitle="Workforce Attendance" wrapTitle wrapSubtitle className="w-full flex-col" />
            </div>

            <div className="mt-6 text-center">
              <div className="text-2xl font-extrabold tracking-tight text-slate-900">First-Time Setup</div>
              <div className="mt-1 text-sm text-slate-500">Set up your account to start using JIM</div>
              <div className="mt-3 flex items-center justify-center gap-2" aria-hidden="true">
                <span className="h-2 w-8 rounded-full bg-[color:var(--brand-primary)]" />
                <span className="h-2 w-2 rounded-full bg-slate-200" />
                <span className="h-2 w-2 rounded-full bg-slate-200" />
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <AlertBanner
                tone="info"
                title="Choose how you'd like to identify yourself when logging in."
              />

              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-900">Login Method</div>
                <SelectTileGroup
                  ariaLabel="Login method preference"
                  columns={2}
                  value={method}
                  onChange={(v) => {
                    if (v === 'FULL_NAME' || v === 'USER_ID') setMethod(v)
                  }}
                  options={[
                    { value: 'FULL_NAME', label: 'Full Name', sublabel: 'Easier to remember' },
                    { value: 'USER_ID', label: 'User ID', sublabel: 'Company standard' },
                  ]}
                />
              </div>

              {method === 'FULL_NAME' ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="text-sm font-semibold text-slate-900">
                      First Name <span className="text-rose-600">*</span>
                    </div>
                    <TextInput value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-sm font-semibold text-slate-900">
                      Last Name <span className="text-rose-600">*</span>
                    </div>
                    <TextInput value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
                  </div>
                </div>
              ) : null}

              <div className="pt-1 space-y-3">
                <PrimaryButton
                  type="button"
                  className="h-12 w-full justify-center text-base"
                  disabled={!canContinue}
                  onClick={() => {
                    if (!method) return
                    saveLoginPreference(method, 'local')
                    try {
                      // Clear any stale provisioned user id from earlier sessions.
                      sessionStorage.removeItem(AUTH_STORAGE_KEYS.provisionedUserId)
                    } catch {
                      // ignore
                    }
                    nav(next === 'dashboard' ? '/clock-station' : '/login', { replace: true })
                  }}
                >
                  Continue
                </PrimaryButton>

                <SecondaryButton type="button" className="h-12 w-full justify-center text-base" onClick={() => nav('/login', { replace: true })}>
                  Cancel
                </SecondaryButton>
              </div>

              <div className="pt-2 text-center text-sm text-slate-600">
                <div className="font-semibold text-slate-500">Switch user</div>
                <button
                  type="button"
                  className={`${ui.focusRing} mt-2 text-sm font-semibold text-[color:var(--brand-primary)] underline underline-offset-4`}
                  onClick={() => nav('/login/setup?force=1', { replace: true })}
                >
                  New employee? Get started
                </button>
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

