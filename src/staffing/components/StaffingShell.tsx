import { Menu, LogOut, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { ServerUser } from '../../api/auth'
import { apiStaffingMe, type StaffingEmploymentType } from '../../api/staffing'
import { Button } from '../../components/ui/Button'
import { ui } from '../../components/ui/tokens'
import { STAFFING_SITES } from '../sites'

export function StaffingShell({ user, onLogout }: { user: ServerUser | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const [employmentType, setEmploymentType] = useState<StaffingEmploymentType | null>(null)
  const loc = useLocation()

  const links = useMemo(
    () => [
      { label: 'Clock Station', to: '/clock-station' },
      { label: 'My Times', to: '/my-times' },
    ],
    [],
  )

  useEffect(() => {
    let mounted = true
    const fetchEmploymentType = async () => {
      try {
        const staffingMe = await apiStaffingMe()
        if (mounted && staffingMe.employmentType) {
          setEmploymentType(staffingMe.employmentType)
        }
      } catch {
        // Ignore error, employment type is optional
      }
    }
    void fetchEmploymentType()
    return () => {
      mounted = false
    }
  }, [])

  const roleLabel = useMemo(() => {
    if (!user) return ''
    const parts: string[] = []
    
    // Map siteId to display code (DTX instead of site_dtx)
    if (user.siteId) {
      const site = STAFFING_SITES.find((s) => s.siteId === user.siteId)
      if (site) {
        parts.push(site.code)
      }
    }
    
    // Add role
    if (user.role) {
      const roleMap: Record<string, string> = {
        ADMIN: 'Admin',
        MANAGER: 'Manager',
        OPERATOR: 'Operator',
        REGIONAL_MANAGER: 'Regional Manager',
      }
      parts.push(roleMap[user.role] || user.role)
    }
    
    // Add employment type if available
    if (employmentType) {
      parts.push(employmentType)
    }
    
    return parts.join(' • ')
  }, [user, employmentType])

  return (
    <header className="w-full min-h-[4.5rem] flex items-center border-b border-slate-200 bg-white px-4 py-3 sm:px-6 shrink-0">
      <div className="relative mx-auto flex w-full max-w-7xl items-center justify-between gap-3 sm:gap-4 md:grid md:grid-cols-[auto_1fr_auto] md:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-4 md:col-start-1 md:flex-none md:justify-start">
          <Link
            to="/clock-station"
            className={`group flex min-w-0 items-center gap-3 rounded-xl px-2 py-2 outline-none transition hover:bg-slate-50 hover:shadow-sm hover:ring-1 hover:ring-slate-200 active:translate-y-[1px] ${ui.focusRing}`}
            aria-label="Go home"
            title="Home"
          >
            <img src="/jim-favicon.svg" alt="JIM Staffing" className="h-12 w-12 shrink-0" />
            <div className="min-w-0">
              <div className="truncate font-extrabold leading-tight tracking-tight text-[color:var(--brand-primary)] text-base">
                JIM Staffing<sup className="text-xs">®</sup>
              </div>
              <div className="truncate leading-tight text-slate-500 text-sm">
                Contractor Clock In/Out
              </div>
            </div>
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4 md:col-start-3 md:justify-end">
          <div className="flex items-center gap-3">
            {/* Mobile: compact logout only */}
            <div className="md:hidden">
              <Button variant="outline" type="button" className="shrink-0 h-9 px-2.5 text-[13px] gap-1.5" onClick={onLogout}>
                Log Out
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            {/* Desktop: full user info + logout */}
            <div className="hidden md:block">
              <div className="flex items-center gap-4">
                <div className="min-w-0 text-right leading-tight">
                  <div className="truncate text-sm font-semibold text-slate-900">{user?.name ?? '—'}</div>
                  <div className="truncate text-xs text-slate-500">{roleLabel}</div>
                </div>

                <div className="h-9 w-px bg-slate-200" aria-hidden="true" />

                <Button variant="outline" type="button" className="shrink-0" onClick={onLogout}>
                  Log Out
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>

          <Button
            variant="ghost"
            type="button"
            className="px-3 md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </Button>
        </div>

        {open ? (
          <div className="absolute left-0 right-0 top-full z-50 mt-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
              <div className="border-b border-slate-200 pb-3">
                <nav className="flex flex-col" aria-label="Mobile">
                  {links.map((l) => {
                    const active = loc.pathname === l.to
                    return (
                      <Link
                        key={l.to}
                        to={l.to}
                        className={`rounded-xl px-3 py-3 text-sm font-semibold transition hover:bg-slate-50 hover:text-slate-900 ${ui.focusRing} ${
                          active ? 'text-slate-900' : 'text-slate-700'
                        }`}
                        onClick={() => setOpen(false)}
                      >
                        {l.label}
                      </Link>
                    )
                  })}
                </nav>
              </div>
              <div className="pt-3">
                <button
                  type="button"
                  className={`w-full rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 ${ui.focusRing}`}
                  onClick={() => {
                    setOpen(false)
                    onLogout()
                  }}
                >
                  Log Out
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  )
}

