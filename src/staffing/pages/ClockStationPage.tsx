import { useEffect, useMemo, useState } from 'react'
import { MapPin, RefreshCw, Timer } from 'lucide-react'
import type { ServerUser } from '../../api/auth'
import { AlertBanner } from '../../components/ui/AlertBanner'
import { Badge } from '../../components/ui/Badge'
import { Button, DangerButton, PrimaryButton, SecondaryButton } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { ui } from '../../components/ui/tokens'
import { apiStaffingEvent, apiStaffingState } from '../../api/staffing'
import { haversineMeters, metersToMiles, STAFFING_SITE } from '../lib/geo'

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
  const [clockState, setClockState] = useState<{ clockedIn: boolean; onLunch: boolean; lastActionLabel?: string; lastSyncAt?: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [online, setOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))

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
  const distanceLabel = geo.state === 'ok' ? `${metersToMiles(geo.distanceMeters).toFixed(2)} mi from site` : '—'

  const canAct = geo.state === 'ok' && geo.inRange && geo.accuracyOk && !busyGeo

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

  return (
    <div className={ui.page.bg}>
      <div className={ui.page.container}>
        <div className="mb-6">
          <PageHeader
            align="left"
            density="compact"
            title={`Welcome back, ${firstName}`}
            subtitle="Ready to clock in at JIM DTX Warehouse"
          />
        </div>

        {err ? (
          <div className="mb-4">
            <AlertBanner tone="danger" icon={Timer} title={err} />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className={ui.typography.sectionTitle}>Location Status</div>
                <Badge tone={verified ? 'success' : 'warn'}>{verified ? 'Location verified' : 'Not verified'}</Badge>
              </div>
            </CardHeader>
            <CardBody>
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <MapPin className="h-5 w-5 text-slate-400" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{STAFFING_SITE.address}</div>
                  <div className="mt-1 text-xs text-slate-500">{distanceLabel}</div>
                </div>
              </div>

              {geo.state === 'blocked' ? (
                <div className="mt-4">
                  <AlertBanner tone="warn" icon={MapPin} title={geo.message} />
                </div>
              ) : null}
              {geo.state === 'ok' && !geo.inRange ? (
                <div className="mt-4">
                  <AlertBanner
                    tone="warn"
                    icon={MapPin}
                    title={`Out of range (${metersToMiles(geo.distanceMeters).toFixed(2)} mi from site)`}
                    description="Clock actions are available only within 1 mile of the DTX site."
                  />
                </div>
              ) : null}
              {geo.state === 'ok' && !geo.accuracyOk ? (
                <div className="mt-4">
                  <AlertBanner
                    tone="warn"
                    icon={MapPin}
                    title="Location accuracy too low"
                    description={`Try again outside or with a stronger GPS signal. (Accuracy: ~${Math.round(geo.accuracyMeters ?? 0)}m)`}
                  />
                </div>
              ) : null}

              <div className="mt-5">
                <PrimaryButton type="button" className="w-full justify-center" onClick={refreshLocation} disabled={busyGeo}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  {busyGeo ? 'Refreshing…' : 'Refresh Location'}
                </PrimaryButton>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className={ui.typography.sectionTitle}>Status</div>
                <Badge tone={clockState?.clockedIn ? 'info' : 'neutral'}>{clockState?.clockedIn ? 'Clocked In' : 'Clocked Out'}</Badge>
              </div>
            </CardHeader>
            <CardBody>
              <div className="text-sm font-semibold text-slate-900">
                {clockState?.lastActionLabel ?? (clockState?.clockedIn ? 'Clocked in' : 'Clocked out')}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {clockState?.lastSyncAt ? `Last sync: ${new Date(clockState.lastSyncAt).toLocaleTimeString()}` : 'Offline/local mode'}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {!clockState?.clockedIn ? (
                  <PrimaryButton type="button" className="w-full justify-center sm:col-span-2" disabled={!canAct} onClick={() => doEvent('CLOCK_IN')}>
                    Clock In
                  </PrimaryButton>
                ) : (
                  <>
                    <SecondaryButton type="button" className="w-full justify-center" disabled={!canAct || clockState.onLunch} onClick={() => doEvent('LUNCH_START')}>
                      Start Lunch (30 min)
                    </SecondaryButton>
                    <DangerButton type="button" className="w-full justify-center" disabled={!canAct} onClick={() => doEvent('CLOCK_OUT')}>
                      Clock Out
                    </DangerButton>
                  </>
                )}
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                Connectivity: <span className="font-semibold text-slate-900">{online ? 'Online' : 'Offline'}</span> • Last sync:{' '}
                <span className="font-semibold text-slate-900">{clockState?.lastSyncAt ? new Date(clockState.lastSyncAt).toLocaleTimeString() : '—'}</span>
              </div>

              {!verified ? (
                <div className="mt-4">
                  <Button variant="outline" type="button" className="w-full justify-center" onClick={refreshLocation}>
                    Refresh Location
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

