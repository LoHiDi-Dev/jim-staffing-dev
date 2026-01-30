import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ui } from './tokens'

export const PageHeader = ({
  icon: Icon,
  iconBgClassName = 'bg-slate-100',
  iconClassName = 'text-[color:var(--brand-primary)]',
  title,
  subtitle,
  badge,
  actions,
  align = 'center',
  density = 'default',
}: {
  icon?: LucideIcon
  iconBgClassName?: string
  iconClassName?: string
  title: string
  subtitle?: string
  badge?: ReactNode
  actions?: ReactNode
  align?: 'center' | 'left'
  density?: 'default' | 'compact'
}) => {
  const isLeft = align === 'left'
  const isCompact = density === 'compact'
  const titleClass = isCompact ? ui.typography.h1Compact : ui.typography.h1
  const subtitleClass = isCompact ? ui.typography.meta : ui.typography.body
  const iconWrapSize = isCompact ? 'h-12 w-12' : 'h-14 w-14'
  const iconSize = isCompact ? 'h-6 w-6' : 'h-7 w-7'
  const stackTop = isCompact ? 'mt-3' : 'mt-4'
  const actionsTop = isCompact ? 'mt-4' : 'mt-6'
  return (
    <div className={isLeft ? 'text-left' : 'text-center'}>
      {Icon ? (
        <div
          className={`${isLeft ? '' : 'mx-auto'} flex ${iconWrapSize} items-center justify-center rounded-2xl ${iconBgClassName} shadow-sm`}
        >
          <Icon className={`${iconSize} ${iconClassName}`} aria-hidden="true" />
        </div>
      ) : null}
      <div className={`${stackTop} flex flex-col ${isLeft ? 'items-start' : 'items-center'} gap-2`}>
        <div className={titleClass}>{title}</div>
        {subtitle ? <div className={subtitleClass}>{subtitle}</div> : null}
        {badge ? <div className="mt-1">{badge}</div> : null}
        {actions ? (
          <div className={`${actionsTop} flex flex-wrap ${isLeft ? 'justify-start' : 'justify-center'} gap-3`}>{actions}</div>
        ) : null}
      </div>
    </div>
  )
}

