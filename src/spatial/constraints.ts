import type {
  ConstraintViolation,
  Scene,
  SceneObject,
  SpatialConstraint,
} from '@/types'
import { roundTo, toDegrees } from '@/utils'
import {
  clearanceZone,
  corners,
  footprintGap,
  footprintOf,
  overlapDepth,
  polygonsOverlap,
  type Footprint,
  type Point2,
} from './geometry'
import {
  buildOccupancyGrid,
  freeRegions,
  widestPath,
  widthAt,
  worldToCell,
  type OccupancyGrid,
} from './occupancy'
import { boundaryViolations, zoneIntrusions } from './queries'

/**
 * Deterministic constraint evaluation.
 *
 * Given the same scene, this always returns the same violations in the same
 * order — the `check_constraints` tool and the `optimize_layout` before/after
 * comparison both depend on that.
 */

export interface ConstraintReport {
  ok: boolean
  checked: string[]
  violations: ConstraintViolation[]
  summary: {
    errors: number
    warnings: number
    info: number
  }
}

/** Objects that participate in spatial checks at all. */
const relevantObjects = (scene: Scene): SceneObject[] =>
  scene.objects.filter((object) => object.visible)

const appliesTo = (constraint: SpatialConstraint, object: SceneObject): boolean =>
  constraint.appliesTo.length === 0 || constraint.appliesTo.includes(object.type)

const at = (point: Point2): [number, number] => [roundTo(point.x, 2), roundTo(point.z, 2)]

const midpoint = (a: Footprint, b: Footprint): Point2 => ({
  x: (a.center.x + b.center.x) / 2,
  z: (a.center.z + b.center.z) / 2,
})

export function evaluateConstraints(scene: Scene): ConstraintReport {
  const enabled = scene.constraints.filter((constraint) => constraint.enabled)
  const objects = relevantObjects(scene)
  const footprints = new Map(objects.map((object) => [object.id, footprintOf(object)]))
  const violations: ConstraintViolation[] = []

  // The grid is shared by the walkway and egress checks; build it once, and
  // only when a constraint actually needs it.
  let grid: OccupancyGrid | null = null
  const getGrid = () => {
    grid ??= buildOccupancyGrid(objects, scene.environment.room)
    return grid
  }

  for (const constraint of enabled) {
    switch (constraint.kind) {
      case 'collision':
        violations.push(...checkCollisions(constraint, objects, footprints))
        break
      case 'object-spacing':
        violations.push(...checkSpacing(constraint, objects, footprints))
        break
      case 'entrance-clearance':
        violations.push(...checkEntrance(constraint, objects, footprints))
        break
      case 'walkway-width':
        violations.push(...checkWalkways(constraint, objects, getGrid()))
        break
      case 'exit-clearance':
        violations.push(...checkEgress(constraint, objects, getGrid()))
        break
      case 'alignment':
        violations.push(...checkAlignment(constraint, objects))
        break
      case 'boundary':
        violations.push(...checkBoundary(constraint, scene))
        break
      case 'zone-restriction':
        violations.push(...checkZoneRestrictions(constraint, scene))
        break
    }
  }

  const summary = {
    errors: violations.filter((v) => v.severity === 'error').length,
    warnings: violations.filter((v) => v.severity === 'warning').length,
    info: violations.filter((v) => v.severity === 'info').length,
  }

  return {
    ok: summary.errors === 0 && summary.warnings === 0,
    checked: enabled.map((constraint) => constraint.id),
    violations,
    summary,
  }
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/** Overlapping footprints. Chairs tucked under desks are expected, so that pair is exempt. */
function checkCollisions(
  constraint: SpatialConstraint,
  objects: SceneObject[],
  footprints: Map<string, Footprint>,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = []

  for (let i = 0; i < objects.length; i += 1) {
    for (let j = i + 1; j < objects.length; j += 1) {
      const a = objects[i]
      const b = objects[j]
      if (!appliesTo(constraint, a) && !appliesTo(constraint, b)) continue
      if (isTuckedPair(a, b)) continue

      const fa = footprints.get(a.id)!
      const fb = footprints.get(b.id)!
      if (!polygonsOverlap(corners(fa), corners(fb))) continue

      const depth = overlapDepth(fa, fb)
      violations.push({
        constraintId: constraint.id,
        kind: 'collision',
        severity: constraint.severity,
        message: `${a.label} overlaps ${b.label} by ${roundTo(depth, 2)} m`,
        objectIds: [a.id, b.id],
        measured: roundTo(depth, 3),
        required: 0,
        at: at(midpoint(fa, fb)),
      })
    }
  }

  return violations
}

/**
 * Ground surfaces are laid *under* other objects by design.
 *
 * A vehicle parked on a road is the intended arrangement, not an overlap, so
 * surfaces are exempt from collision and spacing entirely.
 */
const SURFACE_TYPES: ReadonlyArray<SceneObject['type']> = ['road']

export const isSurfaceType = (type: SceneObject['type']): boolean =>
  SURFACE_TYPES.includes(type)

/**
 * Seating is meant to tuck into worksurfaces, so a chair overlapping a desk or
 * table is a correct layout, not a collision.
 */
function isTuckedPair(a: SceneObject, b: SceneObject): boolean {
  const pair = [a.type, b.type]
  if (pair.some(isSurfaceType)) return true
  return (
    pair.includes('chair') &&
    (pair.includes('desk') || pair.includes('meeting-table') || pair.includes('cafe-table'))
  )
}

/** Minimum clear gap between objects the rule applies to. */
function checkSpacing(
  constraint: SpatialConstraint,
  objects: SceneObject[],
  footprints: Map<string, Footprint>,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = []
  const subjects = objects.filter(
    (object) => appliesTo(constraint, object) && !isSurfaceType(object.type),
  )

  for (let i = 0; i < subjects.length; i += 1) {
    for (let j = i + 1; j < subjects.length; j += 1) {
      const a = subjects[i]
      const b = subjects[j]
      const fa = footprints.get(a.id)!
      const fb = footprints.get(b.id)!

      // Overlaps are the collision rule's business, not spacing's.
      if (polygonsOverlap(corners(fa), corners(fb))) continue

      const gap = footprintGap(fa, fb)
      if (gap >= constraint.value) continue

      violations.push({
        constraintId: constraint.id,
        kind: 'object-spacing',
        severity: constraint.severity,
        message: `${a.label} and ${b.label} are ${roundTo(gap, 2)} m apart, below the ${constraint.value} m minimum`,
        objectIds: [a.id, b.id],
        measured: roundTo(gap, 3),
        required: constraint.value,
        at: at(midpoint(fa, fb)),
      })
    }
  }

  return violations
}

/** Nothing may sit in a doorway's approach zone. */
function checkEntrance(
  constraint: SpatialConstraint,
  objects: SceneObject[],
  footprints: Map<string, Footprint>,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = []
  const doors = objects.filter((object) => object.type === 'door')

  for (const door of doors) {
    const zone = clearanceZone(footprints.get(door.id)!, constraint.value)

    for (const object of objects) {
      if (object.id === door.id || object.type === 'door') continue
      if (isSurfaceType(object.type)) continue // a road under a door is the point
      const footprint = footprints.get(object.id)!
      if (!polygonsOverlap(zone, corners(footprint))) continue

      violations.push({
        constraintId: constraint.id,
        kind: 'entrance-clearance',
        severity: constraint.severity,
        message: `${object.label} blocks the ${constraint.value} m approach to ${door.label}`,
        objectIds: [door.id, object.id],
        measured: 0,
        required: constraint.value,
        at: at(footprint.center),
      })
    }
  }

  return violations
}

/**
 * Circulation width: the widest route from each doorway to the middle of the
 * room. If the best available route still pinches below the threshold, the
 * floor plan has no adequate walkway.
 */
function checkWalkways(
  constraint: SpatialConstraint,
  objects: SceneObject[],
  grid: OccupancyGrid,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = []
  const doors = objects.filter((object) => object.type === 'door')
  if (doors.length === 0) return violations

  const centre: Point2 = { x: 0, z: 0 }

  for (const door of doors) {
    const start = approachPoint(door, grid)
    if (!start) continue

    const result = widestPath(grid, start, centre)
    if (!result.reachable) {
      violations.push({
        constraintId: constraint.id,
        kind: 'walkway-width',
        severity: constraint.severity,
        message: `No route at all from ${door.label} to the centre of the room`,
        objectIds: [door.id],
        measured: 0,
        required: constraint.value,
        at: at(start),
      })
      continue
    }

    if (result.width < constraint.value) {
      violations.push({
        constraintId: constraint.id,
        kind: 'walkway-width',
        severity: constraint.severity,
        message: `Widest route from ${door.label} to the room centre narrows to ${roundTo(result.width, 2)} m, below the ${constraint.value} m minimum`,
        objectIds: [door.id],
        measured: roundTo(result.width, 3),
        required: constraint.value,
        at: result.at ? at(result.at) : at(start),
      })
    }
  }

  return violations
}

/**
 * Egress: every meaningful pocket of floor must connect to a door at the
 * required width. A pocket that cannot is somewhere people could be trapped.
 */
function checkEgress(
  constraint: SpatialConstraint,
  objects: SceneObject[],
  grid: OccupancyGrid,
): ConstraintViolation[] {
  const doors = objects.filter((object) => object.type === 'door')
  if (doors.length === 0) return []

  const regions = freeRegions(grid, constraint.value)
  if (regions.length === 0) return []

  const doorPoints = doors
    .map((door) => ({ door, point: approachPoint(door, grid) }))
    .filter((entry): entry is { door: SceneObject; point: Point2 } => entry.point !== null)
  if (doorPoints.length === 0) return []

  const violations: ConstraintViolation[] = []
  const MIN_REPORTABLE_AREA = 1.5 // m² — ignore slivers between furniture

  for (const region of regions) {
    if (region.areaSqm < MIN_REPORTABLE_AREA) continue

    const escapes = doorPoints.some(({ point }) => {
      const result = widestPath(grid, region.representative, point)
      return result.reachable && result.width >= constraint.value
    })
    if (escapes) continue

    violations.push({
      constraintId: constraint.id,
      kind: 'exit-clearance',
      severity: constraint.severity,
      message: `A ${region.areaSqm} m² area of floor has no ${constraint.value} m egress route to any door`,
      objectIds: doors.map((door) => door.id),
      measured: 0,
      required: constraint.value,
      at: at(region.representative),
    })
  }

  return violations
}

/** Furniture should sit square to the room. */
function checkAlignment(
  constraint: SpatialConstraint,
  objects: SceneObject[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = []

  for (const object of objects) {
    if (!appliesTo(constraint, object)) continue
    // Distance from the nearest multiple of 90 degrees, in 0..45.
    const degrees = toDegrees(object.rotation[1])
    const withinQuarter = ((degrees % 90) + 90) % 90
    const deviation = Math.min(withinQuarter, 90 - withinQuarter)
    if (deviation <= constraint.value) continue

    violations.push({
      constraintId: constraint.id,
      kind: 'alignment',
      severity: constraint.severity,
      message: `${object.label} is ${roundTo(deviation, 1)}° off a right angle`,
      objectIds: [object.id],
      measured: roundTo(deviation, 2),
      required: constraint.value,
      at: [roundTo(object.position[0], 2), roundTo(object.position[2], 2)],
    })
  }

  return violations
}

/**
 * Objects that are not fully inside the world.
 *
 * Placement clamps, so these only appear when the room is shrunk under objects
 * that were legal before — precisely the case that must not pass silently.
 */
function checkBoundary(constraint: SpatialConstraint, scene: Scene): ConstraintViolation[] {
  return boundaryViolations(scene).map((check) => {
    const object = scene.objects.find((candidate) => candidate.id === check.objectId)
    return {
      constraintId: constraint.id,
      kind: 'boundary' as const,
      severity: constraint.severity,
      message:
        check.status === 'outside'
          ? `${check.label} sits outside the room boundary`
          : `${check.label} overhangs the room boundary by ${check.overshoot} m`,
      objectIds: [check.objectId],
      measured: check.overshoot,
      required: 0,
      at: object
        ? ([roundTo(object.position[0], 2), roundTo(object.position[2], 2)] as [number, number])
        : undefined,
    }
  })
}

/** Assets standing in a zone that forbids their type. */
function checkZoneRestrictions(
  constraint: SpatialConstraint,
  scene: Scene,
): ConstraintViolation[] {
  return zoneIntrusions(scene).map(({ zone, object }) => ({
    constraintId: constraint.id,
    kind: 'zone-restriction' as const,
    severity: constraint.severity,
    message: `${object.label} is not permitted in ${zone.name}`,
    objectIds: [object.id],
    measured: 1,
    required: 0,
    at: [roundTo(object.position[0], 2), roundTo(object.position[2], 2)] as [number, number],
  }))
}

/**
 * A walkable cell just inside the room from a doorway.
 *
 * The door's own cell is usually on the wall line, so step inward along the
 * door's facing axis until a free cell is found.
 */
function approachPoint(door: SceneObject, grid: OccupancyGrid): Point2 | null {
  const angle = door.rotation[1]
  const forward = { x: Math.sin(angle), z: Math.cos(angle) }
  const origin: Point2 = { x: door.position[0], z: door.position[2] }

  for (const sign of [-1, 1]) {
    for (let step = 1; step <= 8; step += 1) {
      const distance = step * grid.cellSize * 2
      const candidate: Point2 = {
        x: origin.x + forward.x * distance * sign,
        z: origin.z + forward.z * distance * sign,
      }
      const { col, row } = worldToCell(grid, candidate)
      if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) continue
      if (grid.blocked[row * grid.cols + col]) continue
      if (widthAt(grid, col, row) <= 0) continue
      return candidate
    }
  }

  return null
}
