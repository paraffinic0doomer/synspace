import type { ActorRef } from './actor'
import type { Zone, WorldMetadata } from './world'

/**
 * The scene model.
 *
 * These are plain, serialisable structures with no React or Three.js in sight.
 * The renderer reads them; human interaction and (later) WebMCP tools both
 * mutate them through the store's actions. Nothing else is a source of truth.
 */

/** Tuple used for position / rotation / scale. */
export type Vec3 = [number, number, number]

/** Position, orientation and size of an object. Rotation is Euler XYZ, radians. */
export interface Transform {
  position: Vec3
  rotation: Vec3
  scale: Vec3
}

/** A partial transform, used by move/rotate/scale actions and previews. */
export type TransformPatch = Partial<Transform>

/** The asset kinds that ship with SynSpace, each backed by its own component. */
export type BuiltinAssetType =
  // Workplace
  | 'desk'
  | 'chair'
  | 'meeting-table'
  | 'sofa'
  | 'plant'
  | 'partition'
  | 'server-rack'
  | 'door'
  // Storage and utility
  | 'storage-unit'
  // Collaboration and teaching
  | 'whiteboard'
  // Hospitality and public-facing
  | 'cafe-table'
  | 'counter'
  // Building fabric
  | 'wall-segment'
  | 'barrier'
  // Urban scale — buildings, routes and vehicles
  | 'building'
  | 'hospital'
  | 'road'
  | 'vehicle'

/**
 * Any asset kind that can be placed.
 *
 * Open on purpose. The built-in kit is a starting point, not a ceiling: an
 * agent can define new kinds at runtime from primitives (see
 * `CustomAssetDefinition`), and those are ordinary asset types from that point
 * on. `string & {}` keeps editor completion for the built-ins while still
 * accepting a runtime-defined name.
 */
export type AssetType = BuiltinAssetType | (string & {})

/** Primitive solids a data-defined asset can be built from. */
export type PartShape = 'box' | 'cylinder' | 'sphere' | 'cone'

/** Surface treatment, matching the renderer's material presets. */
export type PartFinish = 'matte' | 'soft' | 'satin' | 'metallic'

/**
 * One solid within a data-defined asset.
 *
 * Positions and sizes are metres, relative to the asset's own origin, which
 * sits on the floor at its centre — the same convention the hand-built
 * components follow, so parts and code agree about where the ground is.
 */
export interface AssetPart {
  shape: PartShape
  /** Size in metres. For a cylinder or cone, width and depth are the diameters. */
  size: Vec3
  /** Offset from the asset origin. y is the height of the part's centre. */
  position: Vec3
  rotation?: Vec3
  /** Hex colour. Omitted parts take the placed object's accent colour. */
  color?: string
  finish?: PartFinish
}

/**
 * An asset kind described as data rather than code.
 *
 * This is what lets the catalogue grow without a rebuild: an agent that needs a
 * tree, a fountain or a bus shelter composes one from primitives and it becomes
 * a first-class asset — placeable, movable, measurable, and subject to the same
 * spatial constraints as anything hand-modelled.
 */
export interface CustomAssetDefinition extends AssetDefinition {
  parts: AssetPart[]
  /** Paint the placed object's label onto the front face, at this height in metres. */
  signageHeight?: number
  /** Who defined it, so the library can be read back honestly. */
  definedBy?: ActorRef
}

/** Intrinsic size of an asset in metres, before `scale` is applied. */
export interface Dimensions {
  width: number
  height: number
  depth: number
}

/**
 * Provenance and free-form annotation carried by every object.
 *
 * `revision` increments on each committed change, which gives agents a cheap
 * way to detect that an object moved under them between two reads.
 */
export interface ObjectMetadata {
  createdAt: number
  updatedAt: number
  createdBy: ActorRef
  lastModifiedBy: ActorRef
  revision: number
  tags: string[]
  notes?: string
  /** Extras an agent may attach without a schema change. */
  custom: Record<string, string | number | boolean>
}

/** Coarse state shown in the inspector's status row. */
export type ObjectStatus = 'ready' | 'locked' | 'hidden'

/** A single placed object. Extends Transform, so position/rotation/scale are direct members. */
export interface SceneObject extends Transform {
  id: string
  type: AssetType
  label: string
  dimensions: Dimensions
  /** Accent colour for the asset's primary material. */
  color: string
  /** Locked objects can be selected and inspected but not transformed. */
  locked: boolean
  visible: boolean
  metadata: ObjectMetadata
}

/** Bounds of the room shell objects are placed inside. */
export interface RoomConfig {
  width: number
  depth: number
  wallHeight: number
}

/**
 * Everything about the space that is not an object.
 *
 * Mutated as a whole through `updateEnvironment`, which is what the WebMCP
 * `change_environment_variables` tool will call.
 */
export type EnvironmentPreset = 'studio' | 'daytime' | 'sunset' | 'cyberpunk'

export interface EnvironmentSettings {
  room: RoomConfig
  /** Named lighting mood; `studio` is the editor default. */
  preset: EnvironmentPreset
  showGrid: boolean
  showRoom: boolean
  showLabels: boolean
  /** World-analysis overlays. */
  showZones: boolean
  showBoundary: boolean
  showWarnings: boolean
  showPaths: boolean
  shadowsEnabled: boolean
  snapEnabled: boolean
  /** Metres. */
  translateSnap: number
  /** Radians. */
  rotateSnap: number
  scaleSnap: number
  ambientIntensity: number
  keyLightIntensity: number
  backgroundColor: string
  keyLightColor: string
  ambientColor: string
}

// ---------------------------------------------------------------------------
// Spatial constraints
// ---------------------------------------------------------------------------

export type ConstraintKind =
  | 'walkway-width'
  | 'object-spacing'
  | 'entrance-clearance'
  | 'exit-clearance'
  | 'collision'
  | 'alignment'
  | 'boundary'
  | 'zone-restriction'

export type ConstraintSeverity = 'error' | 'warning' | 'info'

/** A single failure of a constraint against the current layout. */
export interface ConstraintViolation {
  constraintId: string
  kind: ConstraintKind
  severity: ConstraintSeverity
  message: string
  /** Objects implicated, empty for room-level findings. */
  objectIds: string[]
  /** What was measured, in the constraint's unit. */
  measured: number
  /** What the constraint requires. */
  required: number
  /** Floor location [x, z] of the finding, when it has one. */
  at?: [number, number]
}

/**
 * A deterministic spatial rule the layout is expected to satisfy.
 * Evaluated by `spatial/constraints.ts` — see `check_constraints`.
 */
export interface SpatialConstraint {
  id: string
  kind: ConstraintKind
  label: string
  description: string
  /** Threshold, in `unit`. */
  value: number
  unit: 'm' | 'deg'
  severity: ConstraintSeverity
  enabled: boolean
  /** Asset types the rule applies to. Empty means every type. */
  appliesTo: AssetType[]
}

// ---------------------------------------------------------------------------
// Scene document
// ---------------------------------------------------------------------------

/**
 * The complete, serialisable world document — the single source of truth.
 *
 * `environment.room` carries the world dimensions. They are not duplicated at
 * this level: one set of numbers cannot disagree with itself.
 */
export interface World {
  id: string
  name: string
  objects: SceneObject[]
  /** Named regions of the floor. */
  zones: Zone[]
  environment: EnvironmentSettings
  constraints: SpatialConstraint[]
  /**
   * Asset kinds defined at runtime, carried by the world itself.
   *
   * Kept in the document rather than in a module so a world stays complete:
   * saving, loading, forking into a scenario and handing a world to a proposal
   * all keep the assets it was built from. Absent on worlds that only use the
   * built-in kit.
   */
  assetLibrary?: CustomAssetDefinition[]
  metadata: WorldMetadata
}

/**
 * The world document under its original name.
 * Kept so the Phase 1-3 code and the WebMCP tool layer read unchanged.
 */
export type Scene = World

/** Which gizmo the transform tool is currently driving. */
export type TransformMode = 'translate' | 'rotate' | 'scale'

/** Metadata describing an asset kind, used by the library and the factory. */
export interface AssetDefinition {
  type: AssetType
  name: string
  category: AssetCategory
  description: string
  dimensions: Dimensions
  defaultColor: string
  /** Suggested clearance in metres, surfaced in the inspector. */
  clearance: number
}

export type AssetCategory =
  | 'Workstations'
  | 'Seating'
  | 'Collaboration'
  | 'Storage'
  | 'Hospitality'
  | 'Infrastructure'
  | 'Structure'
  | 'Urban'
  | 'Ambience'
