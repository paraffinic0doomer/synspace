import type {
  BoundaryCheck,
  ConstraintViolation,
  SceneObject,
  SpatialObjectView,
  SpatialRelationship,
  World,
  WorldBounds,
  Zone,
} from '@/types'
import { COORDINATE_SYSTEM } from '@/types'
import { getAssetDefinition } from '@/tools/assetCatalog'
import { zoneArea } from '@/tools/zones'
import { evaluateConstraints, type ConstraintReport } from '@/spatial/constraints'
import {
  boundaryStatusOf,
  boundaryViolations,
  describeRelationships,
  emergencyExits,
  entrances,
  nearestObjects,
  objectBounds,
  objectsInZone,
  pathClearance,
  rectCentre,
  worldBounds,
  zoneOf,
  type NeighbourResult,
  type PathClearance,
} from '@/spatial/queries'
import { roundTo } from '@/utils'
import { useSceneStore } from './sceneStore'

/**
 * The world read model.
 *
 * A framework-free query surface over the world document — no React, no
 * Three.js. The inspector and the WebMCP tool layer both read through this, so
 * a human looking at a panel and an agent calling `read_scene_graph` are
 * literally answering from the same functions.
 *
 * Everything here is derived on read. `zoneId` and `category` in particular are
 * never stored on the object: they follow from position and the asset
 * catalogue, so computing them is the only way they cannot go stale.
 */

const store = () => useSceneStore.getState()

/** The live world document. */
export const getWorld = (): World => store().scene

// ---------------------------------------------------------------------------
// Object views
// ---------------------------------------------------------------------------

export function toSpatialObjectView(world: World, object: SceneObject): SpatialObjectView {
  const definition = getAssetDefinition(object.type)
  const zone = zoneOf(world, object)
  const width = object.dimensions.width * object.scale[0]
  const depth = object.dimensions.depth * object.scale[2]

  return {
    id: object.id,
    type: object.type,
    label: object.label,
    category: definition.category,
    position: [...object.position],
    rotation: [...object.rotation],
    scale: [...object.scale],
    dimensions: { ...object.dimensions },
    footprint: {
      width: roundTo(width, 3),
      depth: roundTo(depth, 3),
      areaSqm: roundTo(width * depth, 3),
    },
    bounds: objectBounds(object),
    zoneId: zone?.id ?? null,
    zoneName: zone?.name ?? null,
    properties: { ...object.metadata.custom },
    tags: [...object.metadata.tags],
    locked: object.locked,
    visible: object.visible,
    boundary: boundaryStatusOf(world, object).status,
    lastModifiedBy: object.metadata.lastModifiedBy,
    createdBy: object.metadata.createdBy,
    revision: object.metadata.revision,
  }
}

export const listObjectViews = (world: World = getWorld()): SpatialObjectView[] =>
  world.objects.map((object) => toSpatialObjectView(world, object))

export function getObjectView(id: string, world: World = getWorld()): SpatialObjectView | null {
  const object = world.objects.find((candidate) => candidate.id === id)
  return object ? toSpatialObjectView(world, object) : null
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

export interface ZoneSummary {
  id: string
  name: string
  kind: Zone['kind']
  description: string
  color: string
  bounds: Zone['bounds']
  centre: { x: number; z: number }
  areaSqm: number
  objectCount: number
  objectIds: string[]
  disallowedTypes: Zone['disallowedTypes']
  capacity: number | null
  /** Objects present that the zone forbids. */
  intrusionIds: string[]
}

export function summariseZone(world: World, zone: Zone): ZoneSummary {
  const occupants = objectsInZone(world, zone.id)
  return {
    id: zone.id,
    name: zone.name,
    kind: zone.kind,
    description: zone.description,
    color: zone.color,
    bounds: { ...zone.bounds },
    centre: (({ x, z }) => ({ x: roundTo(x, 3), z: roundTo(z, 3) }))(rectCentre(zone.bounds)),
    areaSqm: zoneArea(zone),
    objectCount: occupants.length,
    objectIds: occupants.map((object) => object.id),
    disallowedTypes: [...zone.disallowedTypes],
    capacity: zone.capacity ?? null,
    intrusionIds: occupants
      .filter((object) => zone.disallowedTypes.includes(object.type))
      .map((object) => object.id),
  }
}

export const listZoneSummaries = (world: World = getWorld()): ZoneSummary[] =>
  world.zones.map((zone) => summariseZone(world, zone))

// ---------------------------------------------------------------------------
// Relationships, neighbours, constraints
// ---------------------------------------------------------------------------

export const getRelationships = (id: string, world: World = getWorld()): SpatialRelationship[] =>
  describeRelationships(world, id)

export const getNeighbours = (
  id: string,
  limit = 5,
  world: World = getWorld(),
): NeighbourResult[] => nearestObjects(world, id, limit)

export const getConstraintReport = (world: World = getWorld()): ConstraintReport =>
  evaluateConstraints(world)

/** Violations that name a specific object. */
export function getViolationsFor(id: string, world: World = getWorld()): ConstraintViolation[] {
  return evaluateConstraints(world).violations.filter((violation) =>
    violation.objectIds.includes(id),
  )
}

export const getBoundaryViolations = (world: World = getWorld()): BoundaryCheck[] =>
  boundaryViolations(world)

export const getWorldBounds = (world: World = getWorld()): WorldBounds => worldBounds(world)

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export interface RouteSummary {
  fromId: string
  fromLabel: string
  toLabel: string
  clearance: PathClearance
}

/**
 * The egress route from every doorway to the middle of the room.
 *
 * Used by the inspector's path readout and by the viewport's path overlay, so
 * what is drawn is exactly what the checks measured.
 */
export function getEgressRoutes(world: World = getWorld()): RouteSummary[] {
  const doors = [...entrances(world), ...emergencyExits(world)]
  const seen = new Set<string>()
  const centre = { x: 0, z: 0 }

  return doors
    .filter((door) => (seen.has(door.id) ? false : (seen.add(door.id), true)))
    .map((door) => {
      // Step just inside the room along the door's facing axis.
      const angle = door.rotation[1]
      const inward = { x: Math.sin(angle), z: Math.cos(angle) }
      const toCentre = { x: centre.x - door.position[0], z: centre.z - door.position[2] }
      const sign = inward.x * toCentre.x + inward.z * toCentre.z >= 0 ? 1 : -1
      const from = {
        x: door.position[0] + inward.x * 0.9 * sign,
        z: door.position[2] + inward.z * 0.9 * sign,
      }

      return {
        fromId: door.id,
        fromLabel: door.label,
        toLabel: 'room centre',
        clearance: pathClearance(world, from, centre),
      }
    })
}

// ---------------------------------------------------------------------------
// Whole-world snapshot
// ---------------------------------------------------------------------------

export interface WorldSnapshot {
  id: string
  name: string
  metadata: World['metadata']
  coordinateSystem: typeof COORDINATE_SYSTEM
  bounds: WorldBounds
  objectCount: number
  zoneCount: number
  entrances: { id: string; label: string }[]
  emergencyExits: { id: string; label: string }[]
}

/** Everything about the world that is not the object list itself. */
export function getWorldSnapshot(world: World = getWorld()): WorldSnapshot {
  return {
    id: world.id,
    name: world.name,
    metadata: { ...world.metadata },
    coordinateSystem: COORDINATE_SYSTEM,
    bounds: worldBounds(world),
    objectCount: world.objects.length,
    zoneCount: world.zones.length,
    entrances: entrances(world).map((door) => ({ id: door.id, label: door.label })),
    emergencyExits: emergencyExits(world).map((door) => ({ id: door.id, label: door.label })),
  }
}

/**
 * The complete world query surface, in one object.
 *
 * `mcp/tools.ts` binds to this rather than reaching into the store, which keeps
 * the tool layer independent of how state happens to be organised.
 */
export const worldApi = {
  getWorld,
  getWorldSnapshot,
  getWorldBounds,
  listObjectViews,
  getObjectView,
  listZoneSummaries,
  summariseZone,
  getRelationships,
  getNeighbours,
  getConstraintReport,
  getViolationsFor,
  getBoundaryViolations,
  getEgressRoutes,
}

export type WorldApi = typeof worldApi
