import { LogOut } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ServerUser } from '../../api/auth'
import { apiStaffingMe, type StaffingEmploymentType } from '../../api/staffing'
import { BrandMark } from '../../components/BrandMark'
import { Button } from '../../components/ui/Button'
import { ui } from '../../components/ui/tokens'
import { STAFFING_SITES } from '../sites'

export function StaffingShell({ user, onLogout }: { user: ServerUser | null; onLogout: () => void }) {
  const [employmentType, setEmploymentType] = useState<StaffingEmploymentType | null>(null)

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
    
    // Map siteId to canonical display label (code only)
    if (user.siteId) {
      const site = STAFFING_SITES.find((s) => s.siteId === user.siteId)
      if (site) {
        parts.push(site.code)
      }
    }
    
    // Add role
    if (user.role) {
      const roleMap: Record<string, string> = {
        ADMIN: 'Administrator',
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
            <div className="md:hidden">
              <BrandMark size="sm" title={<span className="text-[16px]">JIM</span>} subtitle={null} />
            </div>
            <div className="hidden md:block">
              <BrandMark
                size="md"
                title={
                  <>
                    JIM Staffing<sup className="text-xs">®</sup>
                  </>
                }
                subtitle="Workforce Attendance"
              />
            </div>
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4 md:col-start-3 md:justify-end">
          <div className="flex items-center gap-3">
            {/* Mobile: compact logout only */}
            <div className="md:hidden">
              <Button variant="outline" type="button" className="shrink-0 h-9 px-2.5 text-[13px] gap-1.5" onClick={onLogout}>
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Logout
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
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

