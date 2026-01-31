import { ui } from './ui/tokens'

export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200" role="contentinfo">
      <div className="mx-auto w-full max-w-7xl px-6 py-3 text-center">
        <div className="text-[10px] leading-5 text-slate-500 min-[375px]:text-[11px] sm:text-xs md:text-xs">
          <div className="whitespace-nowrap">
            <span className="md:hidden">Copyright© 2026 JIM. All rights reserved.</span>
            <span className="hidden md:inline">Copyright© 2026 Jillamy Inventory Management. All rights reserved.</span>
          </div>
          <div className="whitespace-nowrap">
            <span className="md:hidden">
              Designed with ❤️ in Dallas, Texas 🇺🇸 by{' '}
              <a
                href="https://www.lohidi.com"
                target="_blank"
                rel="noreferrer"
                className={`${ui.focusRing} rounded underline-offset-4 hover:text-slate-700 hover:underline`}
              >
                LoHiDi®
              </a>
            </span>
            <span className="hidden md:inline">
              Designed & developed with ❤️ in Dallas, Texas 🇺🇸 by{' '}
              <a
                href="https://www.lohidi.com"
                target="_blank"
                rel="noreferrer"
                className={`${ui.focusRing} rounded underline-offset-4 hover:text-slate-700 hover:underline`}
              >
                LoHiDi®
              </a>
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
