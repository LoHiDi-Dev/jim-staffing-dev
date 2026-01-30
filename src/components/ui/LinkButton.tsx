import type { ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { ui } from './tokens'
import type { ButtonSize, ButtonVariant } from './Button'

type Props = Omit<LinkProps, 'children'> & {
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

export const LinkButton = ({ variant = 'outline', size = 'md', className = '', ...props }: Props) => {
  const variantClass = ui.button[variant]
  const sizeClass = ui.button.sizes[size]
  return <Link className={`${ui.button.base} ${ui.focusRing} ${sizeClass} ${variantClass} ${className}`} {...props} />
}

