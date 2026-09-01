import type { Scene, SceneObject, Vec3 } from '@/types'
import { clampToRoom } from '@/tools/placement'
import { normalizeAngle, roundTo, roundVec3 } from '@/utils'
import {
  clearanceZone,
  corners,
  direction,
  footprintGap,
  footprintOf,
  polygonsOverlap,
  type Footprint,
  type Point2,
} from './geometry'

/**
 * Deterministic layout strategies.
 *
 * Each planner is a pure function of the scene: it proposes transforms and
 * never touches the store. The caller applies the plan through a state action,
 * which keeps the whole optimisation a single undoable change and keeps this
 * module free of any dependency on React, the renderer or the store.
 *
 * Determinism matters — an agent that runs `optimize_layout` twice on the same
 * scene must get the same answer, so every loop runs a fixed number of passes
 * over an id-sorted list.
 */

export const OPTIMIZE_STRATEGIES = [
  'grid_align',
  'clear_walkways',
  'improve_spacing',
  'circle_cluster',
] as const

export type OptimizeStrategy = (typeof OPTIMIZE_STRATEGIES)[number]

export interface LayoutChange {
  id: string
  label: string
  from: { position: Vec3; rotation: Vec3 }
  to: { position: Vec3; rotation: Vec3 }
  reason: string
}

export interface LayoutPlan {
  strategy: OptimizeStrategy
  changes: LayoutChange[]
  /** Objects deliberately left alone, with why. */
  skipped: { id: string; label: string; reason: string }[]
}

export interface OptimizeOptions {
  /** Restrict the strategy to these objects. Defaults to everything eligible. */
  objectIds?: string[]
  /** Restrict to a single asset type. */
  modelType?: SceneObject['type']
}

const GRID_STEP = 0.5
const RELAX_PASSES = 6
const MOVE_EPSILON = 0.01

const byId = (a: SceneObject, b: SceneObject) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Objects a strategy is allowed to move. */
function eligible(scene: Scene, options: OptimizeOptions): SceneObject[] {
  const ids = options.objectIds ? new Set(options.objectIds) : null
  return scene.objects
    .filter((object) => {
      if (object.locked || !object.visible) return false
      if (ids && !ids.has(object.id)) return false
      if (options.modelType && object.type !== options.modelType) return false
      return true
    })
    .slice()
    .sort(byId)
}

function lockedSkips(scene: Scene, options: OptimizeOptions) {
  const ids = options.objectIds ? new Set(options.objectIds) : null
  return scene.objects
    .filter((object) => object.locked && (!ids || ids.has(object.id)))
    .map((object) => ({ id: object.id, label: object.label, reason: 'locked' }))
}

const asChange = (
  object: SceneObject,
  position: Vec3,
  rotation: Vec3,
  reason: string,
): LayoutChange | null => {
  const moved =
    Math.abs(position[0] - object.position[0]) > MOVE_EPSILON ||
    Math.abs(position[2] - object.position[2]) > MOVE_EPSILON
  const turned = Math.abs(normalizeAngle(rotation[1] - object.rotation[1])) > 0.005
  if (!moved && !turned) return null

  return {
    id: object.id,
    label: object.label,
    from: { position: [...object.position], rotation: [...object.rotation] },
    to: { position: roundVec3(position), rotation: rotation.map(normalizeAngle) as Vec3 },
    reason,
  }
}

export function planOptimization(
  scene: Scene,
  strategy: OptimizeStrategy,
  options: OptimizeOptions = {},
): LayoutPlan {
  switch (strategy) {
    case 'grid_align':
      return planGridAlign(scene, options)
    case 'clear_walkways':
      return planClearWalkways(scene, options)
    case 'improve_spacing':
      return planImproveSpacing(scene, options)
    case 'circle_cluster':
      return planCircleCluster(scene, options)
  }
}

// ---------------------------------------------------------------------------
// grid_align
// ---------------------------------------------------------------------------

/** Snap positions to a 0.5 m grid and rotations to the nearest right angle. */
function planGridAlign(scene: Scene, options: OptimizeOptions): LayoutPlan {
  const changes: LayoutChange[] = []

  for (const object of eligible(scene, options)) {
    const snapped: Vec3 = [
      Math.round(object.position[0] / GRID_STEP) * GRID_STEP,
      object.position[1],
      Math.round(object.position[2] / GRID_STEP) * GRID_STEP,
    ]
    const quarter = Math.PI / 2
    const rotation: Vec3 = [
      object.rotation[0],
      Math.round(object.rotation[1] / quarter) * quarter,
      object.rotation[2],
    ]
    const position = clampToRoom(
      snapped,
      object.dimensions,
      object.scale,
      scene.environment.room,
      rotation,
    )

    const change = asChange(object, position, rotation, 'snapped to the 0.5 m grid and nearest 90°')
    if (change) changes.push(change)
  }

  return { strategy: 'grid_align', changes, skipped: lockedSkips(scene, options) }
}

// ---------------------------------------------------------------------------
// Shared relaxation used by clear_walkways and improve_spacing
// ---------------------------------------------------------------------------

interface RelaxTarget {
  object: SceneObject
  position: Vec3
  movable: boolean
}

/**
 * Pushes objects apart until each qualifying pair reaches `required` metres.
 *
 * Fixed pass count and an id-sorted iteration order make the result stable;
 * immovable (locked or out-of-scope) objects act as anchors.
 */
function relax(
  scene: Scene,
  required: number,
  pairApplies: (a: SceneObject, b: SceneObject) => boolean,
  options: OptimizeOptions,
): Map<string, Vec3> {
  const movableIds = new Set(eligible(scene, options).map((object) => object.id))
  const targets: RelaxTarget[] = scene.objects
    .filter((object) => object.visible)
    .slice()
    .sort(byId)
    .map((object) => ({
      object,
      position: [...object.position] as Vec3,
      movable: movableIds.has(object.id),
    }))

  const footprintAt = (target: RelaxTarget): Footprint => ({
    ...footprintOf(target.object),
    center: { x: target.position[0], z: target.position[2] },
  })

  for (let pass = 0; pass < RELAX_PASSES; pass += 1) {
    let adjusted = false

    for (let i = 0; i < targets.length; i += 1) {
      for (let j = i + 1; j < targets.length; j += 1) {
        const a = targets[i]
        const b = targets[j]
        if (!a.movable && !b.movable) continue
        if (!pairApplies(a.object, b.object)) continue

        const fa = footprintAt(a)
        const fb = footprintAt(b)
        const overlapping = polygonsOverlap(corners(fa), corners(fb))
        const gap = overlapping ? 0 : footprintGap(fa, fb)
        if (!overlapping && gap >= required) continue

        // Overlaps need a nudge proportional to the objects' size; a plain gap
        // only needs the shortfall.
        const deficit = overlapping
          ? required + (fa.halfWidth + fb.halfWidth) * 0.5
          : required - gap
        const push = direction(fa.center, fb.center)
        const share = a.movable && b.movable ? deficit / 2 : deficit

        if (b.movable) {
          b.position = [b.position[0] + push.x * share, b.position[1], b.position[2] + push.z * share]
        }
        if (a.movable) {
          a.position = [a.position[0] - push.x * share, a.position[1], a.position[2] - push.z * share]
        }
        adjusted = true
      }
    }

    if (!adjusted) break
  }

  const result = new Map<string, Vec3>()
  for (const target of targets) {
    if (!target.movable) continue
    result.set(
      target.object.id,
      clampToRoom(
        target.position,
        target.object.dimensions,
        target.object.scale,
        scene.environment.room,
        target.object.rotation,
      ),
    )
  }
  return result
}

// ---------------------------------------------------------------------------
// clear_walkways
// ---------------------------------------------------------------------------

/**
 * Widen circulation: open every tight pair up to the walkway threshold, then
 * evict anything standing in a doorway's approach.
 */
function planClearWalkways(scene: Scene, options: OptimizeOptions): LayoutPlan {
  const constraint = scene.constraints.find((c) => c.kind === 'walkway-width')
  const required = constraint?.value ?? 1.2
  const entrance = scene.constraints.find((c) => c.kind === 'entrance-clearance')

  // Chairs belong tucked against their worksurface; widening that gap would
  // fight the layout rather than improve it.
  const pairApplies = (a: SceneObject, b: SceneObject) => {
    const pair = [a.type, b.type]
    if (pair.includes('chair') && (pair.includes('desk') || pair.includes('meeting-table'))) {
      return false
    }
    return true
  }

  const positions = relax(scene, required, pairApplies, options)

  // Second stage: push anything inside a door zone straight out of it.
  if (entrance) {
    const doors = scene.objects.filter((object) => object.type === 'door' && object.visible)
    for (const door of doors) {
      const zone = clearanceZone(footprintOf(door), entrance.value)
      const doorCentre: Point2 = { x: door.position[0], z: door.position[2] }

      for (const object of eligible(scene, options)) {
        if (object.type === 'door') continue
        const current = positions.get(object.id) ?? ([...object.position] as Vec3)
        const footprint: Footprint = {
          ...footprintOf(object),
          center: { x: current[0], z: current[2] },
        }
        if (!polygonsOverlap(zone, corners(footprint))) continue

        const away = direction(doorCentre, footprint.center)
        const shifted: Vec3 = [
          current[0] + away.x * (entrance.value + footprint.halfWidth),
          current[1],
          current[2] + away.z * (entrance.value + footprint.halfDepth),
        ]
        positions.set(
          object.id,
          clampToRoom(
            shifted,
            object.dimensions,
            object.scale,
            scene.environment.room,
            object.rotation,
          ),
        )
      }
    }
  }

  const changes: LayoutChange[] = []
  for (const object of eligible(scene, options)) {
    const position = positions.get(object.id)
    if (!position) continue
    const change = asChange(
      object,
      position,
      object.rotation,
      `opened circulation to ${required} m`,
    )
    if (change) changes.push(change)
  }

  return { strategy: 'clear_walkways', changes, skipped: lockedSkips(scene, options) }
}

// ---------------------------------------------------------------------------
// improve_spacing
// ---------------------------------------------------------------------------

/** Enforce the object-spacing rule between the asset types it applies to. */
function planImproveSpacing(scene: Scene, options: OptimizeOptions): LayoutPlan {
  const constraint = scene.constraints.find((c) => c.kind === 'object-spacing')
  const required = constraint?.value ?? 0.8
  const scope = constraint?.appliesTo ?? []

  const pairApplies = (a: SceneObject, b: SceneObject) =>
    scope.length === 0 ? a.type === b.type : scope.includes(a.type) && scope.includes(b.type)

  const positions = relax(scene, required, pairApplies, options)

  const changes: LayoutChange[] = []
  for (const object of eligible(scene, options)) {
    const position = positions.get(object.id)
    if (!position) continue
    const change = asChange(object, position, object.rotation, `spaced to ${required} m`)
    if (change) changes.push(change)
  }

  return { strategy: 'improve_spacing', changes, skipped: lockedSkips(scene, options) }
}

// ---------------------------------------------------------------------------
// circle_cluster
// ---------------------------------------------------------------------------

/**
 * Arrange the chosen objects evenly around their own centroid, each turned to
 * face inward — the seating ring you would want around a discussion space.
 */
function planCircleCluster(scene: Scene, options: OptimizeOptions): LayoutPlan {
  // With no explicit scope, clustering seating is the useful default.
  const scoped =
    options.objectIds || options.modelType
      ? eligible(scene, options)
      : eligible(scene, { ...options, modelType: 'chair' })

  if (scoped.length < 2) {
    return {
      strategy: 'circle_cluster',
      changes: [],
      skipped: [
        ...lockedSkips(scene, options),
        ...scoped.map((object) => ({
          id: object.id,
          label: object.label,
          reason: 'a circle needs at least two objects',
        })),
      ],
    }
  }

  const centre = scoped.reduce(
    (acc, object) => ({
      x: acc.x + object.position[0] / scoped.length,
      z: acc.z + object.position[2] / scoped.length,
    }),
    { x: 0, z: 0 },
  )

  // Radius large enough that neighbours on the ring do not touch.
  const widest = Math.max(
    ...scoped.map((object) => Math.max(object.dimensions.width, object.dimensions.depth)),
  )
  const spacingNeeded = (widest + 0.35) * scoped.length
  const radius = roundTo(Math.max(spacingNeeded / (2 * Math.PI), widest * 0.9), 3)

  const changes: LayoutChange[] = []
  scoped.forEach((object, i) => {
    const angle = (i / scoped.length) * Math.PI * 2
    const target: Vec3 = [
      centre.x + Math.cos(angle) * radius,
      object.position[1],
      centre.z + Math.sin(angle) * radius,
    ]
    // Yaw so local +Z (an asset's front) points back at the centre.
    const facing = Math.atan2(centre.x - target[0], centre.z - target[2])
    const rotation: Vec3 = [object.rotation[0], facing, object.rotation[2]]
    const position = clampToRoom(
      target,
      object.dimensions,
      object.scale,
      scene.environment.room,
      rotation,
    )

    const change = asChange(
      object,
      position,
      rotation,
      `placed on a ${radius} m circle facing the centre`,
    )
    if (change) changes.push(change)
  })

  return { strategy: 'circle_cluster', changes, skipped: lockedSkips(scene, options) }
}
