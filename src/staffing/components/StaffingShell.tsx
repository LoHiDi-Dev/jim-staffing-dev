import { Menu, LogOut } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { ServerUser } from '../../api/auth'
import { Button } from '../../components/ui/Button'
import { ui } from '../../components/ui/tokens'

export function StaffingShell({ user, onLogout }: { user: ServerUser | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const loc = useLocation()

  const links = useMemo(
    () => [
      { label: 'Clock Station', to: '/clock' },
      { label: 'My Times', to: '/my-times' },
    ],
    [],
  )

  return (
    <header className="w-full border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
        <Link to="/clock" className={`flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50 ${ui.focusRing}`}>
          <img src="/jim-staffing-logo.svg" alt="JIM Staffing" className="h-8 w-8" />
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold text-[color:var(--brand-primary)]">JIM Staffing</div>
            <div className="truncate text-xs text-slate-500">Contractor Clock In/Out</div>
          </div>
        </Link>

        <div className="hidden items-center gap-2 md:flex">
          {links.map((l) => {
            const active = loc.pathname === l.to
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`rounded-xl px-3 py-2 text-sm font-semibold ${ui.focusRing} ${
                  active ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {l.label}
              </Link>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden text-right leading-tight sm:block">
            <div className="truncate text-sm font-semibold text-slate-900">{user?.name ?? '—'}</div>
            <div className="truncate text-xs text-slate-500">{user?.email ?? ''}</div>
          </div>
          <Button variant="outline" type="button" className="hidden sm:inline-flex" onClick={onLogout}>
            Logout
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </Button>

          <Button
            variant="ghost"
            type="button"
            className="px-3 md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {open ? (
        <div className="mx-auto mt-2 w-full max-w-7xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
            <nav className="flex flex-col" aria-label="Mobile">
              {links.map((l) => {
                const active = loc.pathname === l.to
                return (
                  <Link
                    key={l.to}
                    to={l.to}
                    className={`rounded-xl px-3 py-3 text-sm font-semibold transition ${ui.focusRing} ${
                      active ? 'bg-slate-50 text-slate-900' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                    onClick={() => setOpen(false)}
                  >
                    {l.label}
                  </Link>
                )
              })}
              <button
                type="button"
                className={`mt-2 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 ${ui.focusRing}`}
                onClick={() => {
                  setOpen(false)
                  onLogout()
                }}
              >
                Logout
              </button>
            </nav>
          </div>
        </div>
      ) : null}
    </header>
  )
}

