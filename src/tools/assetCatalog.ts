import type {
  ActorRef,
  AssetCategory,
  AssetDefinition,
  Dimensions,
  AssetType,
  ObjectMetadata,
  SceneObject,
  Vec3,
} from '@/types'
import { HUMAN_ACTOR } from '@/types'
import { createId, roundTo, roundVec3 } from '@/utils'
import { customAssetDefinitions, customAssetTypes, getCustomAsset } from './customAssets'

/**
 * The single source of truth for what an asset *is*: its metadata, real-world
 * footprint and default styling. Both the asset library UI and the object
 * factory read from here, so a new asset kind is added in exactly one place.
 */
export const ASSET_DEFINITIONS: Record<AssetType, AssetDefinition> = {
  desk: {
    type: 'desk',
    name: 'Desk',
    category: 'Workstations',
    description: 'Single sit-stand workstation with cable tray.',
    dimensions: { width: 1.6, height: 0.75, depth: 0.8 },
    defaultColor: '#b98a5a',
    clearance: 0.9,
  },
  chair: {
    type: 'chair',
    name: 'Task Chair',
    category: 'Seating',
    description: 'Five-star castor base task chair.',
    dimensions: { width: 0.6, height: 1.05, depth: 0.6 },
    defaultColor: '#3f4c63',
    clearance: 0.6,
  },
  'meeting-table': {
    type: 'meeting-table',
    name: 'Meeting Table',
    category: 'Collaboration',
    description: 'Six-seat trestle table for team reviews.',
    dimensions: { width: 2.6, height: 0.75, depth: 1.2 },
    defaultColor: '#8a6a45',
    clearance: 1.2,
  },
  sofa: {
    type: 'sofa',
    name: 'Lounge Sofa',
    category: 'Seating',
    description: 'Three-seat soft seating for breakout areas.',
    dimensions: { width: 2.1, height: 0.82, depth: 0.92 },
    defaultColor: '#4c6b6b',
    clearance: 0.8,
  },
  plant: {
    type: 'plant',
    name: 'Planter',
    category: 'Ambience',
    description: 'Potted floor plant, low-poly foliage.',
    dimensions: { width: 0.62, height: 1.35, depth: 0.62 },
    defaultColor: '#3f8a54',
    clearance: 0.3,
  },
  partition: {
    type: 'partition',
    name: 'Partition',
    category: 'Structure',
    description: 'Free-standing acoustic divider panel.',
    dimensions: { width: 1.6, height: 1.5, depth: 0.1 },
    defaultColor: '#5b6478',
    clearance: 0.4,
  },
  'server-rack': {
    type: 'server-rack',
    name: 'Server Rack',
    category: 'Infrastructure',
    description: '42U enclosure with front status indicators.',
    dimensions: { width: 0.62, height: 2.0, depth: 1.0 },
    defaultColor: '#2b3040',
    clearance: 1.0,
  },
  door: {
    type: 'door',
    name: 'Door',
    category: 'Structure',
    description: 'Framed single-leaf doorway.',
    dimensions: { width: 0.95, height: 2.1, depth: 0.14 },
    defaultColor: '#9aa3b4',
    clearance: 1.1,
  },
  'storage-unit': {
    type: 'storage-unit',
    name: 'Storage Unit',
    category: 'Storage',
    description: 'Open shelving cabinet for supplies and archive boxes.',
    dimensions: { width: 1.0, height: 1.8, depth: 0.45 },
    defaultColor: '#6a5b4a',
    clearance: 0.9,
  },
  whiteboard: {
    type: 'whiteboard',
    name: 'Whiteboard',
    category: 'Collaboration',
    description: 'Mobile writing board for teaching and stand-ups.',
    dimensions: { width: 1.84, height: 1.9, depth: 0.5 },
    defaultColor: '#8f96a6',
    clearance: 1.2,
  },
  'cafe-table': {
    type: 'cafe-table',
    name: 'Cafe Table',
    category: 'Hospitality',
    description: 'Round two-seat table for cafes and waiting areas.',
    dimensions: { width: 0.8, height: 0.75, depth: 0.8 },
    defaultColor: '#a8734a',
    clearance: 0.9,
  },
  counter: {
    type: 'counter',
    name: 'Service Counter',
    category: 'Hospitality',
    description: 'Reception or service counter with a raised worktop.',
    dimensions: { width: 2.5, height: 1.12, depth: 0.72 },
    defaultColor: '#4c6b6b',
    clearance: 1.2,
  },
  'wall-segment': {
    type: 'wall-segment',
    name: 'Wall Segment',
    category: 'Structure',
    description: 'A length of interior wall for subdividing a floor.',
    dimensions: { width: 2.0, height: 2.6, depth: 0.22 },
    defaultColor: '#5b6478',
    clearance: 0.0,
  },
  barrier: {
    type: 'barrier',
    name: 'Barrier',
    category: 'Structure',
    description: 'Safety or queue barrier that closes a route without walling it off.',
    dimensions: { width: 1.6, height: 1.0, depth: 0.34 },
    defaultColor: '#f0b429',
    clearance: 0.6,
  },
  building: {
    type: 'building',
    name: 'Building',
    category: 'Urban',
    description: 'Urban block at street scale. Use in outdoor worlds.',
    dimensions: { width: 6, height: 8, depth: 6 },
    defaultColor: '#4a5468',
    clearance: 3.0,
  },
  hospital: {
    type: 'hospital',
    name: 'Hospital',
    category: 'Urban',
    description: 'Hospital block with an ambulance canopy and an identifying cross.',
    dimensions: { width: 8, height: 7, depth: 8 },
    defaultColor: '#e6ecf7',
    clearance: 4.0,
  },
  road: {
    type: 'road',
    name: 'Road',
    category: 'Urban',
    description: 'A length of carriageway. A surface, not an obstacle — routes run along it.',
    dimensions: { width: 4, height: 0.06, depth: 12 },
    defaultColor: '#2b3040',
    clearance: 0.0,
  },
  vehicle: {
    type: 'vehicle',
    name: 'Vehicle',
    category: 'Urban',
    description: 'Van-sized vehicle with a roof beacon.',
    dimensions: { width: 1.9, height: 1.9, depth: 4.0 },
    defaultColor: '#c9cfdb',
    clearance: 1.5,
  },
}

/** Stable ordering used by the asset library palette. */
/** The kinds that ship with the app. Runtime-defined kinds are not in here. */
export const BUILTIN_ASSET_TYPES = Object.keys(ASSET_DEFINITIONS) as AssetType[]

/**
 * Kept as the built-in list under its original name.
 *
 * Anything that needs the *placeable* set — validation, the library panel, the
 * tool descriptions — must call `allAssetTypes()` instead, because the
 * catalogue grows at runtime.
 */
export const ASSET_TYPES = BUILTIN_ASSET_TYPES

/** Every kind that can be placed right now: the built-in kit plus the world's own. */
export const allAssetTypes = (): AssetType[] => [...BUILTIN_ASSET_TYPES, ...customAssetTypes()]

export const allAssetDefinitions = (): AssetDefinition[] => [
  ...BUILTIN_ASSET_TYPES.map((type) => ASSET_DEFINITIONS[type]),
  ...customAssetDefinitions(),
]

export const isCustomAssetType = (type: AssetType): boolean => getCustomAsset(type) !== undefined

export const ASSET_CATEGORY_ORDER: AssetCategory[] = [
  'Workstations',
  'Seating',
  'Collaboration',
  'Hospitality',
  'Storage',
  'Infrastructure',
  'Structure',
  'Urban',
  'Ambience',
]

/**
 * The definition for a type, built-in or runtime-defined.
 *
 * Never throws. A world can reference a type whose definition has gone missing
 * — an older save, a hand-edited document — and the right answer there is a
 * plain one-metre placeholder that a person can see and delete, not a crash
 * that takes the whole viewport with it.
 */
export function getAssetDefinition(type: AssetType): AssetDefinition {
  return ASSET_DEFINITIONS[type] ?? getCustomAsset(type) ?? missingAsset(type)
}

const missingAsset = (type: AssetType): AssetDefinition => ({
  type,
  name: `Unknown (${type})`,
  category: 'Structure',
  description: `No definition is loaded for "${type}". It is drawn as a placeholder.`,
  dimensions: { width: 1, height: 1, depth: 1 },
  defaultColor: '#8f9bb3',
  clearance: 0,
})

/** Groups the catalogue for the categorised asset panel. */
export function groupedAssets(): { category: AssetCategory; assets: AssetDefinition[] }[] {
  return ASSET_CATEGORY_ORDER.map((category) => ({
    category,
    assets: allAssetDefinitions().filter((a) => a.category === category),
  })).filter((group) => group.assets.length > 0)
}

export interface CreateObjectOptions {
  /**
   * Explicit id. Preset worlds pass stable ids so the demo is reproducible:
   * the same room, the same object ids, the same tool output on every load.
   * Objects created at runtime omit it and get a random one.
   */
  id?: string
  position?: Vec3
  rotation?: Vec3
  scale?: Vec3
  label?: string
  color?: string
  tags?: string[]
  notes?: string
  custom?: Record<string, string | number | boolean>
}

/** Fresh provenance block for a newly created object. */
export function createMetadata(actor: ActorRef, options: CreateObjectOptions = {}): ObjectMetadata {
  const now = Date.now()
  return {
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    lastModifiedBy: actor,
    revision: 1,
    tags: options.tags ?? [],
    notes: options.notes,
    custom: options.custom ?? {},
  }
}

/**
 * Stamps a change onto an object's metadata.
 *
 * Called on every committed mutation so the inspector can always answer
 * "who touched this last, and when".
 */
export function touchMetadata(metadata: ObjectMetadata, actor: ActorRef): ObjectMetadata {
  return {
    ...metadata,
    updatedAt: Date.now(),
    lastModifiedBy: actor,
    revision: metadata.revision + 1,
  }
}

/**
 * Factory for scene objects. The only place a `SceneObject` is constructed, so
 * ids, defaults, dimensions and metadata stay consistent whether an object
 * comes from the UI, a template, or an agent tool.
 */
export function createSceneObject(
  type: AssetType,
  options: CreateObjectOptions = {},
  actor: ActorRef = HUMAN_ACTOR,
): SceneObject {
  const definition = getAssetDefinition(type)
  return {
    id: options.id ?? createId(type),
    type,
    label: options.label ?? definition.name,
    position: roundVec3(options.position ?? [0, 0, 0]),
    rotation: options.rotation ?? [0, 0, 0],
    scale: options.scale ?? [1, 1, 1],
    dimensions: { ...definition.dimensions },
    color: options.color ?? definition.defaultColor,
    locked: false,
    visible: true,
    metadata: createMetadata(actor, options),
  }
}

/**
 * The scale that gives an asset a requested real-world size.
 *
 * The kit is deliberately small and fixed. Rather than modelling a new
 * component for every tower, hut or warehouse, an instance is scaled to the
 * size asked for — so the same `building` covers a two-storey shop and a
 * forty-metre tower. Axes left out keep the scale they already had.
 */
export function scaleForSize(
  type: AssetType,
  size: { width?: number; height?: number; depth?: number },
  current: Vec3 = [1, 1, 1],
): Vec3 {
  const base = getAssetDefinition(type).dimensions
  return [
    size.width === undefined ? current[0] : roundTo(size.width / base.width, 4),
    size.height === undefined ? current[1] : roundTo(size.height / base.height, 4),
    size.depth === undefined ? current[2] : roundTo(size.depth / base.depth, 4),
  ]
}

/** An object's actual size on the floor, after scaling. */
export function sizeOf(object: { dimensions: Dimensions; scale: Vec3 }) {
  return {
    width: roundTo(object.dimensions.width * object.scale[0], 3),
    height: roundTo(object.dimensions.height * object.scale[1], 3),
    depth: roundTo(object.dimensions.depth * object.scale[2], 3),
  }
}
