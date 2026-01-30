import { ui } from './tokens'
import type { ReactNode } from 'react'

export const EmptyState = ({
  icon,
  title,
  description,
  cta,
}: {
  icon?: ReactNode
  title: string
  description?: string
  cta?: ReactNode
}) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      {icon ? <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">{icon}</div> : null}
      <div className={ui.typography.cardTitle}>{title}</div>
      {description ? <div className={`mt-2 ${ui.typography.body}`}>{description}</div> : null}
      {cta ? <div className="mt-6 flex justify-center">{cta}</div> : null}
    </div>
  )
}

