import { AlertCircle, Eye, EyeOff, X } from 'lucide-react'
import { useState } from 'react'
import { API_BASE_URL } from '../../api/config'
import { apiLogin, apiLoginByName, type ServerUser } from '../../api/auth'
import { AlertBanner } from '../../components/ui/AlertBanner'
import { PrimaryButton } from '../../components/ui/Button'
import { Checkbox } from '../../components/ui/Controls'
import { SelectTileGroup } from '../../components/ui/SelectTileGroup'
import { TextInput } from '../../components/ui/Fields'
import { ui } from '../../components/ui/tokens'
import { BrandMark } from '../../components/BrandMark'
import { WAREHOUSES, type WarehouseCode } from '../../warehouse/warehouses'

function userIdToEmail(userId: string): string {
  const raw = userId.trim().toLowerCase()
  if (!raw) return ''
  if (raw.includes('@')) return raw
  const key = userId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  const m = /^([A-Z]{3})([A-Z]{2})(\d{4})$/.exec(key)
  const canonical = m ? `${m[1]}-${m[2]}-${m[3]}` : key
  return `${canonical.toLowerCase()}@jillamy.local`
}

export function LoginPage({ onAuthed }: { onAuthed: (u: ServerUser) => void }) {
  const [loginUserType, setLoginUserType] = useState<'returning' | 'firstTime' | null>(null)
  const [loginLocation, setLoginLocation] = useState<WarehouseCode | null>(null)
  const [returningLoginMethod, setReturningLoginMethod] = useState<'fullName' | 'userId' | null>(null)
  const [returningFirstName, setReturningFirstName] = useState('')
  const [returningLastName, setReturningLastName] = useState('')
  const [returningUserId, setReturningUserId] = useState('')
  const [returningPinDigits, setReturningPinDigits] = useState(['', '', '', ''])
  const [revealPin, setRevealPin] = useState(false)
  const [sharedDevice, setSharedDevice] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)

  const apiNotConfigured = !API_BASE_URL
  const selectedWarehouse = loginLocation ? WAREHOUSES.find((w) => w.code === loginLocation) ?? null : null

  const returningPin = returningPinDigits.join('')
  const returningNameValid = Boolean(returningFirstName.trim() && returningLastName.trim())
  const returningUserIdValid = Boolean(returningUserId.trim())
  const returningIdentifierValid =
    returningLoginMethod === 'fullName' ? returningNameValid : returningLoginMethod === 'userId' ? returningUserIdValid : false
  const returningPinValid = returningPin.length === 4

  const step1Done = loginUserType !== null
  const step2Done = step1Done && loginLocation !== null
  const returningStep3Done = step2Done && loginUserType === 'returning' && returningLoginMethod !== null
  const returningStep4Done = returningStep3Done && returningIdentifierValid
  const returningStep5Done = returningStep4Done && returningPinValid

  const showErr = (key: string): boolean => Boolean(submitAttempted || touched[key])

  const resetFormState = (nextType: 'returning' | 'firstTime') => {
    setLoginUserType(nextType)
    setLoginLocation(null)
    setFormError('')
    setFieldErrors({})
    setSubmitAttempted(false)
    setTouched({})
    setRevealPin(false)
    setReturningLoginMethod(null)
    setReturningFirstName('')
    setReturningLastName('')
    setReturningUserId('')
    setReturningPinDigits(['', '', '', ''])
  }

  const markTouched = (key: string) => {
    setTouched((prev) => ({ ...prev, [key]: true }))
  }

  const handleSubmit = async () => {
    setSubmitAttempted(true)
    setFormError('')
    setFieldErrors({})

    if (!loginUserType || !loginLocation) {
      if (!loginLocation) setFieldErrors((p) => ({ ...p, location: 'Work location is required.' }))
      return
    }
    if (!selectedWarehouse) {
      setFormError('Invalid location selection.')
      return
    }

    if (loginUserType === 'firstTime') {
      setFormError('First-time contractor setup is not available here. Contact the administrator to be added.')
      return
    }

    if (!returningLoginMethod) {
      setFieldErrors({ returningLoginMethod: 'Select a login method.' })
      return
    }
    const identity =
      returningLoginMethod === 'userId'
        ? returningUserId.trim()
        : `${returningFirstName.trim()} ${returningLastName.trim()}`.trim()
    if (!identity) {
      setFieldErrors(
        returningLoginMethod === 'userId'
          ? { returningUserId: 'User ID is required.' }
          : { returningFirstName: 'First name is required.', returningLastName: 'Last name is required.' },
      )
      return
    }
    if (returningPin.length !== 4) {
      setFieldErrors({ returningPin: 'PIN must be 4 digits.' })
      return
    }

    setBusy(true)
    try {
      const siteId = selectedWarehouse.siteId
      const pin = returningPin
      if (returningLoginMethod === 'userId') {
        const email = userIdToEmail(identity)
        const u = await apiLogin({ email, password: pin, siteId })
        onAuthed(u)
      } else {
        const u = await apiLoginByName({ name: identity, password: pin, siteId })
        onAuthed(u)
      }
    } catch (e) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : 'Login failed.'
      setFormError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={ui.page.bg}>
      <div className="flex min-h-full items-center justify-center px-4 py-4 sm:px-6">
        <div className="relative w-full max-w-[480px] rounded-2xl bg-white px-6 py-6 shadow-[0_14px_35px_rgba(15,23,42,0.12)] ring-1 ring-slate-200">
          <button
            type="button"
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-500 ring-1 ring-slate-100 transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-[rgba(23,42,130,0.18)]"
            aria-label="Exit"
            onClick={() => window.history.back()}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>

          {/* Header */}
          <div className="flex w-full flex-col items-center text-center">
            <BrandMark size="lg" subtitle="Contractor Clock In/Out" wrapTitle wrapSubtitle className="w-full flex-col" />
          </div>

          <div className="mt-7 space-y-5">
            {apiNotConfigured ? (
              <AlertBanner
                tone="warn"
                icon={AlertCircle}
                title="API not configured"
                description={
                  <>
                    Set <code className="rounded bg-slate-200 px-1 font-mono text-sm">VITE_API_BASE_URL</code> in{' '}
                    <code className="rounded bg-slate-200 px-1 font-mono text-sm">.env</code> (e.g.{' '}
                    <code className="rounded bg-slate-200 px-1 font-mono text-sm">http://localhost:8787/api/v1</code>) and restart the dev server.
                  </>
                }
              />
            ) : null}

            {/* Step 1: User Type */}
            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-900">Step 1: User Type</div>
              <SelectTileGroup
                ariaLabel="User type"
                columns={2}
                value={loginUserType}
                options={[
                  { value: 'returning', label: 'Returning User' },
                  { value: 'firstTime', label: 'First-Time User' },
                ]}
                onChange={(v) => {
                  if (v === 'returning' || v === 'firstTime') resetFormState(v)
                }}
              />
            </div>

            {/* Step 2: Work Location */}
            {step1Done ? (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-900">
                  Step 2: Work Location <span className="text-rose-600">*</span>
                </div>
                <SelectTileGroup
                  ariaLabel="Work location"
                  columns={2}
                  value={loginLocation}
                  options={[
                    { value: 'HQ', label: 'HQs' },
                    { value: 'DTX', label: 'DTX' },
                    { value: 'RCA', label: 'RCA' },
                    { value: 'FHPA', label: 'FHPA' },
                  ]}
                  onChange={(v) => {
                    setLoginLocation(v as WarehouseCode)
                    setFormError('')
                    setFieldErrors((p) => ({ ...p, location: '' }))
                    setReturningLoginMethod(null)
                    setReturningFirstName('')
                    setReturningLastName('')
                    setReturningUserId('')
                    setReturningPinDigits(['', '', '', ''])
                    setRevealPin(false)
                  }}
                />
                {showErr('location') && !loginLocation ? (
                  <div className="text-sm font-semibold text-rose-700">Work location is required.</div>
                ) : null}
              </div>
            ) : null}

            {/* Returning user: Step 3, 4, 5 */}
            {step2Done && loginUserType === 'returning' ? (
              <div className="space-y-4">
                {/* Step 3: Login Method */}
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-900">
                    Step 3: Login Method <span className="text-rose-600">*</span>
                  </div>
                  <SelectTileGroup
                    ariaLabel="Login method"
                    columns={2}
                    value={returningLoginMethod}
                    options={[
                      { value: 'fullName', label: 'Full Name' },
                      { value: 'userId', label: 'User ID' },
                    ]}
                    onChange={(v) => {
                      if (v === 'fullName') {
                        setReturningLoginMethod('fullName')
                        setReturningUserId('')
                      } else if (v === 'userId') {
                        setReturningLoginMethod('userId')
                        setReturningFirstName('')
                        setReturningLastName('')
                      }
                      setReturningPinDigits(['', '', '', ''])
                      setRevealPin(false)
                      setFormError('')
                      setFieldErrors({})
                    }}
                  />
                  {showErr('returningLoginMethod') && !returningLoginMethod ? (
                    <div className="text-sm font-semibold text-rose-700">Select a login method.</div>
                  ) : null}
                </div>

                {/* Step 4: Full Name or User ID */}
                {returningLoginMethod === 'fullName' ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-900">
                      Step 4: Full Name <span className="text-rose-600">*</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <TextInput
                        className="h-12 bg-slate-50"
                        aria-invalid={Boolean((showErr('returningFirstName') && !returningFirstName.trim()) || fieldErrors.returningFirstName)}
                        value={returningFirstName}
                        onChange={(e) => {
                          setReturningFirstName(e.target.value)
                          setReturningPinDigits(['', '', '', ''])
                          setFormError('')
                          setFieldErrors((p) => ({ ...p, returningFirstName: '' }))
                        }}
                        onBlur={() => markTouched('returningFirstName')}
                        placeholder="First Name"
                      />
                      <TextInput
                        className="h-12 bg-slate-50"
                        aria-invalid={Boolean((showErr('returningLastName') && !returningLastName.trim()) || fieldErrors.returningLastName)}
                        value={returningLastName}
                        onChange={(e) => {
                          setReturningLastName(e.target.value)
                          setReturningPinDigits(['', '', '', ''])
                          setFormError('')
                          setFieldErrors((p) => ({ ...p, returningLastName: '' }))
                        }}
                        onBlur={() => markTouched('returningLastName')}
                        placeholder="Last Name"
                      />
                    </div>
                    {showErr('returningFirstName') && !returningFirstName.trim() ? (
                      <div className="text-sm font-semibold text-rose-700">First name is required.</div>
                    ) : null}
                    {showErr('returningLastName') && !returningLastName.trim() ? (
                      <div className="text-sm font-semibold text-rose-700">Last name is required.</div>
                    ) : null}
                  </div>
                ) : returningLoginMethod === 'userId' ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-900">
                      Step 4: User ID <span className="text-rose-600">*</span>
                    </label>
                    <TextInput
                      className="h-12 bg-slate-50"
                      aria-invalid={Boolean((showErr('returningUserId') && !returningUserId.trim()) || fieldErrors.returningUserId)}
                      value={returningUserId}
                      onChange={(e) => {
                        setReturningUserId(e.target.value)
                        setReturningPinDigits(['', '', '', ''])
                        setFormError('')
                        setFieldErrors((p) => ({ ...p, returningUserId: '' }))
                      }}
                      onBlur={() => markTouched('returningUserId')}
                      placeholder="Enter your User ID"
                    />
                    {showErr('returningUserId') && !returningUserId.trim() ? (
                      <div className="text-sm font-semibold text-rose-700">User ID is required.</div>
                    ) : null}
                  </div>
                ) : null}

                {/* Step 5: PIN */}
                {returningStep4Done ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label className="block text-sm font-semibold text-slate-900">
                        Step 5: Enter PIN <span className="text-rose-600">*</span>
                      </label>
                      <button
                        type="button"
                        className={`${ui.focusRing} inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900`}
                        aria-label={revealPin ? 'Hide PIN' : 'Show PIN'}
                        onClick={() => setRevealPin((v) => !v)}
                      >
                        {revealPin ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    </div>
                    <div className="flex w-full justify-center">
                      <div className="mx-auto flex justify-center gap-2">
                        {returningPinDigits.map((digit, idx) => (
                          <TextInput
                            key={idx}
                            id={`pin-${idx}`}
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={1}
                            autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                            style={revealPin ? undefined : ({ WebkitTextSecurity: 'disc' } as React.CSSProperties)}
                            className="h-10 w-10 px-0 text-center text-lg font-semibold bg-slate-50 rounded-xl border border-slate-200"
                            aria-invalid={Boolean((showErr('returningPin') && returningPin.length !== 4) || fieldErrors.returningPin)}
                            value={digit}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 1)
                              const next = [...returningPinDigits]
                              next[idx] = val
                              setReturningPinDigits(next)
                              setFormError('')
                              setFieldErrors((p) => ({ ...p, returningPin: '' }))
                              if (val && idx < returningPinDigits.length - 1) {
                                const nextInput = document.getElementById(`pin-${idx + 1}`)
                                ;(nextInput as HTMLInputElement | null)?.focus()
                              }
                            }}
                            onBlur={() => markTouched('returningPin')}
                            onKeyDown={(e) => {
                              if (e.key === 'Backspace' && !returningPinDigits[idx] && idx > 0) {
                                const prevInput = document.getElementById(`pin-${idx - 1}`) as HTMLInputElement | null
                                prevInput?.focus()
                                const next = [...returningPinDigits]
                                next[idx - 1] = ''
                                setReturningPinDigits(next)
                              }
                            }}
                            aria-label={`PIN digit ${idx + 1}`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="text-center text-sm text-slate-500">Enter your 4-digit PIN.</div>
                    {showErr('returningPin') && returningPin.length !== 4 ? (
                      <div className="text-sm font-semibold text-rose-700">PIN must be 4 digits.</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : step2Done && loginUserType === 'firstTime' ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                First-time contractor setup is not available here. Contact the administrator to be added.
              </div>
            ) : null}

            {formError ? <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div> : null}

            {/* Shared device */}
            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-4">
              <Checkbox
                className="mt-1"
                checked={sharedDevice}
                onChange={(e) => setSharedDevice(e.target.checked)}
                aria-label="This is a shared device"
              />
              <div>
                <div className="text-sm font-semibold text-slate-900">This is a shared device</div>
                <div className="text-sm text-slate-500">You'll be logged out automatically after inactivity</div>
              </div>
            </label>

            {/* Sign in button */}
            {step2Done && loginUserType === 'returning' && returningStep4Done ? (
              <div className="mx-auto w-full max-w-[420px]">
                <PrimaryButton
                  type="button"
                  size="lg"
                  className={`w-full rounded-[10px] !text-white active:scale-[0.98] ${
                    !returningStep5Done ? 'opacity-70' : 'hover:-translate-y-0.5'
                  }`}
                  disabled={!returningStep5Done || busy}
                  onClick={() => void handleSubmit()}
                >
                  {busy ? 'Signing in…' : 'Sign in'}
                </PrimaryButton>
              </div>
            ) : null}

            {/* Footer */}
            <div className="pt-1 text-center">
              <a
                href="mailto:admin@jillamy.com"
                className="text-sm text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline"
              >
                Forgot your PIN? Contact the administrator to reset
              </a>
              <div className="my-3 h-px w-full bg-slate-200" />
              <div className="space-y-1">
                <p className="break-words text-[10px] leading-tight text-slate-500">
                  (JIM) Jillamy Inventory Management web app stores offline users on this device only.
                </p>
                <p className="break-words text-[10px] leading-tight text-slate-500">
                  If you need a server account, please contact the system administrator.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
