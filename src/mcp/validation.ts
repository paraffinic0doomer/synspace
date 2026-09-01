import type { AssetType, SceneObject, Vec3 } from '@/types'
import { ASSET_TYPES } from '@/tools'
import { toRadians } from '@/utils'
import { OPTIMIZE_STRATEGIES, type OptimizeStrategy } from '@/spatial'
import { ENVIRONMENT_PRESET_NAMES } from '@/tools'
import type { EnvironmentPreset } from '@/types'

/**
 * Input validation for the tool layer.
 *
 * Tool arguments arrive from a language model, so they are treated as hostile:
 * every value is checked here before it reaches a state action. Nothing throws
 * across the boundary — failures come back as `Invalid` and become structured
 * tool errors, so a malformed call can never leave the scene half-modified.
 */

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string }

export const valid = <T>(value: T): Validated<T> => ({ ok: true, value })
export const invalid = <T = never>(error: string): Validated<T> => ({ ok: false, error })

/** Coordinates beyond this are certainly a mistake, not a very large room. */
export const COORDINATE_LIMIT = 500

export function asRecord(input: unknown): Validated<Record<string, unknown>> {
  if (input === null || input === undefined) return valid({})
  if (typeof input !== 'object' || Array.isArray(input)) {
    return invalid('Arguments must be an object.')
  }
  return valid(input as Record<string, unknown>)
}

export function requireNumber(
  args: Record<string, unknown>,
  key: string,
  { min = -COORDINATE_LIMIT, max = COORDINATE_LIMIT, fallback }: { min?: number; max?: number; fallback?: number } = {},
): Validated<number> {
  const raw = args[key]
  if (raw === undefined || raw === null) {
    if (fallback !== undefined) return valid(fallback)
    return invalid(`"${key}" is required.`)
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return invalid(`"${key}" must be a finite number, received ${JSON.stringify(raw)}.`)
  }
  if (raw < min || raw > max) {
    return invalid(`"${key}" must be between ${min} and ${max}, received ${raw}.`)
  }
  return valid(raw)
}

export function requireString(
  args: Record<string, unknown>,
  key: string,
  { optional = false }: { optional?: boolean } = {},
): Validated<string | undefined> {
  const raw = args[key]
  if (raw === undefined || raw === null) {
    return optional ? valid(undefined) : invalid(`"${key}" is required.`)
  }
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return invalid(`"${key}" must be a non-empty string.`)
  }
  return valid(raw)
}

export function requireAssetType(args: Record<string, unknown>, key = 'model_type'): Validated<AssetType> {
  const raw = args[key]
  if (typeof raw !== 'string') {
    return invalid(`"${key}" is required and must be one of: ${ASSET_TYPES.join(', ')}.`)
  }
  const normalised = raw.trim().toLowerCase().replace(/[\s_]+/g, '-')
  if (!(ASSET_TYPES as string[]).includes(normalised)) {
    return invalid(`Unknown model_type "${raw}". Valid types: ${ASSET_TYPES.join(', ')}.`)
  }
  return valid(normalised as AssetType)
}

/** Resolves an object id against the live scene, so tools never act on a ghost. */
export function requireObject(
  objects: SceneObject[],
  args: Record<string, unknown>,
  key = 'object_id',
): Validated<SceneObject> {
  const id = requireString(args, key)
  if (!id.ok) return invalid(id.error)

  const object = objects.find((candidate) => candidate.id === id.value)
  if (!object) {
    const known = objects.slice(0, 8).map((o) => o.id)
    return invalid(
      `No object with id "${id.value}". ${
        objects.length === 0
          ? 'The scene is empty.'
          : `Known ids include: ${known.join(', ')}${objects.length > known.length ? ', …' : ''}`
      }`,
    )
  }
  return valid(object)
}

/**
 * Rotation, accepted as degrees.
 *
 * A model writes `90` far more reliably than `1.5708`, so the tool surface is
 * in degrees and converts to the radians the scene model stores. Either a
 * single yaw number or a full [x, y, z] triple is accepted.
 */
export function requireRotation(
  args: Record<string, unknown>,
  key = 'rotation',
  { optional = false }: { optional?: boolean } = {},
): Validated<Vec3 | undefined> {
  const raw = args[key]
  if (raw === undefined || raw === null) {
    return optional ? valid(undefined) : invalid(`"${key}" is required.`)
  }

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return invalid(`"${key}" must be a finite number of degrees.`)
    return valid([0, toRadians(raw), 0])
  }

  if (Array.isArray(raw)) {
    if (raw.length !== 3) return invalid(`"${key}" array must have exactly 3 entries [x, y, z] in degrees.`)
    if (!raw.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return invalid(`"${key}" array entries must all be finite numbers of degrees.`)
    }
    return valid(raw.map((n) => toRadians(n as number)) as Vec3)
  }

  return invalid(`"${key}" must be a number of degrees or a [x, y, z] array of degrees.`)
}

/** Position from discrete x / y / z arguments; y defaults to the floor. */
export function requirePosition(
  args: Record<string, unknown>,
  { optional = false }: { optional?: boolean } = {},
): Validated<Vec3 | undefined> {
  const hasAny = ['x', 'y', 'z'].some((key) => args[key] !== undefined && args[key] !== null)
  if (!hasAny) {
    return optional ? valid(undefined) : invalid('"x" and "z" are required.')
  }

  const x = requireNumber(args, 'x', { fallback: optional ? 0 : undefined })
  if (!x.ok) return invalid(x.error)
  const y = requireNumber(args, 'y', { min: 0, max: 50, fallback: 0 })
  if (!y.ok) return invalid(y.error)
  const z = requireNumber(args, 'z', { fallback: optional ? 0 : undefined })
  if (!z.ok) return invalid(z.error)

  return valid([x.value, y.value, z.value])
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

export function requireColor(args: Record<string, unknown>, key = 'color'): Validated<string | undefined> {
  const raw = args[key]
  if (raw === undefined || raw === null) return valid(undefined)
  if (typeof raw !== 'string' || !HEX_COLOR.test(raw)) {
    return invalid(`"${key}" must be a 6-digit hex colour such as "#4f8cff".`)
  }
  return valid(raw)
}

export function requireStrategy(args: Record<string, unknown>, key = 'strategy'): Validated<OptimizeStrategy> {
  const raw = args[key]
  if (typeof raw !== 'string' || !(OPTIMIZE_STRATEGIES as readonly string[]).includes(raw)) {
    return invalid(`"${key}" must be one of: ${OPTIMIZE_STRATEGIES.join(', ')}.`)
  }
  return valid(raw as OptimizeStrategy)
}

export function requirePreset(args: Record<string, unknown>, key = 'preset'): Validated<EnvironmentPreset> {
  const raw = args[key]
  if (typeof raw !== 'string') {
    return invalid(`"${key}" must be one of: ${ENVIRONMENT_PRESET_NAMES.join(', ')}.`)
  }
  const normalised = raw.trim().toLowerCase()
  if (!(ENVIRONMENT_PRESET_NAMES as string[]).includes(normalised)) {
    return invalid(`Unknown preset "${raw}". Valid presets: ${ENVIRONMENT_PRESET_NAMES.join(', ')}.`)
  }
  return valid(normalised as EnvironmentPreset)
}

export function optionalIdList(
  args: Record<string, unknown>,
  key = 'object_ids',
): Validated<string[] | undefined> {
  const raw = args[key]
  if (raw === undefined || raw === null) return valid(undefined)
  if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== 'string')) {
    return invalid(`"${key}" must be an array of object id strings.`)
  }
  return valid(raw as string[])
}
