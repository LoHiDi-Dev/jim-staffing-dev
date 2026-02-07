import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertBanner } from '../../../components/ui/AlertBanner'
import { PrimaryButton, SecondaryButton } from '../../../components/ui/Button'
import { SelectTileGroup } from '../../../components/ui/SelectTileGroup'
import { TextInput } from '../../../components/ui/Fields'
import { BrandMark } from '../../../components/BrandMark'
import { ui } from '../../../components/ui/tokens'
import { AUTH_LOCATIONS, AUTH_STORAGE_KEYS, type AuthLocationCode, type AuthLoginPreference } from './authKeys'

export function LoginSetupPage() {
  const nav = useNavigate()

  const [method, setMethod] = useState<AuthLoginPreference | null>(null)
  const [locationCode, setLocationCode] = useState<AuthLocationCode | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [userId, setUserId] = useState('')

  const canContinue =
    locationCode !== null &&
    (method === 'USER_ID'
      ? Boolean(userId.trim())
      : method === 'FULL_NAME'
        ? Boolean(firstName.trim() && lastName.trim())
        : false)

  return (
      <div className="min-h-screen bg-[#f4f6fb]">
        <div className="flex items-start justify-center px-4 pb-8 pt-6 sm:px-6 sm:pt-8">
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
                title={<span className="whitespace-nowrap">Choose how you'd like to identify yourself when logging in.</span>}
              />

              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-900">
                  Work location <span className="text-rose-600">*</span>
                </div>
                <SelectTileGroup
                  ariaLabel="Work location (required)"
                  columns={2}
                  value={locationCode ?? null}
                  onChange={(v) => {
                    const next = v as AuthLocationCode
                    if (next === 'HQs' || next === 'DTX' || next === 'RCA' || next === 'FHPA') setLocationCode(next)
                  }}
                  options={AUTH_LOCATIONS.map((l) => ({
                    value: l.code,
                    label: l.code,
                    sublabel: l.label.includes(' — ') ? l.label.split(' — ')[1]!.trim() : '',
                  }))}
                />
              </div>

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

              {method === 'USER_ID' ? (
                <div className="space-y-1.5">
                  <div className="text-sm font-semibold text-slate-900">
                    User ID <span className="text-rose-600">*</span>
                  </div>
                  <TextInput value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Enter your user ID" />
                </div>
              ) : null}

              <div className="pt-1 space-y-3">
                <PrimaryButton
                  type="button"
                  className="h-12 w-full justify-center text-base"
                  disabled={!canContinue}
                  onClick={() => {
                    if (!locationCode || !method) return
                    try {
                      // Clear any stale provisioned user id from earlier sessions.
                      sessionStorage.removeItem(AUTH_STORAGE_KEYS.provisionedUserId)
                    } catch {
                      // ignore
                    }
                    const setupPrefill =
                      method === 'FULL_NAME'
                        ? { method: 'FULL_NAME' as const, fullName: `${firstName.trim()} ${lastName.trim()}`.trim(), userId: undefined, locationCode }
                        : { method: 'USER_ID' as const, fullName: undefined, userId: userId.trim(), locationCode }
                    nav('/login', { replace: true, state: { setupPrefill } })
                  }}
                >
                  Continue
                </PrimaryButton>

                <SecondaryButton type="button" className="h-12 w-full justify-center text-base" onClick={() => nav('/', { replace: true })}>
                  Cancel
                </SecondaryButton>
              </div>

              <div className="border-t border-slate-200 pt-4 text-center text-sm text-slate-600">
                <div className="font-semibold text-slate-500">Switch user</div>
                <button
                  type="button"
                  className={`${ui.focusRing} mt-2 text-sm font-semibold text-[color:var(--brand-primary)] underline underline-offset-4`}
                  onClick={() => nav('/login?mode=newEmployee', { replace: true, state: {} })}
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

