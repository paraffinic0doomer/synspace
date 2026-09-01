import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { roundTo } from '@/utils'

interface NumberFieldProps {
  /** Short axis/property tag shown on the left; also the drag-to-scrub handle. */
  tag: string
  value: number
  onChange: (value: number) => void
  /** Fired once when editing settles (blur or scrub release), not per keystroke. */
  onCommit?: () => void
  step?: number
  precision?: number
  min?: number
  max?: number
  unit?: string
  disabled?: boolean
  tagClassName?: string
}

/**
 * Numeric input with a drag-to-scrub tag, the interaction people expect from
 * a 3D tool. Typing is still fully supported.
 */
export function NumberField({
  tag,
  value,
  onChange,
  onCommit,
  step = 0.1,
  precision = 2,
  min,
  max,
  unit,
  disabled = false,
  tagClassName = '',
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string>(() => roundTo(value, precision).toString())
  const [editing, setEditing] = useState(false)
  const dragState = useRef<{ startX: number; startValue: number } | null>(null)

  useEffect(() => {
    if (!editing) setDraft(roundTo(value, precision).toString())
  }, [value, precision, editing])

  const clampValue = useCallback(
    (next: number) => {
      let result = next
      if (min !== undefined) result = Math.max(min, result)
      if (max !== undefined) result = Math.min(max, result)
      return roundTo(result, precision)
    },
    [min, max, precision],
  )

  const commit = useCallback(
    (raw: string) => {
      const parsed = Number.parseFloat(raw)
      if (Number.isFinite(parsed)) onChange(clampValue(parsed))
      else setDraft(roundTo(value, precision).toString())
    },
    [onChange, clampValue, value, precision],
  )

  const handleTagPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      if (disabled) return
      event.currentTarget.setPointerCapture(event.pointerId)
      dragState.current = { startX: event.clientX, startValue: value }
    },
    [disabled, value],
  )

  const handleTagPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      const state = dragState.current
      if (!state) return
      const delta = (event.clientX - state.startX) * step * (event.shiftKey ? 0.2 : 1)
      onChange(clampValue(state.startValue + delta))
    },
    [step, onChange, clampValue],
  )

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      if (dragState.current) onCommit?.()
      dragState.current = null
    },
    [onCommit],
  )

  return (
    <label
      className={`group flex h-7 items-center gap-1 rounded-md border border-ink-750 bg-ink-850 pr-1.5 transition-colors focus-within:border-brand-500/60 ${
        disabled ? 'opacity-45' : 'hover:border-ink-650'
      }`}
    >
      <span
        onPointerDown={handleTagPointerDown}
        onPointerMove={handleTagPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`flex h-full w-6 shrink-0 cursor-ew-resize touch-none items-center justify-center rounded-l-md font-mono text-[10px] font-semibold select-none ${
          tagClassName || 'bg-ink-800 text-ink-400'
        }`}
      >
        {tag}
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={draft}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onFocus={() => setEditing(true)}
        onChange={(event) => {
          setDraft(event.target.value)
          commit(event.target.value)
        }}
        onBlur={(event) => {
          setEditing(false)
          commit(event.target.value)
          onCommit?.()
        }}
        className="w-full min-w-0 bg-transparent font-mono text-[11.5px] text-ink-100 outline-none"
      />
      {unit && <span className="shrink-0 font-mono text-[10px] text-ink-500">{unit}</span>}
    </label>
  )
}

interface VectorFieldProps {
  value: [number, number, number]
  onChange: (value: [number, number, number]) => void
  onCommit?: () => void
  step?: number
  precision?: number
  unit?: string
  disabled?: boolean
  min?: number
}

const AXIS_TAGS = [
  { tag: 'X', className: 'bg-danger-500/15 text-danger-500' },
  { tag: 'Y', className: 'bg-signal-500/15 text-signal-400' },
  { tag: 'Z', className: 'bg-brand-500/15 text-brand-400' },
] as const

/** Three axis-coloured number fields, matching the viewport gizmo colours. */
export function VectorField({
  value,
  onChange,
  onCommit,
  step = 0.1,
  precision = 2,
  unit,
  disabled = false,
  min,
}: VectorFieldProps) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {AXIS_TAGS.map((axis, index) => (
        <NumberField
          key={axis.tag}
          tag={axis.tag}
          tagClassName={axis.className}
          value={value[index]}
          onCommit={onCommit}
          step={step}
          precision={precision}
          unit={unit}
          disabled={disabled}
          min={min}
          onChange={(next) => {
            const updated: [number, number, number] = [...value]
            updated[index] = next
            onChange(updated)
          }}
        />
      ))}
    </div>
  )
}
