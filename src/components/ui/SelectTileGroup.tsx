import { ui } from './tokens'

type SelectTileOption = {
  value: string
  label: string
  sublabel?: string
  disabled?: boolean
}

export function SelectTileGroup(props: {
  options: SelectTileOption[]
  value: string | null
  onChange: (value: string) => void
  disabled?: boolean
  columns?: 1 | 2
  ariaLabel: string
}) {
  const { options, value, onChange, disabled = false, columns = 2, ariaLabel } = props

  const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

  const gridCols = columns === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cx('grid gap-3', gridCols)}>
      {options.map((opt) => {
        const isSelected = value === opt.value
        const isDisabled = disabled || Boolean(opt.disabled)

        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            tabIndex={isDisabled ? -1 : 0}
            className={cx(
              'relative w-full rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition',
              ui.focusRing,
              isDisabled
                ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 shadow-none opacity-60'
                : 'cursor-pointer border-slate-200 text-slate-900 hover:border-slate-300 hover:bg-slate-50',
              isSelected && !isDisabled ? 'border-2 border-[color:var(--brand-primary)] bg-white' : '',
            )}
            onClick={() => {
              if (isDisabled) return
              onChange(opt.value)
            }}
          >
            <span
              aria-hidden="true"
              className={cx(
                'absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full border',
                isSelected && !isDisabled ? 'border-[color:var(--brand-primary)]' : 'border-slate-300',
              )}
            >
              {isSelected && !isDisabled ? <span className="h-2 w-2 rounded-full bg-[color:var(--brand-primary)]" /> : null}
            </span>

            <div className="pr-8">
              <div className={cx('text-sm font-semibold', isDisabled ? 'text-slate-400' : 'text-slate-900')}>{opt.label}</div>
              {opt.sublabel ? <div className={cx('mt-0.5 text-xs', isDisabled ? 'text-slate-400' : 'text-slate-500')}>{opt.sublabel}</div> : null}
            </div>
          </button>
        )
      })}
    </div>
  )
}
