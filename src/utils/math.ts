import type { Vec3 } from '@/types'

export const DEG = 180 / Math.PI
export const RAD = Math.PI / 180

export const toDegrees = (radians: number): number => radians * DEG
export const toRadians = (degrees: number): number => degrees * RAD

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** Rounds to a fixed number of decimals, avoiding `-0` and float fuzz. */
export function roundTo(value: number, decimals = 3): number {
  const factor = 10 ** decimals
  const rounded = Math.round(value * factor) / factor
  return Object.is(rounded, -0) ? 0 : rounded
}

/** Snaps a value to the nearest multiple of `step` (no-op when step <= 0). */
export const snap = (value: number, step: number): number =>
  step > 0 ? Math.round(value / step) * step : value

export const roundVec3 = (v: Vec3, decimals = 3): Vec3 => [
  roundTo(v[0], decimals),
  roundTo(v[1], decimals),
  roundTo(v[2], decimals),
]

export const snapVec3 = (v: Vec3, step: number): Vec3 => [
  roundTo(snap(v[0], step)),
  roundTo(snap(v[1], step)),
  roundTo(snap(v[2], step)),
]

/** Normalises an angle into (-PI, PI]. */
export function normalizeAngle(radians: number): number {
  const twoPi = Math.PI * 2
  let a = radians % twoPi
  if (a > Math.PI) a -= twoPi
  if (a <= -Math.PI) a += twoPi
  return roundTo(a, 5)
}

export const distanceXZ = (a: Vec3, b: Vec3): number =>
  Math.hypot(a[0] - b[0], a[2] - b[2])
