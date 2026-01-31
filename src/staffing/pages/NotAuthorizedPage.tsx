import { ShieldAlert } from 'lucide-react'
import type { ServerUser } from '../../api/auth'
import { AlertBanner } from '../../components/ui/AlertBanner'
import { Button } from '../../components/ui/Button'
import { ui } from '../../components/ui/tokens'

export function NotAuthorizedPage({ user, onLogout }: { user: ServerUser | null; onLogout?: () => void }) {
  return (
    <div className={ui.page.bg}>
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-4 flex items-center gap-3">
          <img src="/jim-favicon.svg" alt="JIM Staffing" className="h-9 w-9" />
          <div>
            <div className="text-lg font-extrabold text-[color:var(--brand-primary)]">JIM Staffing</div>
            <div className="text-sm text-slate-600">Contractor Clock In/Out</div>
          </div>
        </div>

        <AlertBanner
          tone="danger"
          icon={ShieldAlert}
          title="Not authorized for JIM Staffing"
          description={
            <div>
              <div>This portal is restricted to contractors (LTC/STC).</div>
              {user?.email ? <div className="mt-1">Signed in as: <span className="font-semibold">{user.email}</span></div> : null}
            </div>
          }
        />

        {onLogout ? (
          <div className="mt-4">
            <Button variant="outline" type="button" className="w-full justify-center sm:w-auto" onClick={onLogout}>
              Logout
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

