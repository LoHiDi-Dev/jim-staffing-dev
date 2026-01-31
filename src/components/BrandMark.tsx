import type { ReactNode } from 'react'

// Clone of JIM BrandMark with Staffing branding (logo + title).
export const BrandMark = ({
  size = 'md',
  title,
  subtitle = 'Contractor Clock In/Out',
  wrapTitle = false,
  wrapSubtitle = false,
  rightSlot,
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg'
  title?: ReactNode
  subtitle?: string | null
  wrapTitle?: boolean
  wrapSubtitle?: boolean
  rightSlot?: ReactNode
  className?: string
}) => {
  const iconSize = size === 'sm' ? 'h-10 w-10' : size === 'lg' ? 'h-14 w-14 sm:h-16 sm:w-16' : 'h-12 w-12'
  const titleSize = size === 'sm' ? 'text-[15px]' : size === 'lg' ? 'text-xl sm:text-2xl' : 'text-base'
  const subtitleSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-sm' : 'text-sm'

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img src="/jim-staffing-logo.svg" alt="JIM Staffing" className={iconSize} />
      <div className="min-w-0">
        <div
          className={`${wrapTitle ? 'whitespace-normal break-words text-center' : 'truncate'} font-extrabold leading-tight tracking-tight text-[color:var(--brand-primary)] ${titleSize}`}
        >
          {title ?? <>JIM Staffing</>}
        </div>
        {subtitle ? (
          <div
            className={`${wrapSubtitle ? 'whitespace-normal break-words text-center' : 'truncate'} leading-tight text-slate-500 ${subtitleSize}`}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
      {rightSlot ? <div className="ml-2">{rightSlot}</div> : null}
    </div>
  )
}
