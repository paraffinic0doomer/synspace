import type { World, SceneObject, Vec3 } from '@/types'
import { SYSTEM_ACTOR } from '@/types'
import { createSceneObject } from './assetCatalog'
import { DEFAULT_ENVIRONMENT } from './environment'
import { DEFAULT_CONSTRAINTS } from './constraints'
import { DEFAULT_ZONES } from './zones'
import { createId, toRadians } from '@/utils'

const deg = toRadians

interface Placement {
  /** Stable id — the demo world must look identical on every load. */
  id: string
  type: Parameters<typeof createSceneObject>[0]
  position: Vec3
  rotation?: Vec3
  label?: string
  /** Role tags, e.g. which door is the emergency exit. */
  tags?: string[]
}

/**
 * The starter workspace. Layouts live here as data — the renderer never hard
 * codes objects, it only draws whatever the store currently holds.
 */
const STUDIO_LAYOUT: Placement[] = [
  // Workstation bank, west side
  { id: 'desk-a1', type: 'desk', position: [-5.4, 0, -3.4], rotation: [0, deg(90), 0], label: 'Desk · A1' },
  { id: 'chair-a1', type: 'chair', position: [-4.4, 0, -3.4], rotation: [0, deg(-90), 0], label: 'Chair · A1' },
  { id: 'desk-a2', type: 'desk', position: [-5.4, 0, -1.4], rotation: [0, deg(90), 0], label: 'Desk · A2' },
  { id: 'chair-a2', type: 'chair', position: [-4.4, 0, -1.4], rotation: [0, deg(-90), 0], label: 'Chair · A2' },
  { id: 'desk-a3', type: 'desk', position: [-5.4, 0, 0.6], rotation: [0, deg(90), 0], label: 'Desk · A3' },
  { id: 'chair-a3', type: 'chair', position: [-4.4, 0, 0.6], rotation: [0, deg(-90), 0], label: 'Chair · A3' },
  { id: 'partition-west', type: 'partition', position: [-3.5, 0, -3.4], rotation: [0, deg(90), 0], label: 'Divider · West' },
  { id: 'partition-mid', type: 'partition', position: [-3.5, 0, -1.4], rotation: [0, deg(90), 0], label: 'Divider · Mid' },

  { id: 'desk-manager', type: 'desk', position: [-5.4, 0, 2.6], rotation: [0, deg(90), 0], label: "Manager's Desk" },
  { id: 'chair-manager', type: 'chair', position: [-4.4, 0, 2.6], rotation: [0, deg(-90), 0], label: "Manager's Chair" },

  // Meeting zone, centre-east
  { id: 'meeting-table-review', type: 'meeting-table', position: [3.2, 0, -2.6], label: 'Review Table' },
  { id: 'chair-m1', type: 'chair', position: [2.2, 0, -3.9], label: 'Chair · M1' },
  { id: 'chair-m2', type: 'chair', position: [3.2, 0, -3.9], label: 'Chair · M2' },
  { id: 'chair-m3', type: 'chair', position: [4.2, 0, -3.9], label: 'Chair · M3' },
  { id: 'chair-m4', type: 'chair', position: [2.2, 0, -1.3], rotation: [0, deg(180), 0], label: 'Chair · M4' },
  { id: 'chair-m5', type: 'chair', position: [3.2, 0, -1.3], rotation: [0, deg(180), 0], label: 'Chair · M5' },
  { id: 'chair-m6', type: 'chair', position: [4.2, 0, -1.3], rotation: [0, deg(180), 0], label: 'Chair · M6' },

  // Lounge, south
  { id: 'sofa-lounge', type: 'sofa', position: [2.6, 0, 3.6], rotation: [0, deg(180), 0], label: 'Lounge Sofa' },
  { id: 'plant-lounge', type: 'plant', position: [4.6, 0, 3.4], label: 'Planter · Lounge' },
  { id: 'plant-walkway', type: 'plant', position: [0.6, 0, 3.4], label: 'Planter · Walkway' },

  // Infrastructure, north-east corner
  { id: 'rack-core-01', type: 'server-rack', position: [7.6, 0, -5.2], rotation: [0, deg(-90), 0], label: 'Rack · Core-01' },
  { id: 'rack-core-02', type: 'server-rack', position: [7.6, 0, -3.9], rotation: [0, deg(-90), 0], label: 'Rack · Core-02' },

  // Entry
  { id: 'door-main-entry', type: 'door', position: [0, 0, 6.93], label: 'Main Entry', tags: ['entrance'] },
  { id: 'plant-entry', type: 'plant', position: [-1.8, 0, 5.6], label: 'Planter · Entry' },

  // Emergency exit on the west wall, facing into the room
  {
    id: 'door-emergency-exit',
    type: 'door',
    position: [-8.93, 0, 4.0],
    rotation: [0, deg(90), 0],
    label: 'Emergency Exit',
    tags: ['emergency-exit'],
  },
]

export function createStarterObjects(): SceneObject[] {
  return STUDIO_LAYOUT.map(({ id, type, position, rotation, label, tags }) =>
    createSceneObject(type, { id, position, rotation, label, tags }, SYSTEM_ACTOR),
  )
}

/** A complete world document: objects, zones, environment, rules and metadata. */
export function createStarterScene(): World {
  const now = Date.now()
  return {
    id: 'world-workspace',
    name: 'Studio Floor — Level 3',
    objects: createStarterObjects(),
    zones: DEFAULT_ZONES.map((zone) => ({ ...zone, bounds: { ...zone.bounds } })),
    environment: { ...DEFAULT_ENVIRONMENT, room: { ...DEFAULT_ENVIRONMENT.room } },
    constraints: DEFAULT_CONSTRAINTS.map((constraint) => ({ ...constraint })),
    metadata: {
      createdAt: now,
      updatedAt: now,
      revision: 1,
      description:
        'Open-plan studio floor: a workstation bank, a review room, a server aisle, breakout seating, a main entrance and a west-wall emergency exit.',
      tags: ['office', 'open-plan', 'level-3'],
      units: 'meters',
    },
  }
}

/** An empty room that keeps the current zones, environment and rules. */
export function createEmptyScene(name = 'Untitled Floor'): World {
  return { ...createStarterScene(), id: createId('world'), name, objects: [] }
}

/** Alias reflecting the Phase 4 vocabulary. */
export const createStarterWorld = createStarterScene
