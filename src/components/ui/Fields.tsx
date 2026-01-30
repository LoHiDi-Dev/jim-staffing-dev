import { forwardRef } from 'react'
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { ui } from './tokens'

const isAriaInvalid = (v: unknown): boolean => v === true || v === 'true'

export const FieldLabel = ({ children }: { children: React.ReactNode }) => {
  return <div className={ui.typography.label}>{children}</div>
}

export const FieldHelp = ({ children }: { children: React.ReactNode }) => {
  return <div className={ui.typography.helper}>{children}</div>
}

export const FieldError = ({ children }: { children: React.ReactNode }) => {
  return <div className={ui.field.error}>{children}</div>
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className = '', ...props }, ref) => {
  const invalid = isAriaInvalid(props['aria-invalid'])
  const invalidClass = invalid ? ui.field.invalid : ''
  return <input ref={ref} className={`${ui.field.input} ${invalidClass} ${className}`} {...props} />
})
TextInput.displayName = 'TextInput'

export const Select = ({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) => {
  const invalid = isAriaInvalid(props['aria-invalid'])
  const invalidClass = invalid ? ui.field.invalid : ''
  return <select className={`${ui.field.select} ${invalidClass} ${className}`} {...props} />
}

export const Textarea = ({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => {
  const invalid = isAriaInvalid(props['aria-invalid'])
  const invalidClass = invalid ? ui.field.invalid : ''
  return <textarea className={`${ui.field.textarea} ${invalidClass} ${className}`} {...props} />
}

