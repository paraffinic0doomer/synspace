import type { ActorRef } from './actor'
import type { AssetCategory, AssetType, Dimensions, SceneObject, Vec3 } from './scene'

/**
 * The spatial world model.
 *
 * Phase 4 turns the scene from "a list of objects" into a structured world:
 * the same objects, plus the regions, boundaries and relationships that let a
 * human and an agent reason about the space in the same terms.
 *
 * Two things here are deliberately *derived* rather than stored — an object's
 * zone and its category. Both follow entirely from data that already exists
 * (position, and the asset catalogue), so storing them would create a second
 * copy that can silently drift out of date. They are computed on read instead.
 */

// ---------------------------------------------------------------------------
// Coordinate system
// ---------------------------------------------------------------------------

/**
 * The one coordinate convention the whole app agrees on.
 *
 * Written down as data, not just prose, so the WebMCP layer can hand it
 * verbatim to an agent that has never seen this room before.
 */
export const COORDINATE_SYSTEM = {
  units: 'meters',
  handedness: 'right-handed (Three.js convention)',
  origin: 'Centre of the floor. y = 0 is the floor plane.',
  axes: {
    x: '+X runs to the right when looking down the default camera; the room spans -width/2 .. +width/2.',
    y: '+Y is up. Objects stand on the floor at y = 0.',
    z: '+Z runs toward the default camera; the room spans -depth/2 .. +depth/2.',
  },
  rotation: {
    storage: 'Euler XYZ in radians on the object; yaw is rotation[1].',
    api: 'The WebMCP tool surface accepts and reports degrees.',
    convention: 'Yaw 0 faces +Z. Yaw +90 deg faces +X.',
  },
  dimensions: 'Object width/height/depth are metres along the object\'s own X/Y/Z before scale.',
} as const

// ---------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------

/** An axis-aligned rectangle on the floor plane, in metres. */
export interface Rect2 {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** The extent of the world and the area objects may legally occupy. */
export interface WorldBounds {
  /** The room shell footprint. */
  outer: Rect2
  width: number
  depth: number
  wallHeight: number
}

export type BoundaryStatus = 'inside' | 'straddling' | 'outside'

export interface BoundaryCheck {
  objectId: string
  label: string
  status: BoundaryStatus
  /** Metres the footprint pokes past the wall; 0 when fully inside. */
  overshoot: number
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

export type ZoneKind =
  | 'workspace'
  | 'meeting_area'
  | 'storage'
  | 'circulation'
  | 'entrance_zone'
  | 'emergency_zone'
  | 'restricted_zone'

/**
 * A named rectangular region of the floor.
 *
 * Rectangles rather than polygons: every zone question in this product is
 * "which region is this in" or "what is in this region", and axis-aligned
 * rectangles answer both exactly, cheaply and deterministically.
 */
export interface Zone {
  id: string
  name: string
  kind: ZoneKind
  bounds: Rect2
  /** Overlay tint. */
  color: string
  description: string
  /** Asset types that do not belong here; empty means no restriction. */
  disallowedTypes: AssetType[]
  /** Optional planned object capacity. This is explicit policy, never inferred. */
  capacity?: number
}

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

export type RelationKind = 'inside' | 'near' | 'adjacent_to' | 'blocks' | 'connected_to'

/**
 * A derived relationship between an object and something else in the world.
 * Recomputed from geometry on read — never stored, so it cannot go stale.
 */
export interface SpatialRelationship {
  kind: RelationKind
  /** The object this relationship is described from. */
  subjectId: string
  /** The other participant: an object id or a zone id. */
  objectId: string
  targetKind: 'object' | 'zone'
  label: string
  /** Clear gap in metres, where the relation is distance-based. */
  distance?: number
}

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

/**
 * An object enriched with everything derivable about its place in the world.
 * This is what the inspector and the WebMCP layer read; the store still holds
 * the plain `SceneObject`.
 */
export interface SpatialObjectView {
  id: string
  type: AssetType
  label: string
  category: AssetCategory
  position: Vec3
  rotation: Vec3
  scale: Vec3
  dimensions: Dimensions
  /** Footprint after scale, in metres. */
  footprint: { width: number; depth: number; areaSqm: number }
  /** Axis-aligned floor bounds after rotation and scale. */
  bounds: Rect2
  /** Derived from position; null when the object sits outside every zone. */
  zoneId: string | null
  zoneName: string | null
  /** Free-form annotations carried on the object's metadata. */
  properties: Record<string, string | number | boolean>
  tags: string[]
  locked: boolean
  visible: boolean
  boundary: BoundaryStatus
  /** Who last changed this object, and how many committed changes it has seen. */
  lastModifiedBy: ActorRef
  createdBy: ActorRef
  revision: number
}

/** Provenance and description for the world as a whole. */
export interface WorldMetadata {
  createdAt: number
  updatedAt: number
  /** Bumped on every committed change, so an agent can detect staleness. */
  revision: number
  description: string
  tags: string[]
  units: 'meters'
}

/** Convenience alias — the source object a view is built from. */
export type SpatialObject = SceneObject
