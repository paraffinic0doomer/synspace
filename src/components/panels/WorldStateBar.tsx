import { useMemo } from 'react'
import {
  useConstraintViolations,
  useEgressRoutes,
  usePreviewProposal,
  useProposalStore,
  useSceneObjects,
  useZoneSummaries,
} from '@/state'
import { roundTo } from '@/utils'
import { Icon } from '@/components/ui'

/**
 * The glanceable state of the world.
 *
 * Five numbers, chosen because they are the ones a person actually asks about:
 * how much is here, how it is organised, what is wrong, whether you can walk
 * through it, and whether it is full. Anything more belongs in a panel.
 */
export function WorldStateBar() {
  const objects = useSceneObjects()
  const zones = useZoneSummaries()
  const violations = useConstraintViolations()
  const routes = useEgressRoutes()

  const stats = useMemo(() => {
    const warnings = violations.filter((violation) => violation.severity !== 'info').length
    const errors = violations.filter((violation) => violation.severity === 'error').length

    const reachable = routes.filter((route) => route.clearance.reachable)
    const walkway =
      reachable.length === 0
        ? null
        : roundTo(Math.min(...reachable.map((route) => route.clearance.width)), 2)
    const blocked = routes.length - reachable.length

    const withCapacity = zones.filter((zone) => zone.capacity !== null)
    const used = withCapacity.reduce((sum, zone) => sum + zone.objectCount, 0)
    const total = withCapacity.reduce((sum, zone) => sum + (zone.capacity ?? 0), 0)

    return {
      warnings,
      errors,
      walkway,
      blocked,
      capacity: withCapacity.length > 0 ? { used, total } : null,
    }
  }, [violations, routes, zones])

  return (
    <div className="pointer-events-none flex items-stretch overflow-hidden rounded-lg border border-ink-750/80 bg-ink-900/85 backdrop-blur-md">
      <Stat label="Objects" value={String(objects.length)} />
      <Stat label="Zones" value={String(zones.length)} />
      <Stat
        label="Warnings"
        value={String(stats.warnings)}
        tone={stats.errors > 0 ? 'danger' : stats.warnings > 0 ? 'warn' : 'ok'}
      />
      <Stat
        label="Walkway"
        value={stats.walkway === null ? '—' : `${stats.walkway} m`}
        tone={stats.blocked > 0 ? 'danger' : stats.walkway !== null && stats.walkway < 1.2 ? 'warn' : 'ok'}
      />
      {stats.capacity && (
        <Stat
          label="Capacity"
          value={`${stats.capacity.used}/${stats.capacity.total}`}
          tone={stats.capacity.used > stats.capacity.total ? 'warn' : 'ok'}
        />
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'ok' | 'warn' | 'danger'
}) {
  const color =
    tone === 'danger'
      ? 'text-danger-500'
      : tone === 'warn'
        ? 'text-warn-500'
        : tone === 'ok'
          ? 'text-signal-400'
          : 'text-ink-100'

  return (
    <div className="flex flex-col items-start border-r border-ink-800 px-2.5 py-1.5 last:border-r-0">
      <span className="font-mono text-[9px] tracking-[0.12em] text-ink-500 uppercase">
        {label}
      </span>
      <span className={`font-mono text-[12px] leading-tight font-medium ${color}`}>{value}</span>
    </div>
  )
}

/**
 * CURRENT / PROPOSED switch.
 *
 * Only appears while a proposal is being previewed. The label is deliberately
 * blunt: in either view the live world is untouched until someone approves.
 */
export function WorldViewSwitch() {
  const proposal = usePreviewProposal()
  const worldView = useProposalStore((state) => state.worldView)
  const setWorldView = useProposalStore((state) => state.setWorldView)

  if (!proposal) return null

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1.5">
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-brand-500/40 bg-ink-900/90 p-0.5 backdrop-blur-md">
        <SwitchButton
          active={worldView === 'current'}
          onClick={() => setWorldView('current')}
          label="Current world"
        />
        <SwitchButton
          active={worldView === 'proposed'}
          onClick={() => setWorldView('proposed')}
          label="Proposed world"
        />
      </div>

      <span
        className={`rounded-full border px-2 py-0.5 font-mono text-[9.5px] tracking-wide ${
          worldView === 'proposed'
            ? 'border-brand-500/50 bg-brand-500/12 text-brand-400'
            : 'border-ink-700 bg-ink-900/85 text-ink-500'
        }`}
      >
        {worldView === 'proposed'
          ? 'simulation only — the real world has not changed'
          : `${proposal.affectedObjectIds.length} proposed change(s) ghosted`}
      </span>
    </div>
  )
}

function SwitchButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-[26px] items-center gap-1.5 rounded-[6px] px-2.5 text-[11px] font-medium tracking-wide uppercase transition-colors ${
        active
          ? 'bg-brand-500/20 text-brand-400 shadow-[inset_0_0_0_1px_rgba(79,140,255,0.4)]'
          : 'text-ink-400 hover:bg-ink-800 hover:text-ink-200'
      }`}
    >
      <Icon name={active ? 'eye' : 'cube'} size={11} />
      {label}
    </button>
  )
}
