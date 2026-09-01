import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Tone = 'default' | 'brand' | 'signal' | 'warn' | 'danger'

const TONE_ACTIVE: Record<Tone, string> = {
  default: 'bg-ink-700 text-ink-100 border-ink-600',
  brand: 'bg-brand-500/15 text-brand-400 border-brand-500/50',
  signal: 'bg-signal-500/15 text-signal-400 border-signal-500/50',
  warn: 'bg-warn-500/15 text-warn-500 border-warn-500/50',
  danger: 'bg-danger-500/15 text-danger-500 border-danger-500/50',
}

const TONE_HOVER: Record<Tone, string> = {
  default: 'hover:bg-ink-750 hover:text-ink-100',
  brand: 'hover:bg-brand-500/10 hover:text-brand-400',
  signal: 'hover:bg-signal-500/10 hover:text-signal-400',
  warn: 'hover:bg-warn-500/10 hover:text-warn-500',
  danger: 'hover:bg-danger-500/10 hover:text-danger-500',
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name. Keep it stable across states so screen readers don't churn. */
  label: string
  /** Hover tooltip; defaults to `label`. Use for state-dependent detail. */
  tooltip?: string
  active?: boolean
  tone?: Tone
  children: ReactNode
}

/** Square 28px control used throughout the chrome. */
export function IconButton({
  label,
  tooltip,
  active = false,
  tone = 'default',
  className = '',
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      title={tooltip ?? label}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-ink-300 transition-colors disabled:pointer-events-none disabled:opacity-35 ${
        active ? TONE_ACTIVE[tone] : `border-transparent ${TONE_HOVER[tone]}`
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone
  variant?: 'solid' | 'ghost' | 'outline'
  children: ReactNode
}

export function Button({
  tone = 'default',
  variant = 'outline',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const solid: Record<Tone, string> = {
    default: 'bg-ink-700 text-ink-100 hover:bg-ink-650',
    brand: 'bg-brand-600 text-white hover:bg-brand-500',
    signal: 'bg-signal-600 text-ink-950 hover:bg-signal-500',
    warn: 'bg-warn-500 text-ink-950 hover:brightness-110',
    danger: 'bg-danger-600 text-white hover:bg-danger-500',
  }
  const outline: Record<Tone, string> = {
    default: 'border border-ink-650 text-ink-200 hover:bg-ink-750 hover:text-ink-100',
    brand: 'border border-brand-500/45 text-brand-400 hover:bg-brand-500/12',
    signal: 'border border-signal-500/45 text-signal-400 hover:bg-signal-500/12',
    warn: 'border border-warn-500/45 text-warn-500 hover:bg-warn-500/12',
    danger: 'border border-danger-500/45 text-danger-500 hover:bg-danger-500/12',
  }
  const ghost: Record<Tone, string> = {
    default: 'text-ink-300 hover:bg-ink-750 hover:text-ink-100',
    brand: 'text-brand-400 hover:bg-brand-500/12',
    signal: 'text-signal-400 hover:bg-signal-500/12',
    warn: 'text-warn-500 hover:bg-warn-500/12',
    danger: 'text-danger-500 hover:bg-danger-500/12',
  }
  const styles = variant === 'solid' ? solid : variant === 'ghost' ? ghost : outline

  return (
    <button
      type="button"
      className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-[11.5px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-35 ${styles[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

interface SegmentedOption<T extends string> {
  value: T
  label: string
  hint?: string
  icon: ReactNode
}

interface SegmentedControlProps<T extends string> {
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  className?: string
}

/** Mode switcher (move / rotate / scale). */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      className={`inline-flex items-center gap-0.5 rounded-lg border border-ink-750 bg-ink-850 p-0.5 ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint ? `${option.label} · ${option.hint}` : option.label}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-[26px] items-center gap-1.5 rounded-[6px] px-2 text-[11.5px] font-medium transition-colors ${
              active
                ? 'bg-brand-500/18 text-brand-400 shadow-[inset_0_0_0_1px_rgba(79,140,255,0.35)]'
                : 'text-ink-400 hover:bg-ink-750 hover:text-ink-200'
            }`}
          >
            {option.icon}
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

interface BadgeProps {
  children: ReactNode
  tone?: Tone
  className?: string
}

export function Badge({ children, tone = 'default', className = '' }: BadgeProps) {
  const tones: Record<Tone, string> = {
    default: 'border-ink-650 bg-ink-800 text-ink-300',
    brand: 'border-brand-500/40 bg-brand-500/10 text-brand-400',
    signal: 'border-signal-500/40 bg-signal-500/10 text-signal-400',
    warn: 'border-warn-500/40 bg-warn-500/10 text-warn-500',
    danger: 'border-danger-500/40 bg-danger-500/10 text-danger-500',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] font-mono text-[10px] leading-4 tracking-wide ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

interface StatusDotProps {
  tone?: Tone
  pulse?: boolean
}

export function StatusDot({ tone = 'signal', pulse = false }: StatusDotProps) {
  const colors: Record<Tone, string> = {
    default: 'bg-ink-500',
    brand: 'bg-brand-500',
    signal: 'bg-signal-500',
    warn: 'bg-warn-500',
    danger: 'bg-danger-500',
  }
  return (
    <span className="relative inline-flex h-1.5 w-1.5 shrink-0">
      {pulse && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${colors[tone]}`}
        />
      )}
      <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${colors[tone]}`} />
    </span>
  )
}

interface ToggleRowProps {
  label: string
  description?: string
  checked: boolean
  onChange: () => void
}

export function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-ink-800"
    >
      <span className="min-w-0">
        <span className="block text-[12px] text-ink-200">{label}</span>
        {description && (
          <span className="block text-[10.5px] text-ink-500">{description}</span>
        )}
      </span>
      <span
        className={`relative h-[18px] w-[32px] shrink-0 rounded-full border transition-colors ${
          checked ? 'border-brand-500/60 bg-brand-500/30' : 'border-ink-650 bg-ink-800'
        }`}
      >
        <span
          className={`absolute top-[2px] h-[12px] w-[12px] rounded-full transition-all ${
            checked ? 'left-[16px] bg-brand-400' : 'left-[2px] bg-ink-500'
          }`}
        />
      </span>
    </button>
  )
}
