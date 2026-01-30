import { ShieldAlert } from 'lucide-react'
import type { ServerUser } from '../../api/auth'
import { AlertBanner } from '../../components/ui/AlertBanner'
import { ui } from '../../components/ui/tokens'

export function NotAuthorizedPage({ user }: { user: ServerUser | null }) {
  return (
    <div className={ui.page.bg}>
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-4 flex items-center gap-3">
          <img src="/jim-staffing-logo.svg" alt="JIM Staffing" className="h-9 w-9" />
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
      </div>
    </div>
  )
}

