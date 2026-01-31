import type { ButtonHTMLAttributes } from 'react'
import { ui } from './tokens'

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'outline' | 'danger' | 'ghost'
export type ButtonSize = 'md' | 'lg' | 'xl'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = ({ variant = 'outline', size = 'md', className = '', ...props }: Props) => {
  const variantClass = ui.button[variant]
  const sizeClass = ui.button.sizes[size]
  return <button className={`${ui.button.base} ${ui.focusRing} ${sizeClass} ${variantClass} ${className}`} {...props} />
}

export const PrimaryButton = (props: Omit<Props, 'variant'>) => <Button variant="primary" {...props} />
export const SecondaryButton = (props: Omit<Props, 'variant'>) => <Button variant="secondary" {...props} />
export const SuccessButton = (props: Omit<Props, 'variant'>) => <Button variant="success" {...props} />
export const DangerButton = (props: Omit<Props, 'variant'>) => <Button variant="danger" {...props} />
export const GhostButton = (props: Omit<Props, 'variant'>) => <Button variant="ghost" {...props} />

