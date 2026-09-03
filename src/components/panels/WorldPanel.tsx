import { useMemo } from 'react'
import {
  useConstraintViolations,
  useEgressRoutes,
  useEnvironment,
  useSceneStore,
  useWorldMetadata,
  useZoneSummaries,
} from '@/state'
import { LAYOUTS, WORLD_PRESETS, requestFocus } from '@/tools'
import { ZONE_KIND_LABELS } from '@/tools/zones'
import type { ConstraintViolation, EnvironmentSettings } from '@/types'
import { COORDINATE_SYSTEM, SYSTEM_ACTOR } from '@/types'
import { roundTo } from '@/utils'
import { Badge, Disclosure, EmptyState, Icon, SectionLabel, ToggleRow } from '@/components/ui'
import { WhatIfPanel } from './WhatIfPanel'

/**
 * World tab: the structured view of the space rather than the object list.
 *
 * Everything shown here is derived by `state/worldApi` — the same functions the
 * WebMCP layer answers from, so the panel and an agent can never disagree.
 */
export function WorldPanel() {
  const metadata = useWorldMetadata()
  const environment = useEnvironment()
  const zones = useZoneSummaries()
  const violations = useConstraintViolations()
  const routes = useEgressRoutes()
  const updateEnvironment = useSceneStore((state) => state.updateEnvironment)
  const selectObject = useSceneStore((state) => state.selectObject)
  const loadScene = useSceneStore((state) => state.loadScene)
  const generateLayout = useSceneStore((state) => state.generateLayout)
  const objectCount = useSceneStore((state) => state.scene.objects.length)
  const sceneName = useSceneStore((state) => state.scene.name)

  const grouped = useMemo(
    () => ({
      errors: violations.filter((v) => v.severity === 'error'),
      warnings: violations.filter((v) => v.severity === 'warning'),
      info: violations.filter((v) => v.severity === 'info'),
    }),
    [violations],
  )

  const overlays: { key: keyof EnvironmentSettings; label: string; description: string }[] = [
    { key: 'showZones', label: 'Zones', description: 'Tint and outline each named region' },
    { key: 'showBoundary', label: 'World boundary', description: 'Legal placement area' },
    { key: 'showWarnings', label: 'Warnings', description: 'Mark constraint findings on the floor' },
    { key: 'showPaths', label: 'Egress paths', description: 'Routes measured from each door' },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pb-5">
        {/* World summary */}
        <SectionLabel trailing={<span className="font-mono">rev {metadata.revision}</span>}>
          World
        </SectionLabel>
        <div className="mx-2.5 rounded-lg border border-ink-750 bg-ink-850 p-2.5">
          <p className="text-[11px] leading-relaxed text-ink-300">{metadata.description}</p>

          {/* The two numbers you actually work against stay on the face of the
              panel. The coordinate convention and the storage behaviour are
              read once a session, so they move behind a disclosure rather than
              out of the product. */}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 pt-2">
            <Stat label="Room" value={`${environment.room.width} × ${environment.room.depth} m`} />
            <Stat label="Wall height" value={`${environment.room.wallHeight} m`} />
          </dl>

          <div className="pt-1.5">
            <Disclosure summary="Coordinates and storage" hint={COORDINATE_SYSTEM.units}>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                <Stat
                  label="X range"
                  value={`${-environment.room.width / 2} … ${environment.room.width / 2}`}
                />
                <Stat
                  label="Z range"
                  value={`${-environment.room.depth / 2} … ${environment.room.depth / 2}`}
                />
              </dl>
              <p className="pt-1.5 text-[10px] leading-relaxed text-ink-500">
                Units {COORDINATE_SYSTEM.units}. Origin at the floor centre, +Y up.{' '}
                {COORDINATE_SYSTEM.rotation.convention}
              </p>
              <p className="flex items-start gap-1.5 pt-1.5 text-[10px] leading-relaxed text-ink-500">
                <Icon name="download" size={11} className="mt-px shrink-0 text-signal-400" />
                <span>
                  Saved in this browser — a refresh brings it back. Use{' '}
                  <span className="text-ink-300">Start fresh</span> in the outliner to begin from
                  an empty room.
                </span>
              </p>
            </Disclosure>
          </div>

          {metadata.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-2">
              {metadata.tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
          )}
        </div>

        {/* Presets: the same engine with different objects, zones and rules. */}
        <SectionLabel>Start from a preset</SectionLabel>
        <div className="grid grid-cols-2 gap-1.5 px-2.5">
          {WORLD_PRESETS.map((preset) => {
            const active = sceneName === preset.worldName
            return (
              <button
                key={preset.id}
                type="button"
                title={preset.description}
                onClick={() => loadScene(preset.build(), SYSTEM_ACTOR)}
                className={`rounded-lg border p-2 text-left transition-colors ${
                  active
                    ? 'border-brand-500/50 bg-brand-500/10'
                    : 'border-ink-750 bg-ink-850 hover:border-ink-650'
                }`}
              >
                <span className="block truncate text-[11.5px] font-medium text-ink-200">
                  {preset.name}
                </span>
                <span className="block truncate text-[10px] text-ink-500">{preset.tagline}</span>
              </button>
            )
          })}
        </div>

        {/* Layouts refurnish the current room; presets replace the whole world. */}
        <SectionLabel
          trailing={
            objectCount === 0 ? <span className="text-brand-400 normal-case">start here</span> : undefined
          }
        >
          Build a layout
        </SectionLabel>
        {objectCount === 0 && (
          <p className="px-2.5 pb-2 text-[10.5px] leading-relaxed text-ink-400">
            The room is empty. Pick an arrangement, or ask an agent for one — it has the same
            layouts available through <span className="font-mono text-ink-300">generate_layout</span>.
          </p>
        )}
        <div className="grid grid-cols-2 gap-1.5 px-2.5">
          {LAYOUTS.map((layout) => (
            <button
              key={layout.id}
              type="button"
              title={layout.summary}
              onClick={() => generateLayout(layout.id)}
              className="rounded-lg border border-ink-750 bg-ink-850 p-2 text-left transition-colors hover:border-brand-500/50 hover:bg-ink-800"
            >
              <span className="block truncate text-[11.5px] font-medium text-ink-200">
                {layout.name}
              </span>
              <span className="block truncate text-[10px] text-ink-500">{layout.summary}</span>
            </button>
          ))}
        </div>

        <WhatIfPanel />

        {/* Overlays */}
        <SectionLabel>Analysis overlays</SectionLabel>
        <div className="flex flex-col gap-0.5 px-1.5">
          {overlays.map((overlay) => (
            <ToggleRow
              key={overlay.key}
              label={overlay.label}
              description={overlay.description}
              checked={Boolean(environment[overlay.key])}
              onChange={() => updateEnvironment({ [overlay.key]: !environment[overlay.key] })}
            />
          ))}
        </div>

        {/* Zones */}
        <SectionLabel trailing={<span className="font-mono">{zones.length}</span>}>
          Zones
        </SectionLabel>
        <ul className="flex flex-col gap-1 px-2.5">
          {zones.map((zone) => (
            <li
              key={zone.id}
              className="rounded-lg border border-ink-750 bg-ink-850 p-2"
              style={{ borderLeft: `2px solid ${zone.color}` }}
            >
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-ink-200">
                  {zone.name}
                </span>
                <Badge>{zone.objectCount}</Badge>
              </div>
              <div className="flex items-center gap-1.5 pt-0.5">
                <span
                  className="font-mono text-[9.5px] tracking-wide uppercase"
                  style={{ color: zone.color }}
                >
                  {ZONE_KIND_LABELS[zone.kind]}
                </span>
                <span className="font-mono text-[9.5px] text-ink-500">{zone.areaSqm} m²</span>
                {zone.capacity !== null && (
                  <span className="font-mono text-[9.5px] text-ink-500">
                    cap {zone.objectCount}/{zone.capacity}
                  </span>
                )}
                {zone.intrusionIds.length > 0 && (
                  <Badge tone="warn" className="ml-auto">
                    {zone.intrusionIds.length} not allowed
                  </Badge>
                )}
              </div>
            </li>
          ))}
        </ul>

        {/* Egress routes */}
        <SectionLabel>Egress routes</SectionLabel>
        <ul className="flex flex-col gap-px px-2">
          {routes.length === 0 && (
            <li className="px-2 py-1.5 text-[11px] text-ink-500">No doors in the world.</li>
          )}
          {routes.map((route) => (
            <li key={route.fromId} className="flex items-center gap-2 rounded-md px-2 py-1.5">
              <Icon
                name="target"
                size={12}
                className={route.clearance.reachable ? 'text-signal-400' : 'text-danger-500'}
              />
              <span className="min-w-0 flex-1 truncate text-[11px] text-ink-300">
                {route.fromLabel} → centre
              </span>
              <span className="font-mono text-[10.5px] text-ink-400">
                {route.clearance.reachable ? `${roundTo(route.clearance.width, 2)} m` : 'blocked'}
              </span>
            </li>
          ))}
        </ul>

        {/* Constraint status */}
        <SectionLabel
          trailing={
            <span className="font-mono">
              {grouped.errors.length}E · {grouped.warnings.length}W
            </span>
          }
        >
          Constraint status
        </SectionLabel>

        {violations.length === 0 ? (
          <EmptyState
            title="All constraints satisfied"
            hint="No collisions, blocked exits or boundary problems in the current layout."
            icon={<Icon name="target" size={20} />}
          />
        ) : (
          <ul className="flex flex-col gap-px px-1.5">
            {[...grouped.errors, ...grouped.warnings, ...grouped.info].map((violation, index) => (
              <ViolationRow
                key={`${violation.constraintId}-${index}`}
                violation={violation}
                onSelect={() => {
                  const target = violation.objectIds[0]
                  if (!target) return
                  selectObject(target)
                  requestFocus(target)
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ViolationRow({
  violation,
  onSelect,
}: {
  violation: ConstraintViolation
  onSelect: () => void
}) {
  const tone =
    violation.severity === 'error'
      ? 'text-danger-500'
      : violation.severity === 'warning'
        ? 'text-warn-500'
        : 'text-ink-400'
  const bar =
    violation.severity === 'error'
      ? 'bg-danger-500'
      : violation.severity === 'warning'
        ? 'bg-warn-500'
        : 'bg-ink-600'

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        disabled={violation.objectIds.length === 0}
        className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-ink-800 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span className={`mt-1 h-3 w-[2px] shrink-0 rounded-full ${bar}`} />
        <span className="min-w-0 flex-1">
          <span className={`block text-[11px] leading-snug ${tone}`}>{violation.message}</span>
          <span className="block pt-0.5 font-mono text-[9.5px] text-ink-500">
            {violation.kind}
            {violation.required > 0 &&
              ` · ${violation.measured} / ${violation.required} ${violation.kind === 'alignment' ? '°' : 'm'}`}
          </span>
        </span>
      </button>
    </li>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9.5px] tracking-wide text-ink-500 uppercase">{label}</dt>
      <dd className="font-mono text-[10.5px] text-ink-200">{value}</dd>
    </div>
  )
}
