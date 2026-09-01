import type { SceneObject } from '@/types'

/**
 * 2D floor geometry.
 *
 * Everything spatial reasoning needs is a top-down problem: objects become
 * oriented rectangles on the XZ plane. Pure functions, no state, no renderer —
 * deterministic for the same input, which is what the constraint checks and
 * layout strategies rely on.
 */

export interface Point2 {
  x: number
  z: number
}

/** An object's footprint as an oriented rectangle. */
export interface Footprint {
  id: string
  center: Point2
  /** Half-extents along the rectangle's own axes, after scale. */
  halfWidth: number
  halfDepth: number
  /** Yaw in radians. */
  angle: number
}

export const footprintOf = (object: SceneObject): Footprint => ({
  id: object.id,
  center: { x: object.position[0], z: object.position[2] },
  halfWidth: Math.abs(object.dimensions.width * object.scale[0]) / 2,
  halfDepth: Math.abs(object.dimensions.depth * object.scale[2]) / 2,
  angle: object.rotation[1],
})

/** The four corners, counter-clockwise, in world space. */
export function corners(footprint: Footprint): Point2[] {
  const cos = Math.cos(footprint.angle)
  const sin = Math.sin(footprint.angle)
  const { halfWidth: hw, halfDepth: hd, center } = footprint

  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([lx, lz]) => ({
    // Rotation about +Y maps local +X to (cos, -sin) in the XZ plane.
    x: center.x + lx * cos + lz * sin,
    z: center.z - lx * sin + lz * cos,
  }))
}

/** Axis-aligned bounds of a footprint, useful for cheap broad-phase rejects. */
export function bounds(footprint: Footprint) {
  const points = corners(footprint)
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minZ: Math.min(...points.map((p) => p.z)),
    maxZ: Math.max(...points.map((p) => p.z)),
  }
}

const EPSILON = 1e-9

/** Separating-axis test for two convex polygons. */
export function polygonsOverlap(a: Point2[], b: Point2[]): boolean {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i += 1) {
      const p1 = polygon[i]
      const p2 = polygon[(i + 1) % polygon.length]
      // Outward normal of this edge.
      const axis = { x: -(p2.z - p1.z), z: p2.x - p1.x }
      const length = Math.hypot(axis.x, axis.z)
      if (length < EPSILON) continue
      axis.x /= length
      axis.z /= length

      const projA = project(a, axis)
      const projB = project(b, axis)
      if (projA.max < projB.min - EPSILON || projB.max < projA.min - EPSILON) {
        return false
      }
    }
  }
  return true
}

function project(polygon: Point2[], axis: Point2) {
  let min = Infinity
  let max = -Infinity
  for (const point of polygon) {
    const value = point.x * axis.x + point.z * axis.z
    if (value < min) min = value
    if (value > max) max = value
  }
  return { min, max }
}

/** Shortest distance between two line segments in 2D. */
function segmentDistance(a1: Point2, a2: Point2, b1: Point2, b2: Point2): number {
  const d = pointSegmentDistance
  return Math.min(d(a1, b1, b2), d(a2, b1, b2), d(b1, a1, a2), d(b2, a1, a2))
}

export function pointSegmentDistance(p: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const lengthSq = dx * dx + dz * dz
  if (lengthSq < EPSILON) return Math.hypot(p.x - a.x, p.z - a.z)
  let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz))
}

/**
 * Exact clear gap between two footprints, in metres.
 * Returns 0 when they touch or overlap — use `polygonsOverlap` to tell those apart.
 */
export function footprintGap(a: Footprint, b: Footprint): number {
  const pa = corners(a)
  const pb = corners(b)
  if (polygonsOverlap(pa, pb)) return 0

  let min = Infinity
  for (let i = 0; i < pa.length; i += 1) {
    const a1 = pa[i]
    const a2 = pa[(i + 1) % pa.length]
    for (let j = 0; j < pb.length; j += 1) {
      const b1 = pb[j]
      const b2 = pb[(j + 1) % pb.length]
      const distance = segmentDistance(a1, a2, b1, b2)
      if (distance < min) min = distance
    }
  }
  return min
}

/** How deeply two overlapping footprints intersect, along the axis of least penetration. */
export function overlapDepth(a: Footprint, b: Footprint): number {
  const pa = corners(a)
  const pb = corners(b)
  if (!polygonsOverlap(pa, pb)) return 0

  let least = Infinity
  for (const polygon of [pa, pb]) {
    for (let i = 0; i < polygon.length; i += 1) {
      const p1 = polygon[i]
      const p2 = polygon[(i + 1) % polygon.length]
      const axis = { x: -(p2.z - p1.z), z: p2.x - p1.x }
      const length = Math.hypot(axis.x, axis.z)
      if (length < EPSILON) continue
      axis.x /= length
      axis.z /= length
      const projA = project(pa, axis)
      const projB = project(pb, axis)
      const depth = Math.min(projA.max - projB.min, projB.max - projA.min)
      if (depth < least) least = depth
    }
  }
  return least === Infinity ? 0 : Math.max(least, 0)
}

/** Unit vector from a to b; falls back to +X when the centres coincide. */
export function direction(a: Point2, b: Point2): Point2 {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const length = Math.hypot(dx, dz)
  if (length < EPSILON) return { x: 1, z: 0 }
  return { x: dx / length, z: dz / length }
}

/** Does a point sit inside a convex polygon? */
export function pointInPolygon(point: Point2, polygon: Point2[]): boolean {
  let sign = 0
  for (let i = 0; i < polygon.length; i += 1) {
    const p1 = polygon[i]
    const p2 = polygon[(i + 1) % polygon.length]
    const cross = (p2.x - p1.x) * (point.z - p1.z) - (p2.z - p1.z) * (point.x - p1.x)
    if (Math.abs(cross) < EPSILON) continue
    const next = cross > 0 ? 1 : -1
    if (sign === 0) sign = next
    else if (sign !== next) return false
  }
  return true
}

/** The rectangle a door needs kept clear, projected into the room. */
export function clearanceZone(door: Footprint, depth: number): Point2[] {
  const cos = Math.cos(door.angle)
  const sin = Math.sin(door.angle)
  const halfWidth = door.halfWidth * 1.1

  // Local +Z is the door's facing direction; extend the zone both ways so the
  // check holds whichever side of the wall the door was placed against.
  return [
    [-halfWidth, -depth],
    [halfWidth, -depth],
    [halfWidth, depth],
    [-halfWidth, depth],
  ].map(([lx, lz]) => ({
    x: door.center.x + lx * cos + lz * sin,
    z: door.center.z - lx * sin + lz * cos,
  }))
}
