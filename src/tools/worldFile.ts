import type { SceneObject, Vec3, World, Zone } from '@/types'
import { ENVIRONMENT_LIMITS } from './environment'

/**
 * Reading and writing a world as a file.
 *
 * Distinct from `state/persistence.ts` on purpose. That module round-trips data
 * *we* wrote moments ago, so a shape check is enough. A file comes from
 * somewhere else — another machine, another build, a hand edit, a download that
 * truncated — so everything here treats its input as untrusted and refuses
 * rather than repairs.
 *
 * Refusing beats repairing for the same reason `loadPersistedWorld` discards a
 * version it does not recognise: a world that half-loads looks like it worked,
 * and the missing half only surfaces later as a constraint report that makes no
 * sense.
 */

export const WORLD_FILE_FORMAT = 'synspace.world'
/** Bumped when the world shape changes. A mismatch is refused, never migrated. */
export const WORLD_FILE_VERSION = 1
export const WORLD_FILE_EXTENSION = '.synspace.json'
/** A world past this is not a floor plan; it is something that went wrong. */
const MAX_FILE_BYTES = 8_000_000

export interface WorldFile {
  format: typeof WORLD_FILE_FORMAT
  version: number
  exportedAt: string
  /** Free-form provenance. Never trusted, only shown. */
  exportedFrom?: string
  world: World
}

export type ParseResult = { ok: true; world: World } | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export function serializeWorld(world: World): string {
  const payload: WorldFile = {
    format: WORLD_FILE_FORMAT,
    version: WORLD_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    exportedFrom: 'SynSpace',
    world,
  }
  return JSON.stringify(payload, null, 2)
}

/** A filename that sorts well and says what it is. */
export function worldFileName(world: World): string {
  const slug =
    world.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'world'
  const [date] = new Date().toISOString().split('T')
  return `${slug}-${date}${WORLD_FILE_EXTENSION}`
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber)

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

function checkObject(raw: unknown, index: number): string | null {
  const where = `objects[${index}]`
  if (!isRecord(raw)) return `${where} is not an object.`
  if (!isNonEmptyString(raw.id)) return `${where}.id must be a non-empty string.`
  if (!isNonEmptyString(raw.type)) return `${where}.type must be a non-empty string.`
  if (!isVec3(raw.position)) return `${where}.position must be three finite numbers.`
  if (!isVec3(raw.rotation)) return `${where}.rotation must be three finite numbers.`
  if (!isVec3(raw.scale)) return `${where}.scale must be three finite numbers.`
  if (!isRecord(raw.dimensions)) return `${where}.dimensions is missing.`
  const { width, height, depth } = raw.dimensions
  if (!isFiniteNumber(width) || !isFiniteNumber(height) || !isFiniteNumber(depth)) {
    return `${where}.dimensions must have finite width, height and depth.`
  }
  if (!isRecord(raw.metadata)) return `${where}.metadata is missing.`
  return null
}

function checkZone(raw: unknown, index: number): string | null {
  const where = `zones[${index}]`
  if (!isRecord(raw)) return `${where} is not an object.`
  if (!isNonEmptyString(raw.id)) return `${where}.id must be a non-empty string.`
  if (!isRecord(raw.bounds)) return `${where}.bounds is missing.`
  const { minX, maxX, minZ, maxZ } = raw.bounds
  if (![minX, maxX, minZ, maxZ].every(isFiniteNumber)) {
    return `${where}.bounds must have finite minX, maxX, minZ and maxZ.`
  }
  if (!Array.isArray(raw.disallowedTypes)) {
    return `${where}.disallowedTypes must be an array.`
  }
  return null
}

/**
 * Parses a world file, or explains precisely why it will not load.
 *
 * Messages name the failing path the way the tool layer's do, because the
 * person reading this is trying to work out whether their file is wrong or the
 * app is.
 */
export function parseWorldFile(text: string): ParseResult {
  if (text.length > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `That file is ${(text.length / 1_000_000).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1_000_000} MB.`,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' }
  }

  if (!isRecord(parsed)) return { ok: false, error: 'That file does not contain a world.' }

  if (parsed.format !== WORLD_FILE_FORMAT) {
    return {
      ok: false,
      error: 'That is not a SynSpace world file. Expected a file exported from the World inspector.',
    }
  }

  // Refuse rather than migrate. A file from a newer build may carry fields this
  // one drops on load, and a half-loaded world is worse than a clear refusal.
  if (parsed.version !== WORLD_FILE_VERSION) {
    return {
      ok: false,
      error: `That file is format version ${String(parsed.version)}; this build reads version ${WORLD_FILE_VERSION}.`,
    }
  }

  const world = parsed.world
  if (!isRecord(world)) return { ok: false, error: 'The file has no "world" section.' }
  if (!isNonEmptyString(world.id)) return { ok: false, error: 'world.id is missing.' }
  if (!isNonEmptyString(world.name)) return { ok: false, error: 'world.name is missing.' }
  if (!Array.isArray(world.objects)) return { ok: false, error: 'world.objects must be an array.' }
  if (!Array.isArray(world.zones)) return { ok: false, error: 'world.zones must be an array.' }
  if (!Array.isArray(world.constraints)) {
    return { ok: false, error: 'world.constraints must be an array.' }
  }
  if (!isRecord(world.metadata) || !isFiniteNumber(world.metadata.revision)) {
    return { ok: false, error: 'world.metadata.revision is missing.' }
  }

  if (!isRecord(world.environment) || !isRecord(world.environment.room)) {
    return { ok: false, error: 'world.environment.room is missing.' }
  }
  const room = world.environment.room
  const [minW, maxW] = ENVIRONMENT_LIMITS.roomWidth
  const [minD, maxD] = ENVIRONMENT_LIMITS.roomDepth
  if (!isFiniteNumber(room.width) || room.width < minW || room.width > maxW) {
    return { ok: false, error: `world.environment.room.width must be between ${minW} and ${maxW} m.` }
  }
  if (!isFiniteNumber(room.depth) || room.depth < minD || room.depth > maxD) {
    return { ok: false, error: `world.environment.room.depth must be between ${minD} and ${maxD} m.` }
  }

  for (let index = 0; index < world.objects.length; index += 1) {
    const problem = checkObject(world.objects[index], index)
    if (problem) return { ok: false, error: problem }
  }
  for (let index = 0; index < world.zones.length; index += 1) {
    const problem = checkZone(world.zones[index], index)
    if (problem) return { ok: false, error: problem }
  }

  // Ids have to be unique: the store addresses objects by id, and a duplicate
  // would make every lookup ambiguous rather than merely wrong.
  const ids = new Set<string>()
  for (const object of world.objects as SceneObject[]) {
    if (ids.has(object.id)) {
      return { ok: false, error: `Duplicate object id "${object.id}".` }
    }
    ids.add(object.id)
  }

  const zoneIds = new Set<string>()
  for (const zone of world.zones as Zone[]) {
    if (zoneIds.has(zone.id)) return { ok: false, error: `Duplicate zone id "${zone.id}".` }
    zoneIds.add(zone.id)
  }

  if (world.assetLibrary !== undefined && !Array.isArray(world.assetLibrary)) {
    return { ok: false, error: 'world.assetLibrary must be an array when present.' }
  }

  return { ok: true, world: world as unknown as World }
}

// ---------------------------------------------------------------------------
// Browser plumbing
// ---------------------------------------------------------------------------

/** Hands the file to the browser's download flow. */
export function downloadWorld(world: World): string {
  const name = worldFileName(world)
  const blob = new Blob([serializeWorld(world)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  // Revoking immediately can cancel the download in some browsers; a tick is
  // enough for the navigation to have been claimed.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return name
}

/** True when a drag carries something we could plausibly open. */
export function dragHasFile(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}
