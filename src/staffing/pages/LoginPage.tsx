import { Lock, User } from 'lucide-react'
import { useState } from 'react'
import { apiLogin, type ServerUser } from '../../api/auth'
import { AlertBanner } from '../../components/ui/AlertBanner'
import { PrimaryButton } from '../../components/ui/Button'
import { FieldLabel, TextInput } from '../../components/ui/Fields'
import { ui } from '../../components/ui/tokens'

export function LoginPage({ onAuthed }: { onAuthed: (u: ServerUser) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  return (
    <div className={ui.page.bg}>
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <img src="/jim-staffing-logo.svg" alt="JIM Staffing" className="h-10 w-10" />
          <div className="text-left">
            <div className="text-lg font-extrabold text-[color:var(--brand-primary)]">JIM Staffing</div>
            <div className="text-sm text-slate-600">Contractor Clock In/Out</div>
          </div>
        </div>

        <div className={ui.card.base}>
          <div className={ui.card.header}>
            <div className={ui.typography.sectionTitle}>Login</div>
            <div className="mt-1 text-sm text-slate-600">Use your JIM credentials.</div>
          </div>
          <div className={`${ui.card.body} space-y-4`}>
            {err ? <AlertBanner tone="danger" icon={Lock} title={err} /> : null}

            <div>
              <FieldLabel>Email</FieldLabel>
              <div className="mt-2 relative">
                <div className="pointer-events-none absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-slate-50 text-slate-500 ring-1 ring-slate-200">
                  <User className="h-4 w-4" aria-hidden="true" />
                </div>
                <TextInput value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@jillamy.com" className="pl-12" />
              </div>
            </div>

            <div>
              <FieldLabel>Password</FieldLabel>
              <div className="mt-2 relative">
                <div className="pointer-events-none absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-slate-50 text-slate-500 ring-1 ring-slate-200">
                  <Lock className="h-4 w-4" aria-hidden="true" />
                </div>
                <TextInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" className="pl-12" />
              </div>
            </div>

            <PrimaryButton
              type="button"
              className="w-full justify-center"
              disabled={busy || !email.trim() || !password}
              onClick={async () => {
                setErr(null)
                setBusy(true)
                try {
                  const u = await apiLogin({ email: email.trim(), password })
                  onAuthed(u)
                } catch (e) {
                  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : 'Login failed.'
                  setErr(msg)
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  )
}

