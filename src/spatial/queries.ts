import type {
  BoundaryCheck,
  BoundaryStatus,
  Rect2,
  SceneObject,
  SpatialRelationship,
  World,
  WorldBounds,
  Zone,
} from '@/types'
import { roundTo } from '@/utils'
import {
  bounds as footprintBounds,
  clearanceZone,
  corners,
  footprintGap,
  footprintOf,
  polygonsOverlap,
  type Footprint,
  type Point2,
} from './geometry'
import { buildOccupancyGrid, widestPath } from './occupancy'

/**
 * Reusable spatial queries over the world.
 *
 * Every function here is pure and deterministic: the same world always yields
 * the same answer, ties are broken by a stable rule (never by array order that
 * could change), and nothing reaches into the store or the renderer. The
 * inspector, the constraint evaluator and the WebMCP layer all read through
 * these rather than reimplementing geometry.
 */

/** Distance-based relations use these thresholds, in metres. */
export const NEAR_RADIUS = 2.0
export const ADJACENT_GAP = 0.2

// ---------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------

export function worldBounds(world: World): WorldBounds {
  const { room } = world.environment
  return {
    outer: {
      minX: -room.width / 2,
      maxX: room.width / 2,
      minZ: -room.depth / 2,
      maxZ: room.depth / 2,
    },
    width: room.width,
    depth: room.depth,
    wallHeight: room.wallHeight,
  }
}

export const rectContainsPoint = (rect: Rect2, point: Point2): boolean =>
  point.x >= rect.minX && point.x <= rect.maxX && point.z >= rect.minZ && point.z <= rect.maxZ

export const rectContainsRect = (outer: Rect2, inner: Rect2): boolean =>
  inner.minX >= outer.minX &&
  inner.maxX <= outer.maxX &&
  inner.minZ >= outer.minZ &&
  inner.maxZ <= outer.maxZ

export const rectsOverlap = (a: Rect2, b: Rect2): boolean =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ

export const rectCentre = (rect: Rect2): Point2 => ({
  x: (rect.minX + rect.maxX) / 2,
  z: (rect.minZ + rect.maxZ) / 2,
})

/** Axis-aligned floor bounds of an object, after rotation and scale. */
export const objectBounds = (object: SceneObject): Rect2 => footprintBounds(footprintOf(object))

/** How far, if at all, an object pokes past the world boundary. */
export function boundaryStatusOf(world: World, object: SceneObject): BoundaryCheck {
  const outer = worldBounds(world).outer
  const box = objectBounds(object)

  const overshoot = Math.max(
    outer.minX - box.minX,
    box.maxX - outer.maxX,
    outer.minZ - box.minZ,
    box.maxZ - outer.maxZ,
    0,
  )

  const centre = { x: object.position[0], z: object.position[2] }
  let status: BoundaryStatus = 'inside'
  if (overshoot > 1e-6) {
    status = rectContainsPoint(outer, centre) ? 'straddling' : 'outside'
  }

  return { objectId: object.id, label: object.label, status, overshoot: roundTo(overshoot, 3) }
}

/**
 * Every object not fully inside the world.
 *
 * Placement clamps, so these only appear when the room is shrunk under objects
 * that were legal before — which is exactly the case that must not pass silently.
 */
export function boundaryViolations(world: World): BoundaryCheck[] {
  return world.objects
    .map((object) => boundaryStatusOf(world, object))
    .filter((check) => check.status !== 'inside')
    .sort((a, b) => b.overshoot - a.overshoot || (a.objectId < b.objectId ? -1 : 1))
}

/** Is this footprint entirely within the legal placement area? */
export const isWithinWorld = (world: World, object: SceneObject): boolean =>
  rectContainsRect(worldBounds(world).outer, objectBounds(object))

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

/**
 * The zone an object belongs to, decided by its centre point.
 *
 * Zones may overlap, so ties are broken deterministically: the smallest zone
 * wins (the more specific region), then the lower id. Never array order.
 */
export function zoneOf(world: World, object: SceneObject): Zone | null {
  const centre: Point2 = { x: object.position[0], z: object.position[2] }
  const candidates = world.zones.filter((zone) => rectContainsPoint(zone.bounds, centre))
  if (candidates.length === 0) return null

  return candidates.reduce((best, zone) => {
    const bestArea = area(best.bounds)
    const zoneArea = area(zone.bounds)
    if (zoneArea < bestArea) return zone
    if (zoneArea > bestArea) return best
    return zone.id < best.id ? zone : best
  })
}

const area = (rect: Rect2) => (rect.maxX - rect.minX) * (rect.maxZ - rect.minZ)

/** Objects whose centre falls in the given zone, in stable id order. */
export function objectsInZone(world: World, zoneId: string): SceneObject[] {
  const zone = world.zones.find((candidate) => candidate.id === zoneId)
  if (!zone) return []
  return world.objects
    .filter((object) => zoneOf(world, object)?.id === zone.id)
    .sort(stableById)
}

/** Objects of a type a zone forbids, that are nonetheless inside it. */
export function zoneIntrusions(world: World): { zone: Zone; object: SceneObject }[] {
  const intrusions: { zone: Zone; object: SceneObject }[] = []
  for (const zone of world.zones) {
    if (zone.disallowedTypes.length === 0) continue
    for (const object of objectsInZone(world, zone.id)) {
      if (zone.disallowedTypes.includes(object.type)) intrusions.push({ zone, object })
    }
  }
  return intrusions
}

// ---------------------------------------------------------------------------
// Distance and proximity
// ---------------------------------------------------------------------------

const stableById = (a: SceneObject, b: SceneObject) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Clear gap between two objects' footprints, in metres. 0 when they touch or overlap. */
export function distanceBetween(world: World, idA: string, idB: string): number | null {
  const a = world.objects.find((object) => object.id === idA)
  const b = world.objects.find((object) => object.id === idB)
  if (!a || !b) return null
  return roundTo(footprintGap(footprintOf(a), footprintOf(b)), 3)
}

/** Centre-to-centre distance on the floor plane. */
export function centreDistance(a: SceneObject, b: SceneObject): number {
  return roundTo(Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]), 3)
}

export const boundingBoxOverlap = (a: SceneObject, b: SceneObject): boolean =>
  rectsOverlap(objectBounds(a), objectBounds(b))

/** True footprint intersection (rotation-aware), not just bounding boxes. */
export const footprintsOverlap = (a: SceneObject, b: SceneObject): boolean =>
  polygonsOverlap(corners(footprintOf(a)), corners(footprintOf(b)))

export interface NeighbourResult {
  object: SceneObject
  /** Clear gap in metres. */
  gap: number
  centreDistance: number
}

/**
 * Nearest objects to a given one, closest first.
 * Ties break on id, so repeated calls agree.
 */
export function nearestObjects(world: World, id: string, limit = 5): NeighbourResult[] {
  const subject = world.objects.find((object) => object.id === id)
  if (!subject) return []
  const subjectFootprint = footprintOf(subject)

  return world.objects
    .filter((object) => object.id !== id && object.visible)
    .map((object) => ({
      object,
      gap: roundTo(footprintGap(subjectFootprint, footprintOf(object)), 3),
      centreDistance: centreDistance(subject, object),
    }))
    .sort(
      (a, b) =>
        a.gap - b.gap ||
        a.centreDistance - b.centreDistance ||
        (a.object.id < b.object.id ? -1 : 1),
    )
    .slice(0, limit)
}

/** Objects whose centre lies within `radius` metres of a floor point. */
export function objectsWithinRadius(
  world: World,
  point: Point2,
  radius: number,
): NeighbourResult[] {
  return world.objects
    .filter((object) => object.visible)
    .map((object) => ({
      object,
      gap: roundTo(
        Math.hypot(object.position[0] - point.x, object.position[2] - point.z),
        3,
      ),
      centreDistance: roundTo(
        Math.hypot(object.position[0] - point.x, object.position[2] - point.z),
        3,
      ),
    }))
    .filter((entry) => entry.gap <= radius)
    .sort((a, b) => a.gap - b.gap || (a.object.id < b.object.id ? -1 : 1))
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export interface PathClearance {
  reachable: boolean
  /** Narrowest width along the best route, in metres. */
  width: number
  route: Point2[]
  pinch: Point2 | null
}

/**
 * Widest corridor connecting two floor points.
 *
 * Delegates to the occupancy grid's maximum-bottleneck search, so this answers
 * "how wide is the tightest squeeze on the best available route", not merely
 * "is there a route".
 */
export function pathClearance(world: World, from: Point2, to: Point2): PathClearance {
  const grid = buildOccupancyGrid(
    world.objects.filter((object) => object.visible),
    world.environment.room,
  )
  const result = widestPath(grid, from, to)
  return {
    reachable: result.reachable,
    width: roundTo(result.width, 3),
    route: result.route,
    pinch: result.at,
  }
}

/** Doors tagged as an entrance, or all doors when none are tagged. */
export function entrances(world: World): SceneObject[] {
  const doors = world.objects.filter((object) => object.type === 'door' && object.visible)
  const tagged = doors.filter((door) => door.metadata.tags.includes('entrance'))
  return (tagged.length > 0 ? tagged : doors).sort(stableById)
}

/** Doors tagged as an emergency exit. */
export function emergencyExits(world: World): SceneObject[] {
  return world.objects
    .filter(
      (object) =>
        object.type === 'door' &&
        object.visible &&
        object.metadata.tags.includes('emergency-exit'),
    )
    .sort(stableById)
}

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

/**
 * Derived relationships for one object.
 *
 * Recomputed from geometry every time, so it can never disagree with the
 * scene. Ordered zone-first then by distance, for a stable readout.
 */
export function describeRelationships(world: World, id: string): SpatialRelationship[] {
  const subject = world.objects.find((object) => object.id === id)
  if (!subject) return []

  const relationships: SpatialRelationship[] = []
  const subjectFootprint = footprintOf(subject)

  // inside: which zone contains it
  const zone = zoneOf(world, subject)
  if (zone) {
    relationships.push({
      kind: 'inside',
      subjectId: id,
      objectId: zone.id,
      targetKind: 'zone',
      label: `inside ${zone.name}`,
    })
  }

  // connected_to: a door connects the zone it opens into
  if (subject.type === 'door' && zone) {
    relationships.push({
      kind: 'connected_to',
      subjectId: id,
      objectId: zone.id,
      targetKind: 'zone',
      label: `connects ${zone.name} to outside`,
    })
  }

  // blocks: does it sit in a doorway's clearance zone
  for (const door of world.objects) {
    if (door.type !== 'door' || door.id === id || !door.visible) continue
    const clearance = world.constraints.find((c) => c.kind === 'entrance-clearance')
    const depth = clearance?.value ?? 1.5
    if (!polygonsOverlap(clearanceZone(footprintOf(door), depth), corners(subjectFootprint))) {
      continue
    }
    relationships.push({
      kind: 'blocks',
      subjectId: id,
      objectId: door.id,
      targetKind: 'object',
      label: `blocks the approach to ${door.label}`,
    })
  }

  // adjacent_to / near
  for (const neighbour of nearestObjects(world, id, 12)) {
    const { object, gap } = neighbour
    if (gap <= ADJACENT_GAP) {
      relationships.push({
        kind: 'adjacent_to',
        subjectId: id,
        objectId: object.id,
        targetKind: 'object',
        label: `adjacent to ${object.label}`,
        distance: gap,
      })
    } else if (gap <= NEAR_RADIUS) {
      relationships.push({
        kind: 'near',
        subjectId: id,
        objectId: object.id,
        targetKind: 'object',
        label: `near ${object.label}`,
        distance: gap,
      })
    }
  }

  return relationships
}

export type { Footprint, Point2 }
