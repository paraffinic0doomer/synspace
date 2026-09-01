import type { Dimensions, RoomConfig, SceneObject, Vec3 } from '@/types'
import { clamp, distanceXZ, roundVec3 } from '@/utils'
import { DEFAULT_ROOM } from './environment'

/** Half-diagonal of the footprint once scale is applied. */
export function footprintRadius(dimensions: Dimensions, scale: Vec3): number {
  const w = (dimensions.width * scale[0]) / 2
  const d = (dimensions.depth * scale[2]) / 2
  return Math.hypot(w, d)
}

/** Clamps an XZ position so the object's footprint stays inside the room. */
export function clampToRoom(
  position: Vec3,
  dimensions: Dimensions,
  scale: Vec3,
  room: RoomConfig = DEFAULT_ROOM,
  rotation: Vec3 = [0, 0, 0],
): Vec3 {
  // Clamp against the rotated footprint's axis-aligned extent. Using the raw
  // width/depth here lets a 90° rotation near a wall escape the room whenever
  // the asset is not square.
  const halfWidth = Math.abs(dimensions.width * scale[0]) / 2
  const halfDepth = Math.abs(dimensions.depth * scale[2]) / 2
  const cos = Math.abs(Math.cos(rotation[1]))
  const sin = Math.abs(Math.sin(rotation[1]))
  const marginX = halfWidth * cos + halfDepth * sin
  const marginZ = halfWidth * sin + halfDepth * cos
  const halfW = Math.max(room.width / 2 - marginX, 0)
  const halfD = Math.max(room.depth / 2 - marginZ, 0)
  return roundVec3([
    clamp(position[0], -halfW, halfW),
    Math.max(position[1], 0),
    clamp(position[2], -halfD, halfD),
  ])
}

/**
 * Finds an unoccupied spot for a newly added asset by walking outward along a
 * coarse spiral from the room centre, so adding five desks doesn't stack five
 * desks on the same coordinate.
 */
export function findSpawnPosition(
  existing: SceneObject[],
  dimensions: Dimensions,
  room: RoomConfig = DEFAULT_ROOM,
): Vec3 {
  const radius = footprintRadius(dimensions, [1, 1, 1])
  const step = 1.2
  const maxRings = 12

  for (let ring = 0; ring < maxRings; ring += 1) {
    const samples = ring === 0 ? 1 : ring * 8
    for (let i = 0; i < samples; i += 1) {
      const angle = (i / samples) * Math.PI * 2
      const candidate: Vec3 = [
        Math.cos(angle) * ring * step,
        0,
        Math.sin(angle) * ring * step,
      ]
      const placed = clampToRoom(candidate, dimensions, [1, 1, 1], room)
      const collides = existing.some((object) => {
        const other = footprintRadius(object.dimensions, object.scale)
        return distanceXZ(placed, object.position) < radius + other + 0.35
      })
      if (!collides) return placed
    }
  }

  return clampToRoom([0, 0, 0], dimensions, [1, 1, 1], room)
}
