import type { ReactNode } from 'react'
import { Icon } from './Icon'

interface DisclosureProps {
  summary: string
  children: ReactNode
  defaultOpen?: boolean
  /** Short value shown on the closed row, so the summary still carries a fact. */
  hint?: string
}

/**
 * A labelled detail that starts closed.
 *
 * This is how the interface stays quiet without losing anything. Reference
 * material — coordinate conventions, storage behaviour, navigation keys — is
 * needed once and then never again in a session, so it sits one click away
 * instead of competing with the world for attention. Nothing is removed; it is
 * only ranked.
 *
 * Built on `<details>`, so it is keyboard-operable and open-by-default in
 * print and in search-in-page without any state of our own.
 */
export function Disclosure({ summary, children, defaultOpen = false, hint }: DisclosureProps) {
  return (
    <details open={defaultOpen} className="synspace-disclosure group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md py-1 text-[10.5px] text-ink-500 transition-colors select-none hover:text-ink-300">
        <Icon
          name="chevronRight"
          size={10}
          className="shrink-0 transition-transform group-open:rotate-90"
        />
        <span className="flex-1 truncate text-left">{summary}</span>
        {hint && <span className="font-mono text-[10px] text-ink-600">{hint}</span>}
      </summary>
      <div className="pt-1 pb-0.5 pl-[15px]">{children}</div>
    </details>
  )
}
