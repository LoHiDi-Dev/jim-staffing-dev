import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapPin, RefreshCw, Timer, Clock, FileText } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ServerUser } from '../../api/auth'
import { AlertBanner } from '../../components/ui/AlertBanner'
import { Badge } from '../../components/ui/Badge'
import { DangerButton, PrimaryButton, SecondaryButton, SuccessButton } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { ui } from '../../components/ui/tokens'
import { apiStaffingEvent, apiStaffingState, apiSubmitSignature, type StaffingClockState } from '../../api/staffing'
import { haversineMeters, metersToMiles, STAFFING_SITE } from '../lib/geo'
import { STAFFING_COPY } from '../copy'
import { SignaturePad, type SignaturePadHandle } from '../components/SignaturePad'

type GeoStatus =
  | { state: 'idle' }
  | { state: 'blocked'; reason: 'permission' | 'unavailable'; message: string }
  | {
      state: 'ok'
      lat: number
      lng: number
      accuracyMeters?: number
      distanceMeters: number
      inRange: boolean
      accuracyOk: boolean
    }

export function ClockStationPage({ user }: { user: ServerUser }) {
  const [geo, setGeo] = useState<GeoStatus>({ state: 'idle' })
  const [busyGeo, setBusyGeo] = useState(false)
  const clockStateCacheKey = useMemo(() => `jim.staffing.clockState.${user.id}`, [user.id])
  const verificationMethodKey = useMemo(() => `jim.staffing.verificationMethod.${user.id}`, [user.id])
  const [clockState, setClockState] = useState<StaffingClockState | null>(() => {
    try {
      const raw = sessionStorage.getItem(clockStateCacheKey)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Partial<StaffingClockState>
      if (typeof parsed.clockedIn !== 'boolean' || typeof parsed.onLunch !== 'boolean') return null
      return parsed as StaffingClockState
    } catch {
      return null
    }
  })
  const [err, setErr] = useState<string | null>(null)
  const [online, setOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  const loc = useLocation()
  const nav = useNavigate()
  const sigRef = useRef<SignaturePadHandle | null>(null)
  const [busySig, setBusySig] = useState(false)
  const [verificationMethod, setVerificationMethod] = useState<'wifi' | 'location' | null>(() => {
    try {
      const v = localStorage.getItem(verificationMethodKey)
      if (v === 'wifi' || v === 'location') return v
      // Migration from older global key.
      const legacy = localStorage.getItem('jim.staffing.verificationMode')
      if (legacy === 'wifi' || legacy === 'location') {
        localStorage.setItem(verificationMethodKey, legacy)
        localStorage.removeItem('jim.staffing.verificationMode')
        return legacy
      }
      if (legacy === 'auto') localStorage.removeItem('jim.staffing.verificationMode')
      return null
    } catch {
      return null
    }
  })

  const setMethod = useCallback(
    (m: 'wifi' | 'location') => {
      setVerificationMethod(m)
      try {
        localStorage.setItem(verificationMethodKey, m)
        localStorage.removeItem('jim.staffing.verificationMode')
      } catch {
        // ignore
      }
    },
    [verificationMethodKey],
  )

  const firstName = useMemo(() => (user?.name ? user.name.split(' ')[0] : 'there'), [user?.name])

  const refreshState = async (): Promise<StaffingClockState | null> => {
    try {
      const s = await apiStaffingState()
      setClockState(s)
      try {
        sessionStorage.setItem(clockStateCacheKey, JSON.stringify(s))
      } catch {
        // ignore
      }
      return s
    } catch {
      // Don't overwrite cached state on transient failures (prevents UI flicker).
      if (!clockState) {
        const fallback: StaffingClockState = {
          clockedIn: false,
          onLunch: false,
          lastActionLabel: undefined,
          lastSyncAt: undefined,
        }
        setClockState(fallback)
        return fallback
      }
      return clockState
    }
  }

  const refreshLocation = async () => {
    setErr(null)
    setBusyGeo(true)
    try {
      if (!navigator.geolocation) {
        setGeo({ state: 'blocked', reason: 'unavailable', message: 'Geolocation is not available on this device.' })
        return
      }
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
      })
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      const accuracyMeters = pos.coords.accuracy ?? undefined
      const distanceMeters = haversineMeters({ lat, lng }, { lat: STAFFING_SITE.lat, lng: STAFFING_SITE.lng })
      const inRange = distanceMeters <= STAFFING_SITE.radiusMeters
      const accuracyOk = accuracyMeters ? accuracyMeters <= 200 : true
      setGeo({ state: 'ok', lat, lng, accuracyMeters, distanceMeters, inRange, accuracyOk })
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? (e as { code?: number }).code : undefined
      if (code === 1) setGeo({ state: 'blocked', reason: 'permission', message: 'Location permission not granted.' })
      else setGeo({ state: 'blocked', reason: 'unavailable', message: 'Location unavailable. Try again.' })
    } finally {
      setBusyGeo(false)
    }
  }

  useEffect(() => {
    const run = async () => {
      const s = await apiStaffingState()
      setClockState(s)
      try {
        sessionStorage.setItem(clockStateCacheKey, JSON.stringify(s))
      } catch {
        // ignore
      }
      const wifiOkNow = s?.wifiAllowlistStatus === 'PASS' || s?.wifiAllowlistStatus === 'DEV_BYPASS'

      // If user chose Wi‑Fi, never prompt for location permission.
      if (verificationMethod === 'wifi') return

      // If user chose Location, run location verification automatically.
      if (verificationMethod === 'location') {
        await refreshLocation()
        return
      }

      // First-time (no preference): show both options, but do not auto-prompt location.
      // If Wi‑Fi is already verified, auto-select Wi‑Fi to avoid showing both forever.
      if (verificationMethod === null && wifiOkNow) setMethod('wifi')
    }
    void run()
  }, [verificationMethod, clockStateCacheKey, setMethod])

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const verified = geo.state === 'ok' && geo.inRange && geo.accuracyOk
  const wifiOk = clockState?.wifiAllowlistStatus === 'PASS' || clockState?.wifiAllowlistStatus === 'DEV_BYPASS'

  // Enforce ONE verification method at a time (after first choice):
  // - If no method chosen yet (first-time), user must choose before punching.
  const canAct = online && (verificationMethod === 'wifi' ? wifiOk : verificationMethod === 'location' ? verified : false)

  const doEvent = async (type: 'CLOCK_IN' | 'LUNCH_START' | 'CLOCK_OUT') => {
    setErr(null)
    try {
      const geoPayload = geo.state === 'ok' ? { lat: geo.lat, lng: geo.lng, accuracyMeters: geo.accuracyMeters } : undefined
      await apiStaffingEvent({ type, geo: geoPayload })
      await refreshState()
    } catch (e) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : 'Action failed.'
      setErr(msg)
    }
  }

  const submitSignature = async () => {
    if (!clockState?.signatureRequired || !clockState.shiftId) return
    const pad = sigRef.current
    if (!pad || pad.isEmpty()) {
      setErr('Please sign before submitting.')
      return
    }
    setErr(null)
    setBusySig(true)
    try {
      await apiSubmitSignature({ shiftId: clockState.shiftId, signaturePngBase64: pad.toDataURL() })
      pad.clear()
      await refreshState()
    } catch (e) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : 'Signature submission failed.'
      setErr(msg)
    } finally {
      setBusySig(false)
    }
  }

  return (
    <div className="bg-[#f4f6fb] px-4 py-4 sm:px-6 sm:py-5">
      <div className={ui.page.container}>
        <div className="mb-3 text-center sm:mb-4">
          <div className="text-3xl font-semibold tracking-tight text-[color:var(--brand-primary)] lg:text-4xl">
            <span aria-hidden="true" className="mr-2 inline-block jim-wave-once">
              👋
            </span>
            Welcome back, {firstName}!
          </div>
          <div className="mt-1 text-sm sm:text-xs md:text-sm leading-5 text-slate-500">
            {STAFFING_COPY.headerSubtitle}
          </div>
        </div>

        {/* Tabs */}
        <div className="mx-auto mb-3 w-full max-w-7xl sm:mb-4" role="tablist" aria-label="Clock station sections">
          <div className="overflow-x-auto">
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
              {[
                { key: 'clock-station', label: 'Clock Station', to: '/clock-station', icon: Clock },
                  { key: 'my-times', label: 'My Timecard', to: '/my-timecard', icon: FileText },
              ].map((tab) => {
                const active = loc.pathname === tab.to
                const Icon = tab.icon
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-pressed={active}
                    onClick={() => nav(tab.to)}
                    className={`${ui.focusRing} cursor-pointer inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 sm:py-2.5 text-base sm:text-sm font-semibold transition ${
                      active
                        ? 'bg-[color:var(--brand-primary)] text-white shadow-sm'
                        : 'text-slate-800 hover:bg-slate-50 enabled:hover:-translate-y-[1px] enabled:hover:shadow-md active:translate-y-[1px]'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-white' : 'text-slate-500'}`} aria-hidden="true" />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {err ? (
          <div className="mb-3">
            <AlertBanner tone="danger" icon={Timer} title={err} />
          </div>
        ) : null}

        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-3 lg:grid-cols-[360px_1fr]">
          {/* Left Column - Verification (Wi‑Fi OR Location) */}
          <section className="space-y-4">
            <Card>
              <CardHeader className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-lg sm:text-base font-extrabold text-[color:var(--brand-primary)]">Verification</div>
                  <Badge
                    tone={
                      (verificationMethod === 'wifi' && wifiOk) ||
                      (verificationMethod === 'location' && verified) ||
                      (verificationMethod === null && (wifiOk || verified))
                        ? 'neutral'
                        : 'warn'
                    }
                  >
                    {(verificationMethod === 'wifi' && wifiOk) ||
                    (verificationMethod === 'location' && verified) ||
                    (verificationMethod === null && (wifiOk || verified))
                      ? 'Passed'
                      : 'Not verified'}
                  </Badge>
                </div>
                {/* Intentionally single-method UX (no toggle link). */}
              </CardHeader>
              <CardBody className="px-4 py-4 space-y-4">
                {/* Wi‑Fi allowlist status */}
                {verificationMethod !== 'location' ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-base sm:text-sm font-extrabold text-slate-900">DTX Wi‑Fi</div>
                    <Badge tone={wifiOk ? 'success' : 'warn'}>{wifiOk ? 'Connected' : 'Not connected'}</Badge>
                  </div>
                  {!wifiOk ? (
                    <div className="mt-1 text-sm sm:text-xs text-slate-500">
                      Join <span className="font-semibold text-slate-700">JW- Guest WiFi</span> or{' '}
                      <span className="font-semibold text-slate-700">JillamyWHSE-WiFi</span>.
                    </div>
                  ) : null}
                  <div className="mt-3">
                    <SecondaryButton
                      type="button"
                      className="h-11 w-full justify-center text-base sm:text-sm"
                      onClick={() => {
                        if (verificationMethod === null) setMethod('wifi')
                        void refreshState()
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      Recheck
                    </SecondaryButton>
                  </div>
                  {verificationMethod === 'wifi' ? (
                    <div className="mt-2 text-center">
                      <button
                        type="button"
                        className={`${ui.focusRing} text-sm sm:text-xs font-semibold text-[color:var(--brand-primary)] underline underline-offset-4`}
                        onClick={() => setMethod('location')}
                      >
                        Use Location instead
                      </button>
                    </div>
                  ) : null}
                  </div>
                ) : null}

                {/* Location check */}
                {verificationMethod !== 'wifi' ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-base sm:text-sm font-extrabold text-slate-900">Location</div>
                    <Badge tone={verified ? 'success' : 'warn'}>{verified ? 'Verified' : 'Not verified'}</Badge>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-base sm:text-sm text-slate-600">
                    <MapPin className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="text-base sm:text-sm font-semibold text-slate-900">{STAFFING_SITE.address}</div>
                    </div>
                  </div>

                  {geo.state === 'blocked' ? (
                    <div className="mt-3">
                      <AlertBanner tone="warn" icon={MapPin} title={geo.message} />
                    </div>
                  ) : null}
                  {geo.state === 'ok' && !geo.inRange ? (
                    <div className="mt-3">
                      <AlertBanner
                        tone="warn"
                        title={
                          <>
                            <span className="font-semibold">{`Out of range (${metersToMiles(geo.distanceMeters).toFixed(2)} mi from DTX Warehouse). `}</span>
                            Clock in/out requires verified warehouse Wi‑Fi or a verified location check.
                          </>
                        }
                      />
                    </div>
                  ) : null}
                  {geo.state === 'ok' && !geo.accuracyOk ? (
                    <div className="mt-3">
                      <AlertBanner
                        tone="warn"
                        icon={MapPin}
                        title="Location accuracy too low"
                        description={`Try again outside or with a stronger GPS signal. (Accuracy: ~${Math.round(geo.accuracyMeters ?? 0)}m)`}
                      />
                    </div>
                  ) : null}

                  <div className="mt-3">
                    <SecondaryButton
                      type="button"
                      className="h-11 w-full justify-center text-base sm:text-sm"
                      onClick={() => {
                        if (verificationMethod === null) setMethod('location')
                        void refreshLocation()
                      }}
                      disabled={busyGeo}
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      {busyGeo ? 'Verifying…' : 'Verify location'}
                    </SecondaryButton>
                  </div>
                  {verificationMethod === 'location' ? (
                    <div className="mt-2 text-center">
                      <button
                        type="button"
                        className={`${ui.focusRing} text-sm sm:text-xs font-semibold text-[color:var(--brand-primary)] underline underline-offset-4`}
                        onClick={() => setMethod('wifi')}
                      >
                        Use Wi‑Fi instead
                      </button>
                    </div>
                  ) : null}
                </div>
                ) : null}
              </CardBody>
            </Card>
          </section>

          {/* Right Column - Shift Status */}
          <section>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className={ui.typography.sectionTitle}>Shift Status</div>
                  <Badge tone={clockState?.clockedIn ? 'info' : 'neutral'}>{clockState?.clockedIn ? "You're clocked in" : "You're clocked out"}</Badge>
                </div>
              </CardHeader>
              <CardBody>
                <div className="text-base sm:text-sm font-semibold text-slate-900">
                  {clockState?.lastActionLabel ?? (clockState?.clockedIn ? "You're clocked in" : "You're clocked out")}
                </div>
                <div className="mt-1 text-sm sm:text-xs text-slate-500">
                  {clockState?.lastSyncAt ? `Last update: ${new Date(clockState.lastSyncAt).toLocaleTimeString()}` : 'Offline/local mode'}
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {!clockState?.clockedIn ? (
                    <SuccessButton type="button" className="w-auto min-w-[200px] justify-center justify-self-center sm:col-span-2" disabled={!canAct} onClick={() => doEvent('CLOCK_IN')}>
                      Clock in
                    </SuccessButton>
                  ) : (
                    <DangerButton
                      type="button"
                      className="w-auto min-w-[200px] justify-center justify-self-center sm:col-span-2"
                      disabled={!canAct}
                      onClick={() => doEvent('CLOCK_OUT')}
                    >
                      Clock out
                    </DangerButton>
                  )}
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm sm:text-xs text-slate-600">
                  Connection: <span className="font-semibold text-slate-900">{online ? 'Online' : 'Offline'}</span> • Updated{' '}
                  <span className="font-semibold text-slate-900">{clockState?.lastSyncAt ? new Date(clockState.lastSyncAt).toLocaleTimeString() : '—'}</span>
                </div>

                {clockState?.signatureRequired ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-base sm:text-sm font-extrabold text-[color:var(--brand-primary)]">Signature Required</div>
                    <div className="mt-1 text-base sm:text-sm text-slate-600">Please sign to complete your shift.</div>
                    <div className="mt-3">
                      <SignaturePad ref={sigRef} />
                    </div>
                    <div className="mt-3 flex items-center justify-end">
                      <PrimaryButton type="button" disabled={busySig} onClick={() => void submitSignature()}>
                        {busySig ? 'Submitting…' : 'Submit signature'}
                      </PrimaryButton>
                    </div>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          </section>
        </div>
      </div>
    </div>
  )
}

