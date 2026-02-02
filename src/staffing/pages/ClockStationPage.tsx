import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPin, RefreshCw, Timer, Clock, FileText } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ServerUser } from '../../api/auth'
import { AlertBanner } from '../../components/ui/AlertBanner'
import { Badge } from '../../components/ui/Badge'
import { DangerButton, SecondaryButton, SuccessButton } from '../../components/ui/Button'
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
  const [clockState, setClockState] = useState<StaffingClockState | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [online, setOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  const loc = useLocation()
  const nav = useNavigate()
  const sigRef = useRef<SignaturePadHandle | null>(null)
  const [busySig, setBusySig] = useState(false)
  const [verificationMode, setVerificationMode] = useState<'auto' | 'wifi' | 'location'>(() => {
    try {
      const v = localStorage.getItem('jim.staffing.verificationMode')
      return v === 'wifi' || v === 'location' || v === 'auto' ? v : 'auto'
    } catch {
      return 'auto'
    }
  })

  const firstName = useMemo(() => (user?.name ? user.name.split(' ')[0] : 'there'), [user?.name])

  const refreshState = async () => {
    try {
      const s = await apiStaffingState()
      setClockState(s)
    } catch {
      setClockState({ clockedIn: false, onLunch: false, lastActionLabel: undefined, lastSyncAt: undefined })
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
    void refreshState()
    void refreshLocation()
  }, [])

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

  // Verification is OR-based: Wi‑Fi allowlist OR verified location.
  // Do not block actions while location is refreshing if Wi‑Fi is already verified.
  const canAct =
    online && (verificationMode === 'wifi' ? wifiOk : verificationMode === 'location' ? verified : wifiOk || verified)

  const setMode = (m: 'auto' | 'wifi' | 'location') => {
    setVerificationMode(m)
    try {
      localStorage.setItem('jim.staffing.verificationMode', m)
    } catch {
      // ignore
    }
  }

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
    <div className={ui.page.bg}>
      <div className={ui.page.container}>
        <div className="mb-4 text-center sm:mb-6">
          <div className="text-3xl font-semibold tracking-tight text-[color:var(--brand-primary)] md:text-4xl">
            <span aria-hidden="true" className="mr-2 inline-block jim-wave-once">
              👋
            </span>
            Welcome back, {firstName}!
          </div>
          <div className="mt-2 text-sm sm:text-xs md:text-sm leading-5 text-slate-500">
            {STAFFING_COPY.headerSubtitle}
          </div>
        </div>

        {/* Tabs */}
        <div className="mx-auto mb-4 w-full max-w-7xl sm:mb-6" role="tablist" aria-label="Clock station sections">
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
          <div className="mb-4">
            <AlertBanner tone="danger" icon={Timer} title={err} />
          </div>
        ) : null}

        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
          {/* Left Column - Verification (Wi‑Fi OR Location) */}
          <section className="space-y-4">
            <Card>
              <CardHeader className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-lg sm:text-base font-extrabold text-[color:var(--brand-primary)]">Verification</div>
                  <Badge
                    tone={
                      (verificationMode === 'wifi' && wifiOk) ||
                      (verificationMode === 'location' && verified) ||
                      (verificationMode === 'auto' && (wifiOk || verified))
                        ? 'success'
                        : 'warn'
                    }
                  >
                    {(verificationMode === 'wifi' && wifiOk) ||
                    (verificationMode === 'location' && verified) ||
                    (verificationMode === 'auto' && (wifiOk || verified))
                      ? 'Ready'
                      : 'Not verified'}
                  </Badge>
                </div>
                {verificationMode !== 'auto' ? (
                  <div className="mt-1 text-right">
                    <button
                      type="button"
                      className={`${ui.focusRing} text-sm sm:text-xs font-semibold text-[color:var(--brand-primary)] underline underline-offset-4`}
                      onClick={() => setMode('auto')}
                    >
                      Show both
                    </button>
                  </div>
                ) : null}
              </CardHeader>
              <CardBody className="px-4 py-4 space-y-4">
                {/* Wi‑Fi allowlist status */}
                {verificationMode !== 'location' ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-base sm:text-sm font-extrabold text-slate-900">DTX Wi‑Fi</div>
                    <Badge tone={wifiOk ? 'success' : 'warn'}>{wifiOk ? 'Connected' : 'Not connected'}</Badge>
                  </div>
                  <div className="mt-1 text-sm sm:text-xs text-slate-500">
                    Join <span className="font-semibold text-slate-700">JW- Guest WiFi</span> or{' '}
                    <span className="font-semibold text-slate-700">JillamyWHSE-WiFi</span>.
                  </div>
                  <div className="mt-3">
                    <SecondaryButton
                      type="button"
                      className="h-11 w-full justify-center text-base sm:text-sm"
                      onClick={() => {
                        if (verificationMode === 'auto') setMode('wifi')
                        void refreshState()
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      Recheck
                    </SecondaryButton>
                  </div>
                  {verificationMode === 'wifi' ? (
                    <div className="mt-2 text-center">
                      <button
                        type="button"
                        className={`${ui.focusRing} text-sm sm:text-xs font-semibold text-[color:var(--brand-primary)] underline underline-offset-4`}
                        onClick={() => setMode('location')}
                      >
                        Use Location instead
                      </button>
                    </div>
                  ) : null}
                  </div>
                ) : null}

                {/* Location check */}
                {verificationMode !== 'wifi' ? (
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
                        if (verificationMode === 'auto') setMode('location')
                        void refreshLocation()
                      }}
                      disabled={busyGeo}
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      {busyGeo ? 'Verifying…' : 'Verify location'}
                    </SecondaryButton>
                  </div>
                  {verificationMode === 'location' ? (
                    <div className="mt-2 text-center">
                      <button
                        type="button"
                        className={`${ui.focusRing} text-sm sm:text-xs font-semibold text-[color:var(--brand-primary)] underline underline-offset-4`}
                        onClick={() => setMode('wifi')}
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

                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm sm:text-xs text-slate-600">
                  Connection: <span className="font-semibold text-slate-900">{online ? 'Online' : 'Offline'}</span> • Updated{' '}
                  <span className="font-semibold text-slate-900">{clockState?.lastSyncAt ? new Date(clockState.lastSyncAt).toLocaleTimeString() : '—'}</span>
                </div>

                {clockState?.signatureRequired ? (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-base sm:text-sm font-extrabold text-[color:var(--brand-primary)]">Signature Required</div>
                    <div className="mt-1 text-base sm:text-sm text-slate-600">Please sign to complete your shift.</div>
                    <div className="mt-3">
                      <SignaturePad ref={sigRef} />
                    </div>
                    <div className="mt-3 flex items-center justify-end">
                      <SuccessButton type="button" disabled={busySig} onClick={() => void submitSignature()}>
                        {busySig ? 'Submitting…' : 'Submit signature'}
                      </SuccessButton>
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

