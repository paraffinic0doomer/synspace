import type { ReactNode } from 'react'

interface PanelProps {
  children: ReactNode
  className?: string
}

/** A full-height dock column. */
export function Panel({ children, className = '' }: PanelProps) {
  return (
    <aside className={`flex min-h-0 flex-col bg-ink-900 ${className}`}>{children}</aside>
  )
}

interface PanelHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function PanelHeader({ title, subtitle, actions }: PanelHeaderProps) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-ink-750 px-3.5 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-[12px] font-semibold tracking-wide text-ink-100">
          {title}
        </h2>
        {subtitle && (
          <p className="truncate text-[11px] text-ink-400">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  )
}

interface SectionLabelProps {
  children: ReactNode
  trailing?: ReactNode
  className?: string
}

/** Small caps divider used to break panels into scannable groups. */
export function SectionLabel({ children, trailing, className = '' }: SectionLabelProps) {
  return (
    <div
      className={`flex items-center justify-between gap-2 px-3.5 pt-4 pb-2 text-[10px] font-semibold tracking-[0.14em] text-ink-400 uppercase ${className}`}
    >
      <span>{children}</span>
      {trailing}
    </div>
  )
}

interface EmptyStateProps {
  title: string
  hint?: string
  icon?: ReactNode
}

export function EmptyState({ title, hint, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-ink-600">{icon}</div>}
      <p className="text-[12px] font-medium text-ink-300">{title}</p>
      {hint && <p className="max-w-[15rem] text-[11px] leading-relaxed text-ink-500">{hint}</p>}
    </div>
  )
}
