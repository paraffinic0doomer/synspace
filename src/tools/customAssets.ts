import type {
  ActorRef,
  AssetCategory,
  AssetPart,
  AssetType,
  CustomAssetDefinition,
  Dimensions,
  PartFinish,
  PartShape,
  Vec3,
  World,
} from '@/types'
import { roundTo } from '@/utils'

/**
 * Asset kinds defined at runtime.
 *
 * The built-in kit costs three code edits per asset — a component, a catalogue
 * entry and a union member — which makes "add a tree" a rebuild. An asset is
 * really just a handful of positioned solids, so it can be described as data
 * instead, and then an agent can extend the catalogue itself.
 *
 * The world document owns these (`World.assetLibrary`). This module keeps a
 * derived lookup so the catalogue, the renderer and the tool layer can resolve
 * a type without threading the world through every call. It is a cache of the
 * document, never a second source of truth: `syncCustomAssets` replaces it
 * wholesale whenever the world changes.
 */

export const PART_SHAPES: PartShape[] = ['box', 'cylinder', 'sphere', 'cone']
export const PART_FINISHES: PartFinish[] = ['matte', 'soft', 'satin', 'metallic']

/** Enough to describe a bus shelter or a fountain; not enough to hang the renderer. */
export const MAX_PARTS = 24
const MAX_PART_SIZE = 60
const MIN_PART_SIZE = 0.01
const MAX_OFFSET = 60
const TYPE_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

const registry = new Map<string, CustomAssetDefinition>()

/** Replaces the lookup with the library the given world carries. */
export function syncCustomAssets(world: Pick<World, 'assetLibrary'>): void {
  registry.clear()
  for (const definition of world.assetLibrary ?? []) {
    registry.set(definition.type, definition)
  }
}

export const getCustomAsset = (type: AssetType): CustomAssetDefinition | undefined =>
  registry.get(type)

export const customAssetTypes = (): AssetType[] => Array.from(registry.keys()).sort()

export const customAssetDefinitions = (): CustomAssetDefinition[] =>
  customAssetTypes().map((type) => registry.get(type)!)

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const halfExtents = (part: AssetPart): Vec3 => {
  const [w, h, d] = part.size
  // A rotated part sweeps a wider box than its own size. Rather than doing the
  // full oriented-bounds maths, take the largest horizontal extent for both
  // axes: the footprint may come out generous, but it is never too small, and
  // an undersized footprint would let objects overlap without the collision
  // check noticing.
  const rotated = Boolean(part.rotation && part.rotation.some((angle: number) => Math.abs(angle) > 1e-6))
  const horizontal = rotated ? Math.max(w, h, d) / 2 : 0
  return [
    Math.max(w / 2, horizontal),
    rotated ? Math.max(w, h, d) / 2 : h / 2,
    Math.max(d / 2, horizontal),
  ]
}

/**
 * The overall size of a composed asset, in metres.
 *
 * Derived rather than declared, so a custom asset cannot lie about how much
 * room it takes: collision, spacing, clearance and the occupancy grid all read
 * these dimensions, and they must match what is actually drawn.
 */
export function partsBounds(parts: AssetPart[]): Dimensions {
  if (parts.length === 0) return { width: 1, height: 1, depth: 1 }

  let halfWidth = 0
  let halfDepth = 0
  let top = 0

  for (const part of parts) {
    const [hx, hy, hz] = halfExtents(part)
    halfWidth = Math.max(halfWidth, Math.abs(part.position[0]) + hx)
    halfDepth = Math.max(halfDepth, Math.abs(part.position[2]) + hz)
    top = Math.max(top, part.position[1] + hy)
  }

  return {
    width: roundTo(Math.max(halfWidth * 2, MIN_PART_SIZE), 3),
    height: roundTo(Math.max(top, MIN_PART_SIZE), 3),
    depth: roundTo(Math.max(halfDepth * 2, MIN_PART_SIZE), 3),
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const HEX = /^#[0-9a-fA-F]{6}$/

const isVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && Number.isFinite(n))

/** Parses one part, returning either the part or the reason it was rejected. */
function parsePart(raw: unknown, index: number): { part: AssetPart } | { error: string } {
  const where = `parts[${index}]`
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: `${where} must be an object.` }
  }
  const value = raw as Record<string, unknown>

  const shape = value.shape
  if (typeof shape !== 'string' || !PART_SHAPES.includes(shape as PartShape)) {
    return { error: `${where}.shape must be one of: ${PART_SHAPES.join(', ')}.` }
  }

  if (!isVec3(value.size)) {
    return { error: `${where}.size must be [width, height, depth] in metres.` }
  }
  if (value.size.some((n) => n < MIN_PART_SIZE || n > MAX_PART_SIZE)) {
    return {
      error: `${where}.size must be between ${MIN_PART_SIZE} and ${MAX_PART_SIZE} metres on every axis.`,
    }
  }

  if (!isVec3(value.position)) {
    return { error: `${where}.position must be [x, y, z] in metres from the asset origin.` }
  }
  if (value.position.some((n) => Math.abs(n) > MAX_OFFSET)) {
    return { error: `${where}.position must be within ${MAX_OFFSET} metres of the asset origin.` }
  }

  if (value.rotation !== undefined && !isVec3(value.rotation)) {
    return { error: `${where}.rotation must be [x, y, z] in radians.` }
  }
  if (value.color !== undefined && (typeof value.color !== 'string' || !HEX.test(value.color))) {
    return { error: `${where}.color must be a 6-digit hex colour such as "#4f8cff".` }
  }
  if (
    value.finish !== undefined &&
    (typeof value.finish !== 'string' || !PART_FINISHES.includes(value.finish as PartFinish))
  ) {
    return { error: `${where}.finish must be one of: ${PART_FINISHES.join(', ')}.` }
  }

  return {
    part: {
      shape: shape as PartShape,
      size: value.size,
      position: value.position,
      rotation: value.rotation as Vec3 | undefined,
      color: value.color as string | undefined,
      finish: value.finish as PartFinish | undefined,
    },
  }
}

export interface DefineAssetInput {
  type: string
  name: string
  category: AssetCategory
  description?: string
  color?: string
  clearance?: number
  parts: unknown
  signageHeight?: number
  definedBy?: ActorRef
}

/**
 * Turns a described asset into a definition, or explains why it cannot.
 *
 * Errors are written for an agent to act on: they name the field, say what was
 * expected, and never fail silently — a malformed part would otherwise become
 * an invisible object that still occupies floor space.
 */
export function buildCustomAsset(
  input: DefineAssetInput,
  reservedTypes: readonly string[],
): { definition: CustomAssetDefinition } | { error: string } {
  const type = input.type?.trim().toLowerCase()
  if (!type || !TYPE_PATTERN.test(type)) {
    return {
      error: `"type" must be lowercase kebab-case, such as "tree" or "bus-shelter". Received ${JSON.stringify(input.type)}.`,
    }
  }
  if (reservedTypes.includes(type)) {
    return {
      error: `"${type}" is a built-in asset kind and cannot be redefined. Choose another name, or place the built-in one and resize it.`,
    }
  }

  const name = input.name?.trim()
  if (!name) return { error: '"name" is required — it is what a person sees in the library.' }

  if (!Array.isArray(input.parts) || input.parts.length === 0) {
    return { error: '"parts" must be a non-empty array of primitive solids.' }
  }
  if (input.parts.length > MAX_PARTS) {
    return { error: `"parts" may hold at most ${MAX_PARTS} solids, received ${input.parts.length}.` }
  }

  const parts: AssetPart[] = []
  for (let index = 0; index < input.parts.length; index += 1) {
    const parsed = parsePart(input.parts[index], index)
    if ('error' in parsed) return { error: parsed.error }
    parts.push(parsed.part)
  }

  const color = input.color?.trim()
  if (color && !HEX.test(color)) {
    return { error: `"color" must be a 6-digit hex colour such as "#4f8cff". Received ${color}.` }
  }

  const dimensions = partsBounds(parts)

  return {
    definition: {
      type,
      name,
      category: input.category,
      description: input.description?.trim() || `${name}, defined at runtime from ${parts.length} solids.`,
      dimensions,
      defaultColor: color || '#8f9bb3',
      clearance:
        input.clearance === undefined
          ? roundTo(Math.min(Math.max(dimensions.width, dimensions.depth) * 0.25, 2), 2)
          : Math.max(0, Math.min(input.clearance, 10)),
      parts,
      signageHeight: input.signageHeight,
      definedBy: input.definedBy,
    },
  }
}
