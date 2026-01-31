import type { InputHTMLAttributes } from 'react'

const focusRing =
  'outline-none transition focus:ring-4 focus:ring-[rgba(23,42,130,0.22)] focus:ring-offset-2 focus:ring-offset-white focus-visible:ring-4 focus-visible:ring-[rgba(23,42,130,0.22)] focus-visible:ring-offset-2 focus-visible:ring-offset-white'

export const Checkbox = ({ className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) => {
  return (
    <input
      type="checkbox"
      className={`h-5 w-5 rounded border border-slate-300 bg-white text-[color:var(--brand-primary)] shadow-sm disabled:cursor-not-allowed disabled:opacity-60 ${focusRing} ${className}`}
      {...props}
    />
  )
}

export const Radio = ({ className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) => {
  return (
    <input
      type="radio"
      className={`h-5 w-5 rounded-full border border-slate-300 bg-white text-[color:var(--brand-primary)] shadow-sm disabled:cursor-not-allowed disabled:opacity-60 ${focusRing} ${className}`}
      {...props}
    />
  )
}
