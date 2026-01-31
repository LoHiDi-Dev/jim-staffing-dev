import type { InputHTMLAttributes } from 'react'
import { ui } from './tokens'

export const Checkbox = ({ className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) => {
  return (
    <input
      type="checkbox"
      className={`h-5 w-5 rounded border border-slate-300 bg-white text-[color:var(--brand-primary)] shadow-sm disabled:cursor-not-allowed disabled:opacity-60 ${ui.focusRing} ${className}`}
      {...props}
    />
  )
}
