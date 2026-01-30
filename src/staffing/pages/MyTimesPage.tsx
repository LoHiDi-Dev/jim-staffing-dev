import { CalendarDays, Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ServerUser } from '../../api/auth'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { ui } from '../../components/ui/tokens'

export function MyTimesPage({ user }: { user: ServerUser }) {
  const [tab, setTab] = useState<'this' | 'last'>('this')

  const firstName = useMemo(() => (user?.name ? user.name.split(' ')[0] : 'there'), [user?.name])

  return (
    <div className={ui.page.bg}>
      <div className={ui.page.container}>
        <div className="mb-6">
          <PageHeader
            align="left"
            density="compact"
            title="My Times"
            subtitle={`Weekly time records for ${firstName}`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className={ui.typography.sectionTitle}>Weekly Summary</div>
                <Button variant="outline" type="button">
                  Export CSV
                  <Download className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Total Hours', value: '—' },
                  { label: 'Days Worked', value: '—' },
                  { label: 'Avg Hours/Day', value: '—' },
                  { label: 'Status', value: '—' },
                ].map((k) => (
                  <div key={k.label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs font-semibold text-slate-600">{k.label}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{k.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${ui.focusRing} ${
                    tab === 'this' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                  onClick={() => setTab('this')}
                >
                  This Week
                </button>
                <button
                  type="button"
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${ui.focusRing} ${
                    tab === 'last' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                  onClick={() => setTab('last')}
                >
                  Last Week
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                  <CalendarDays className="h-6 w-6 text-slate-500" aria-hidden="true" />
                </div>
                <div className="mt-4 text-sm font-semibold text-slate-900">No time records loaded yet</div>
                <div className="mt-1 text-sm text-slate-600">Once the staffing API is wired, records will appear here.</div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

