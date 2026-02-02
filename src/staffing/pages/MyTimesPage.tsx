import { CalendarDays, Download, Loader2, Clock, FileText } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ServerUser } from '../../api/auth'
import { apiMyTimes, apiMyTimesExportPdf, type StaffingEventType } from '../../api/staffing'
import { AlertBanner } from '../../components/ui/AlertBanner'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { ui } from '../../components/ui/tokens'
import { computeWeeklyTimes } from '../lib/time'
import { STAFFING_COPY } from '../copy'

export function MyTimesPage({ user }: { user: ServerUser }) {
  const [tab, setTab] = useState<'this' | 'last'>('this')
  const [busy, setBusy] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [events, setEvents] = useState<Array<{ type: StaffingEventType; timestamp: string }> | null>(null)
  const loc = useLocation()
  const nav = useNavigate()

  const firstName = useMemo(() => (user?.name ? user.name.split(' ')[0] : 'there'), [user?.name])

  useEffect(() => {
    let mounted = true
    const run = async () => {
      setErr(null)
      setBusy(true)
      try {
        const res = await apiMyTimes({ week: tab })
        if (!mounted) return
        setEvents(res.events)
      } catch (e) {
        const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : 'Failed to load time records.'
        if (!mounted) return
        setEvents(null)
        setErr(msg)
      } finally {
        if (mounted) setBusy(false)
      }
    }
    void run()
    return () => {
      mounted = false
    }
  }, [tab])

  const computed = useMemo(() => {
    if (!events) return null
    return computeWeeklyTimes(events.map((e) => ({ type: e.type, timestamp: e.timestamp })))
  }, [events])
  const days = computed?.days ?? []
  const summary = computed?.summary ?? { totalHours: 0, daysWorked: 0, avgHoursPerDay: 0, status: 'OK' as const }

  const downloadPdf = async () => {
    setErr(null)
    setDownloadingPdf(true)
    try {
      const blob = await apiMyTimesExportPdf({ week: tab })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `JIM_Staffing_Timecard_${user.id}_${tab}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : 'Download failed.'
      setErr(msg)
    } finally {
      setDownloadingPdf(false)
    }
  }

  return (
    <div className={ui.page.bg}>
      <div className={ui.page.container}>
        <div className="mb-6 text-center">
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
        <div className="mx-auto mb-6 w-full max-w-7xl" role="tablist" aria-label="My times sections">
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
            <AlertBanner tone="danger" icon={CalendarDays} title={err} />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className={ui.typography.sectionTitle}>Weekly Summary</div>
                <Badge tone={summary.status === 'OK' ? 'success' : 'warn'}>{summary.status === 'OK' ? 'OK' : 'Incomplete'}</Badge>
              </div>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Total Hours', value: events ? summary.totalHours.toFixed(2) : '—' },
                  { label: 'Days Worked', value: events ? String(summary.daysWorked) : '—' },
                  { label: 'Avg Hours/Day', value: events ? summary.avgHoursPerDay.toFixed(2) : '—' },
                  { label: 'Status', value: events ? (summary.status === 'OK' ? 'OK' : 'Needs review') : '—' },
                ].map((k) => (
                  <div key={k.label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-sm sm:text-xs font-semibold text-slate-600">{k.label}</div>
                    <div className="mt-1 text-base sm:text-sm font-semibold text-slate-900">{k.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`rounded-xl px-4 py-2.5 sm:py-2 text-base sm:text-sm font-semibold ${ui.focusRing} ${
                    tab === 'this' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                  onClick={() => setTab('this')}
                >
                  This Week
                </button>
                <button
                  type="button"
                  className={`rounded-xl px-4 py-2.5 sm:py-2 text-base sm:text-sm font-semibold ${ui.focusRing} ${
                    tab === 'last' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                  onClick={() => setTab('last')}
                >
                  Last Week
                </button>
              </div>

              {busy ? (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-500" aria-hidden="true" />
                  </div>
                  <div className="mt-4 text-base sm:text-sm font-semibold text-slate-900">Loading time records…</div>
                  <div className="mt-1 text-base sm:text-sm text-slate-600">Syncing your punches.</div>
                </div>
              ) : !events || days.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                    <CalendarDays className="h-6 w-6 text-slate-500" aria-hidden="true" />
                  </div>
                  <div className="mt-4 text-base sm:text-sm font-semibold text-slate-900">No time records found</div>
                  <div className="mt-1 text-base sm:text-sm text-slate-600">Clock in from the Clock Station to create your first record.</div>
                </div>
              ) : (
                <div className="mt-5">
                  {/* Mobile: cards */}
                  <div className="grid grid-cols-1 gap-3 md:hidden">
                    {days.map((d) => {
                      const tone = d.status === 'COMPLETE' ? 'success' : d.status === 'NO_CLOCK_OUT' ? 'warn' : 'neutral'
                      const inLabel = d.firstInAt ? new Date(d.firstInAt).toLocaleTimeString() : '—'
                      const outLabel = d.lastOutAt ? new Date(d.lastOutAt).toLocaleTimeString() : '—'
                      return (
                        <div key={d.dayKey} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-base sm:text-sm font-extrabold text-[color:var(--brand-primary)]">{d.dayLabel}</div>
                            <Badge tone={tone}>{d.status === 'COMPLETE' ? 'Complete' : d.status === 'NO_CLOCK_OUT' ? 'Missing clock out' : '—'}</Badge>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-3 text-base sm:text-sm">
                            <div>
                              <div className="text-sm sm:text-xs font-semibold text-slate-500">Clock In</div>
                              <div className="mt-1 font-semibold text-slate-900">{inLabel}</div>
                            </div>
                            <div>
                              <div className="text-sm sm:text-xs font-semibold text-slate-500">Clock Out</div>
                              <div className="mt-1 font-semibold text-slate-900">{outLabel}</div>
                            </div>
                            <div>
                              <div className="text-sm sm:text-xs font-semibold text-slate-500">Hours</div>
                              <div className="mt-1 font-semibold text-slate-900">{d.workedHours.toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="text-sm sm:text-xs font-semibold text-slate-500">Lunch</div>
                              <div className="mt-1 font-semibold text-slate-900">{d.lunchMinutes ? `${d.lunchMinutes}m` : '—'}</div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Desktop: table */}
                  <div className="hidden md:block">
                    <div className="overflow-auto rounded-2xl border border-slate-200">
                      <table className="w-full min-w-[720px] border-collapse bg-white text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Day</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Clock In</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Clock Out</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Hours</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Lunch</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {days.map((d) => {
                            const tone = d.status === 'COMPLETE' ? 'success' : d.status === 'NO_CLOCK_OUT' ? 'warn' : 'neutral'
                            const inLabel = d.firstInAt ? new Date(d.firstInAt).toLocaleTimeString() : '—'
                            const outLabel = d.lastOutAt ? new Date(d.lastOutAt).toLocaleTimeString() : '—'
                            return (
                              <tr key={d.dayKey} className="border-t border-slate-200">
                                <td className="px-4 py-3 font-semibold text-slate-900">{d.dayLabel}</td>
                                <td className="px-4 py-3 text-slate-700">{inLabel}</td>
                                <td className="px-4 py-3 text-slate-700">{outLabel}</td>
                                <td className="px-4 py-3 font-semibold text-slate-900">{d.workedHours.toFixed(2)}</td>
                                <td className="px-4 py-3 text-slate-700">{d.lunchMinutes ? `${d.lunchMinutes}m` : '—'}</td>
                                <td className="px-4 py-3">
                                  <Badge tone={tone}>{d.status === 'COMPLETE' ? 'Complete' : d.status === 'NO_CLOCK_OUT' ? 'Missing clock out' : '—'}</Badge>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-end">
                <Button
                  variant="primary"
                  size="lg"
                  type="button"
                  onClick={() => void downloadPdf()}
                  disabled={downloadingPdf || busy || !events}
                  className="w-full justify-center md:w-auto md:min-w-[220px]"
                >
                  {downloadingPdf ? 'Downloading…' : 'Download PDF'}
                  {downloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

