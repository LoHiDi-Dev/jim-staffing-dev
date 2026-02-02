export const ui = {
  page: {
    bg: 'bg-slate-100/70 px-4 py-10 sm:px-6',
    container: 'mx-auto w-full max-w-7xl',
    containerNarrow: 'mx-auto w-full max-w-5xl',
  },
  card: {
    base: 'rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden',
    pad: 'p-6',
    header: 'border-b border-slate-200 px-6 py-4',
    body: 'px-6 py-5',
  },
  typography: {
    // Page title
    h1: 'text-3xl md:text-4xl font-semibold tracking-tight text-[color:var(--brand-primary)]',
    h1Compact: 'text-2xl md:text-3xl font-semibold tracking-tight text-[color:var(--brand-primary)]',

    // Section / card headers
    sectionTitle: 'text-xl sm:text-lg font-extrabold text-[color:var(--brand-primary)]',
    cardTitle: 'text-base md:text-lg font-semibold text-slate-900',

    // Body copy + meta
    body: 'text-base sm:text-sm md:text-[15px] leading-6 text-slate-600',
    meta: 'text-sm sm:text-xs md:text-sm leading-5 text-slate-500',

    // Form typography
    label: 'text-base sm:text-sm font-medium text-slate-700',
    helper: 'text-sm sm:text-xs md:text-sm leading-5 text-slate-500',
  },
  focusRing:
    'focus:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(23,42,130,0.22)] focus-visible:ring-offset-2 focus-visible:ring-offset-white',
  /** Standard hover/active effect for interactive elements (cards, buttons, tabs). Use on clickable cards and CTAs. */
  interactiveHover:
    'enabled:hover:-translate-y-[1px] enabled:hover:shadow-md active:translate-y-[1px] disabled:hover:translate-y-0 disabled:hover:shadow-sm',
  button: {
    base:
      'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-5 font-medium shadow-sm transition enabled:hover:-translate-y-[1px] enabled:hover:shadow-md active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60',
    sizes: {
      md: 'h-11 text-base sm:text-sm',
      lg: 'h-12 text-base sm:text-sm',
      xl: 'h-14 text-base sm:text-sm rounded-2xl',
    },
    primary: 'bg-[color:var(--brand-primary)] text-white hover:bg-[color:var(--brand-primary-strong)]',
    secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
    outline: 'border border-slate-200 bg-white text-slate-900 hover:bg-slate-50',
    danger: 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
    ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
  },
  field: {
    input:
      'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base sm:text-sm md:text-[15px] leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[color:var(--brand-primary)] focus:ring-1 focus:ring-[color:var(--brand-primary)] focus-visible:border-[color:var(--brand-primary)] focus-visible:ring-1 focus-visible:ring-[color:var(--brand-primary)] read-only:bg-slate-50 read-only:text-slate-700 disabled:bg-slate-50 disabled:text-slate-600',
    textarea:
      'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base sm:text-sm md:text-[15px] leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[color:var(--brand-primary)] focus:ring-1 focus:ring-[color:var(--brand-primary)] focus-visible:border-[color:var(--brand-primary)] focus-visible:ring-1 focus-visible:ring-[color:var(--brand-primary)] read-only:bg-slate-50 read-only:text-slate-700 disabled:bg-slate-50 disabled:text-slate-600',
    select:
      'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base sm:text-sm md:text-[15px] leading-6 text-slate-900 outline-none transition focus:border-[color:var(--brand-primary)] focus:ring-1 focus:ring-[color:var(--brand-primary)] focus-visible:border-[color:var(--brand-primary)] focus-visible:ring-1 focus-visible:ring-[color:var(--brand-primary)] disabled:bg-slate-50 disabled:text-slate-600',
    invalid:
      'border-rose-300 bg-rose-50/30 focus:border-rose-400 focus:ring-1 focus:ring-rose-400 focus-visible:border-rose-400 focus-visible:ring-1 focus-visible:ring-rose-400',
    error: 'rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700',
  },
  badge: {
    base: 'inline-flex items-center rounded-full px-3 py-1 text-sm sm:text-xs font-semibold',
    neutral: 'bg-slate-100 text-slate-700',
    info: 'bg-sky-50 text-sky-700',
    success: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-700',
    danger: 'bg-rose-50 text-rose-700',
  },
  kpi: {
    // Shared KPI design system (single source of truth)
    base: 'rounded-2xl border border-slate-200 px-6 py-5 text-center shadow-sm',
    value: 'text-3xl font-extrabold text-[color:var(--brand-primary)]',
    label: 'mt-1 truncate text-base sm:text-sm font-medium text-slate-900',
    subtext: 'mt-1 truncate text-sm sm:text-xs md:text-sm leading-5 text-slate-500',
    tone: {
      neutral: 'bg-slate-50',
      sky: 'bg-sky-50',
      emerald: 'bg-emerald-50',
      amber: 'bg-amber-50',
    },
  },
} as const

