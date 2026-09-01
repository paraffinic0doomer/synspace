import { useMemo } from 'react'
import {
  getNeighbours,
  getObjectStatus,
  getObjectView,
  getRelationships,
  useSceneStore,
  useSelectedObject,
  useViolationsFor,
  useWorld,
} from '@/state'
import { getAssetDefinition, requestFocus } from '@/tools'
import type { ActorRef, ObjectStatus, SceneObject, Vec3 } from '@/types'
import {
  formatArea,
  formatDimensions,
  formatRelativeTime,
  roundTo,
  titleCase,
  toDegrees,
  toRadians,
} from '@/utils'
import {
  AssetGlyph,
  Badge,
  Button,
  Icon,
  IconButton,
  Panel,
  PanelHeader,
  SectionLabel,
  ToggleRow,
  VectorField,
} from '@/components/ui'
import { WorldPanel } from './WorldPanel'

const SWATCHES = [
  '#b98a5a',
  '#8a6a45',
  '#4c6b6b',
  '#3f4c63',
  '#5b6478',
  '#2b3040',
  '#3f8a54',
  '#9aa3b4',
  '#4f8cff',
  '#f0b429',
]

const STATUS_TONE: Record<ObjectStatus, 'signal' | 'warn'> = {
  ready: 'signal',
  locked: 'warn',
  hidden: 'warn',
}

const STATUS_LABEL: Record<ObjectStatus, string> = {
  ready: 'Ready',
  locked: 'Locked',
  hidden: 'Hidden',
}

/** Right dock: properties for the current selection, or a scene-level summary. */
export function InspectorPanel() {
  const selected = useSelectedObject()

  return (
    <Panel className="w-[318px] shrink-0 border-l border-ink-750">
      {selected ? <ObjectInspector object={selected} /> : <SceneInspector />}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Object inspector
// ---------------------------------------------------------------------------

function ObjectInspector({ object }: { object: SceneObject }) {
  const world = useWorld()
  const previewTransform = useSceneStore((state) => state.previewTransform)
  const previewUpdate = useSceneStore((state) => state.previewUpdate)
  const commitPreview = useSceneStore((state) => state.commitPreview)
  const updateObject = useSceneStore((state) => state.updateObject)
  const duplicateObject = useSceneStore((state) => state.duplicateObject)
  const deleteObject = useSceneStore((state) => state.deleteObject)

  const definition = getAssetDefinition(object.type)
  const locked = object.locked
  const status = getObjectStatus(object)
  const spatial = useMemo(() => getObjectView(object.id, world), [object.id, world])
  const relationships = useMemo(
    () => getRelationships(object.id, world),
    [object.id, world],
  )
  const neighbours = useMemo(() => getNeighbours(object.id, 5, world), [object.id, world])
  const violations = useViolationsFor(object.id)

  const rotationDegrees: Vec3 = [
    roundTo(toDegrees(object.rotation[0]), 1),
    roundTo(toDegrees(object.rotation[1]), 1),
    roundTo(toDegrees(object.rotation[2]), 1),
  ]

  const effective = {
    width: object.dimensions.width * object.scale[0],
    height: object.dimensions.height * object.scale[1],
    depth: object.dimensions.depth * object.scale[2],
  }

  /** Live write while a field is being typed or scrubbed — no history entry yet. */
  const preview = (patch: Parameters<typeof previewTransform>[1]) =>
    previewTransform(object.id, patch)
  /** One history entry per settled edit, matching the gizmo's drag-end behaviour. */
  const commit = () => commitPreview()
  const applyAndCommit = (patch: Parameters<typeof previewTransform>[1]) => {
    preview(patch)
    commit()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title="Inspector"
        subtitle={definition.name}
        actions={
          <>
            <IconButton label="Frame selection (F)" onClick={() => requestFocus(object.id)}>
              <Icon name="target" size={14} />
            </IconButton>
            <IconButton label="Duplicate (Ctrl+D)" onClick={() => duplicateObject(object.id)}>
              <Icon name="copy" size={14} />
            </IconButton>
            <IconButton label="Delete (Del)" tone="danger" onClick={() => deleteObject(object.id)}>
              <Icon name="trash" size={14} />
            </IconButton>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {/* Identity */}
        <div className="flex items-start gap-2.5 px-3.5 pt-3.5">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-ink-700 bg-ink-850"
            style={{ color: object.color }}
          >
            <AssetGlyph type={object.type} size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <input
              value={object.label}
              onChange={(event) => previewUpdate(object.id, { label: event.target.value })}
              onBlur={commit}
              aria-label="Object label"
              className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] font-medium text-ink-100 outline-none hover:border-ink-700 focus:border-brand-500/60 focus:bg-ink-850"
            />
            <div className="flex flex-wrap items-center gap-1 px-1.5 pt-1">
              <Badge tone="brand">{titleCase(object.type)}</Badge>
              <Badge>{object.id}</Badge>
            </div>
          </div>
        </div>

        {/* Status */}
        <SectionLabel
          trailing={<span className="font-mono">rev {object.metadata.revision}</span>}
        >
          Status
        </SectionLabel>
        <div className="mx-3.5 flex flex-col gap-1.5 rounded-lg border border-ink-750 bg-ink-850 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
            <span className="font-mono text-[10px] text-ink-500">
              {formatRelativeTime(object.metadata.updatedAt)}
            </span>
          </div>
          <ActorLine label="Created by" actor={object.metadata.createdBy} at={object.metadata.createdAt} />
          <ActorLine
            label="Last change"
            actor={object.metadata.lastModifiedBy}
            at={object.metadata.updatedAt}
          />
          {object.metadata.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {object.metadata.tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
          )}
        </div>

        {/* Transform */}
        <SectionLabel
          trailing={
            <button
              type="button"
              onClick={() =>
                applyAndCommit({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] })
              }
              disabled={locked}
              className="font-sans text-[10px] tracking-normal text-ink-400 normal-case hover:text-brand-400 disabled:opacity-40"
            >
              Reset
            </button>
          }
        >
          Transform
        </SectionLabel>

        <div className="flex flex-col gap-2.5 px-3.5">
          <Field label="Position" unit="metres">
            <VectorField
              value={object.position}
              disabled={locked}
              step={0.1}
              unit="m"
              onChange={(position) => preview({ position })}
              onCommit={commit}
            />
          </Field>

          <Field label="Rotation" unit="degrees">
            <VectorField
              value={rotationDegrees}
              disabled={locked}
              step={5}
              precision={1}
              unit="°"
              onChange={(degrees) =>
                preview({
                  rotation: [
                    toRadians(degrees[0]),
                    toRadians(degrees[1]),
                    toRadians(degrees[2]),
                  ],
                })
              }
              onCommit={commit}
            />
          </Field>

          <Field label="Scale" unit="multiplier">
            <VectorField
              value={object.scale}
              disabled={locked}
              step={0.05}
              min={0.05}
              onChange={(scale) => preview({ scale })}
              onCommit={commit}
            />
          </Field>
        </div>

        {/* Dimensions */}
        <SectionLabel>Dimensions</SectionLabel>
        <dl className="mx-3.5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-ink-750 bg-ink-750">
          <Metric
            label="Base size"
            value={formatDimensions(
              object.dimensions.width,
              object.dimensions.height,
              object.dimensions.depth,
            )}
          />
          <Metric
            label="Effective size"
            value={formatDimensions(effective.width, effective.height, effective.depth)}
          />
          <Metric label="Footprint" value={formatArea(effective.width, effective.depth)} />
          <Metric label="Clearance" value={`${definition.clearance} m`} />
        </dl>

        {/* Spatial context */}
        <SectionLabel
          trailing={
            spatial && (
              <Badge tone={spatial.boundary === 'inside' ? 'signal' : 'warn'}>
                {spatial.boundary}
              </Badge>
            )
          }
        >
          Spatial context
        </SectionLabel>
        <dl className="mx-3.5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-ink-750 bg-ink-750">
          <Metric label="Zone" value={spatial?.zoneName ?? 'Unzoned'} span />
          <Metric label="Category" value={spatial?.category ?? definition.category} />
          <Metric label="Footprint" value={`${spatial?.footprint.areaSqm ?? 0} m²`} />
        </dl>

        <SectionLabel trailing={<span className="font-mono">{neighbours.length}</span>}>
          Nearby objects
        </SectionLabel>
        <ul className="flex flex-col gap-px px-2">
          {neighbours.map((neighbour) => (
            <li key={neighbour.object.id}>
              <button
                type="button"
                onClick={() => {
                  useSceneStore.getState().selectObject(neighbour.object.id)
                  requestFocus(neighbour.object.id)
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-ink-800"
              >
                <span className="min-w-0 flex-1 truncate text-[11px] text-ink-300">
                  {neighbour.object.label}
                </span>
                <span className="font-mono text-[10px] text-ink-500">{neighbour.gap} m</span>
              </button>
            </li>
          ))}
        </ul>

        <SectionLabel trailing={<span className="font-mono">{relationships.length}</span>}>
          Relationships
        </SectionLabel>
        <ul className="flex flex-col gap-1 px-3.5">
          {relationships.length === 0 && (
            <li className="text-[11px] text-ink-500">No derived relationships.</li>
          )}
          {relationships.map((relationship, index) => (
            <li
              key={`${relationship.kind}-${relationship.objectId}-${index}`}
              className="flex items-center gap-2 rounded-md border border-ink-750 bg-ink-850 px-2 py-1.5"
            >
              <Badge>{relationship.kind.replaceAll('_', ' ')}</Badge>
              <span className="min-w-0 flex-1 truncate text-[10.5px] text-ink-300">
                {relationship.label}
              </span>
            </li>
          ))}
        </ul>

        <SectionLabel trailing={<span className="font-mono">{violations.length}</span>}>
          Constraint status
        </SectionLabel>
        <div className="mx-3.5 rounded-lg border border-ink-750 bg-ink-850 p-2.5">
          {violations.length === 0 ? (
            <p className="text-[11px] text-signal-400">No constraint violations.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {violations.map((violation, index) => (
                <li
                  key={`${violation.constraintId}-${index}`}
                  className={
                    violation.severity === 'error'
                      ? 'text-[10.5px] leading-snug text-danger-500'
                      : 'text-[10.5px] leading-snug text-warn-500'
                  }
                >
                  {violation.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Appearance */}
        <SectionLabel>Appearance</SectionLabel>
        <div className="flex items-center gap-2 px-3.5">
          <input
            type="color"
            value={object.color}
            onChange={(event) => previewUpdate(object.id, { color: event.target.value })}
            onBlur={commit}
            aria-label="Accent colour"
            className="h-7 w-9 shrink-0 rounded-md"
          />
          <div className="flex flex-wrap gap-1">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Set colour ${swatch}`}
                onClick={() => updateObject(object.id, { color: swatch })}
                style={{ backgroundColor: swatch }}
                className={`h-5 w-5 rounded-[5px] border transition-transform hover:scale-110 ${
                  object.color.toLowerCase() === swatch.toLowerCase()
                    ? 'border-ink-100'
                    : 'border-ink-700'
                }`}
              />
            ))}
          </div>
        </div>

        {/* State */}
        <SectionLabel>State</SectionLabel>
        <div className="flex flex-col gap-0.5 px-2">
          <ToggleRow
            label="Visible"
            description="Hide without removing from the scene"
            checked={object.visible}
            onChange={() => updateObject(object.id, { visible: !object.visible })}
          />
          <ToggleRow
            label="Locked"
            description="Block gizmo and inspector edits"
            checked={object.locked}
            onChange={() => updateObject(object.id, { locked: !object.locked })}
          />
        </div>

        <div className="flex gap-1.5 px-3.5 pt-4">
          <Button className="flex-1" onClick={() => duplicateObject(object.id)}>
            <Icon name="copy" size={12} />
            Duplicate
          </Button>
          <Button tone="danger" className="flex-1" onClick={() => deleteObject(object.id)}>
            <Icon name="trash" size={12} />
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}

function ActorLine({ label, actor, at }: { label: string; actor: ActorRef; at: number }) {
  const icon = actor.kind === 'agent' ? 'bot' : actor.kind === 'system' ? 'sparkles' : 'user'
  const tone =
    actor.kind === 'agent'
      ? 'text-signal-400'
      : actor.kind === 'system'
        ? 'text-brand-400'
        : 'text-ink-200'

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10.5px] text-ink-500">{label}</span>
      <span className={`inline-flex items-center gap-1 font-mono text-[10.5px] ${tone}`}>
        <Icon name={icon} size={11} />
        {actor.name}
        <span className="text-ink-600">· {formatRelativeTime(at)}</span>
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scene inspector (no selection)
// ---------------------------------------------------------------------------

function SceneInspector() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="World inspector" subtitle="Shared spatial model" />
      <WorldPanel />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Field({
  label,
  unit,
  children,
}: {
  label: string
  unit?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between pb-1">
        <span className="text-[11px] font-medium text-ink-300">{label}</span>
        {unit && <span className="font-mono text-[9.5px] text-ink-500">{unit}</span>}
      </div>
      {children}
    </div>
  )
}

function Metric({ label, value, span = false }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={`bg-ink-850 px-2.5 py-2 ${span ? 'col-span-2' : ''}`}>
      <dt className="text-[10px] tracking-wide text-ink-500 uppercase">{label}</dt>
      <dd className="truncate pt-0.5 font-mono text-[11px] text-ink-200">{value}</dd>
    </div>
  )
}
