import type {
  ActorRef,
  AssetCategory,
  AssetDefinition,
  AssetType,
  ObjectMetadata,
  SceneObject,
  Vec3,
} from '@/types'
import { HUMAN_ACTOR } from '@/types'
import { createId, roundVec3 } from '@/utils'

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
}

/** Stable ordering used by the asset library palette. */
export const ASSET_TYPES = Object.keys(ASSET_DEFINITIONS) as AssetType[]

export const ASSET_CATEGORY_ORDER: AssetCategory[] = [
  'Workstations',
  'Seating',
  'Collaboration',
  'Infrastructure',
  'Structure',
  'Ambience',
]

export function getAssetDefinition(type: AssetType): AssetDefinition {
  return ASSET_DEFINITIONS[type]
}

/** Groups the catalogue for the categorised asset panel. */
export function groupedAssets(): { category: AssetCategory; assets: AssetDefinition[] }[] {
  return ASSET_CATEGORY_ORDER.map((category) => ({
    category,
    assets: ASSET_TYPES.map(getAssetDefinition).filter((a) => a.category === category),
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
