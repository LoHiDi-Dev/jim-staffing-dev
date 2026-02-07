import { ArrowLeft, AlertCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiCompleteProfile } from '../../../api/auth'
import { AlertBanner } from '../../../components/ui/AlertBanner'
import { PrimaryButton } from '../../../components/ui/Button'
import { TextInput } from '../../../components/ui/Fields'
import { BrandMark } from '../../../components/BrandMark'
import { ui } from '../../../components/ui/tokens'
import { AUTH_STORAGE_KEYS } from './authKeys'

export function CompleteProfilePage() {
  const nav = useNavigate()
  const loc = useLocation()
  const qs = useMemo(() => new URLSearchParams(loc.search), [loc.search])
  const userId = qs.get('userId') || (() => {
    try {
      return sessionStorage.getItem(AUTH_STORAGE_KEYS.provisionedUserId) ?? ''
    } catch {
      return ''
    }
  })()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const canContinue = Boolean(firstName.trim() && lastName.trim())

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
              <div className="text-2xl font-extrabold tracking-tight text-slate-900">Complete Your Profile</div>
              <div className="mt-1 text-sm text-slate-500">First login setup required</div>
            </div>

            <div className="mt-6 space-y-5">
              <AlertBanner
                tone="info"
                title="Welcome to JIM!"
                description="Since this is your first login, we need a few details to complete your account setup."
              />

              {err ? <AlertBanner tone="danger" icon={AlertCircle} title={err} /> : null}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                Your User ID: <span className="font-extrabold text-slate-900">{userId || '—'}</span>
              </div>

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

              <PrimaryButton
                type="button"
                className="h-12 w-full justify-center text-base"
                disabled={!canContinue || busy}
                onClick={() => {
                  if (!canContinue || busy) return
                  void (async () => {
                    setErr('')
                    setBusy(true)
                    try {
                      const res = await apiCompleteProfile({ firstName, lastName })
                      if (!res.ok) throw new Error('Profile update failed.')
                      // After profile completion, return to setup to choose login method preference.
                      nav('/login/setup?force=1&next=dashboard', { replace: true })
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : 'Profile update failed.')
                    } finally {
                      setBusy(false)
                    }
                  })()
                }}
              >
                {busy ? 'Continuing…' : 'Continue'}
              </PrimaryButton>
            </div>
          </div>
        </div>
      </div>
  )
}

