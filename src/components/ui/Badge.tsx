import type { HTMLAttributes } from 'react'
import { ui } from './tokens'

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger'

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone
}

export const Badge = ({ tone = 'neutral', className = '', ...props }: Props) => {
  const toneClass = ui.badge[tone]
  return <span className={`${ui.badge.base} ${toneClass} ${className}`} {...props} />
}

