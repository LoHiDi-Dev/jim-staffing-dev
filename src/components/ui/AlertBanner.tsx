import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type AlertTone = 'danger' | 'warn' | 'info' | 'success'

const toneStyles: Record<AlertTone, { wrap: string; icon: string; title: string; body: string }> = {
  danger: {
    wrap: 'border-rose-200 bg-rose-50',
    icon: 'text-rose-600',
    title: 'text-rose-700',
    body: 'text-rose-700/90',
  },
  warn: {
    wrap: 'border-amber-200 bg-amber-50',
    icon: 'text-amber-600',
    title: 'text-amber-700',
    body: 'text-amber-700/90',
  },
  info: {
    wrap: 'border-sky-200 bg-sky-50',
    icon: 'text-sky-600',
    title: 'text-sky-700',
    body: 'text-sky-700/90',
  },
  success: {
    wrap: 'border-emerald-200 bg-emerald-50',
    icon: 'text-emerald-600',
    title: 'text-emerald-700',
    body: 'text-emerald-700/90',
  },
}

export const AlertBanner = ({
  tone,
  icon: Icon,
  title,
  description,
  right,
}: {
  tone: AlertTone
  icon: LucideIcon
  title: string
  description?: ReactNode
  right?: ReactNode
}) => {
  const s = toneStyles[tone]
  return (
    <div className={`flex items-start justify-between gap-4 rounded-2xl border px-5 py-4 ${s.wrap}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${s.icon}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <div className={`text-sm font-semibold ${s.title}`}>{title}</div>
          {description ? <div className={`mt-1 text-sm leading-6 ${s.body}`}>{description}</div> : null}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  )
}

