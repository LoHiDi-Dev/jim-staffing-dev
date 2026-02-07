import { useNavigate } from 'react-router-dom'
import { BrandMark } from '../../../components/BrandMark'
import { PrimaryButton } from '../../../components/ui/Button'

export function MarketingLandingPage() {
  const nav = useNavigate()
  return (
    <div className="min-h-screen bg-[#f4f6fb] px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="flex w-full flex-col items-center">
            <BrandMark size="lg" subtitle="Workforce Attendance" wrapTitle wrapSubtitle className="w-full flex-col" />
          </div>
          <div className="mt-6 text-sm text-slate-600">Sign in to access your Clock Station and Timecard.</div>
          <div className="mt-6 flex justify-center">
            <PrimaryButton type="button" onClick={() => nav('/login/setup', { replace: true })}>
              Log in
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  )
}

