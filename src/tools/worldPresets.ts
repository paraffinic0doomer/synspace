import type { AssetType, SpatialConstraint, Vec3, World, Zone } from '@/types'
import { SYSTEM_ACTOR } from '@/types'
import { createSceneObject } from './assetCatalog'
import { DEFAULT_CONSTRAINTS } from './constraints'
import { DEFAULT_ENVIRONMENT } from './environment'
import { DEFAULT_ZONES } from './zones'
import { createStarterObjects } from './sceneTemplates'
import { toRadians } from '@/utils'

/**
 * World presets.
 *
 * A preset is *data*, not a second application: the same spatial engine, the
 * same constraint evaluator, the same tools. A preset only supplies objects,
 * zones, constraint thresholds and labels. Adding one means adding an entry to
 * `WORLD_PRESETS` and nothing else.
 */

export interface WorldPreset {
  id: string
  name: string
  /** Name the built world carries, so callers can tell which preset is loaded
   *  without building one to compare against. */
  worldName: string
  tagline: string
  description: string
  /** Example questions to put in front of the user for this world. */
  prompts: string[]
  build: () => World
}

const deg = toRadians

interface Placement {
  /** Stable id — preset worlds must be byte-identical on every load. */
  id: string
  type: AssetType
  position: Vec3
  rotation?: Vec3
  label?: string
  tags?: string[]
}

const place = (layout: Placement[]) =>
  layout.map(({ id, type, position, rotation, label, tags }) =>
    createSceneObject(type, { id, position, rotation, label, tags }, SYSTEM_ACTOR),
  )

/** Shared skeleton so every preset agrees on units, origin and defaults. */
function makeWorld(input: {
  id: string
  name: string
  description: string
  tags: string[]
  room: { width: number; depth: number; wallHeight: number }
  objects: ReturnType<typeof place>
  zones: Zone[]
  constraints: SpatialConstraint[]
}): World {
  const now = Date.now()
  return {
    id: input.id,
    name: input.name,
    objects: input.objects,
    zones: input.zones.map((zone) => ({ ...zone, bounds: { ...zone.bounds } })),
    environment: {
      ...DEFAULT_ENVIRONMENT,
      room: { ...input.room },
    },
    constraints: input.constraints.map((constraint) => ({
      ...constraint,
      appliesTo: [...constraint.appliesTo],
    })),
    metadata: {
      createdAt: now,
      updatedAt: now,
      revision: 1,
      description: input.description,
      tags: input.tags,
      units: 'meters',
    },
  }
}

// ---------------------------------------------------------------------------
// Workspace — the default demo world
// ---------------------------------------------------------------------------

const workspace: WorldPreset = {
  id: 'workspace',
  name: 'Workspace',
  worldName: 'Studio Floor — Level 3',
  tagline: 'Desks, collaboration and circulation',
  description: 'An open-plan studio floor with a workstation bank, a review room, a server aisle, breakout seating, a main entrance and a west-wall emergency exit.',
  prompts: [
    'What if we add 10 more people?',
    'Is the emergency exit reachable from every desk?',
    'What if the main entrance becomes unavailable?',
    'Find the narrowest walkway and widen it.',
  ],
  build: () =>
    makeWorld({
      id: 'world-workspace',
      name: 'Studio Floor — Level 3',
      description:
        'Open-plan studio floor: a workstation bank, a review room, a server aisle, breakout seating, a main entrance and a west-wall emergency exit.',
      tags: ['office', 'open-plan', 'level-3'],
      room: { width: 18, depth: 14, wallHeight: 3 },
      objects: createStarterObjects(),
      zones: DEFAULT_ZONES,
      constraints: DEFAULT_CONSTRAINTS,
    }),
}

// ---------------------------------------------------------------------------
// Server room — the same engine, tighter tolerances
// ---------------------------------------------------------------------------

/**
 * Racks in cold/hot aisle pairs. The interesting difference from Workspace is
 * not the furniture but the *rules*: service aisles must stay wider, and the
 * aisles themselves are restricted zones where seating does not belong.
 */
const SERVER_ROOM_ZONES: Zone[] = [
  {
    id: 'zone-cold-aisle',
    name: 'Cold Aisle',
    kind: 'restricted_zone',
    bounds: { minX: -6.5, maxX: 6.5, minZ: -1.4, maxZ: 1.4 },
    color: '#4f8cff',
    description: 'Service access in front of the rack faces. Must stay clear.',
    disallowedTypes: ['sofa', 'plant', 'desk', 'meeting-table', 'chair'],
  },
  {
    id: 'zone-rack-row-a',
    name: 'Rack Row A',
    kind: 'storage',
    bounds: { minX: -7.5, maxX: 7.5, minZ: -4.4, maxZ: -1.4 },
    color: '#f0b429',
    description: 'North cabinet row.',
    disallowedTypes: ['sofa', 'plant'],
    capacity: 10,
  },
  {
    id: 'zone-rack-row-b',
    name: 'Rack Row B',
    kind: 'storage',
    bounds: { minX: -7.5, maxX: 7.5, minZ: 1.4, maxZ: 4.4 },
    color: '#f0b429',
    description: 'South cabinet row.',
    disallowedTypes: ['sofa', 'plant'],
    capacity: 10,
  },
  {
    id: 'zone-server-entrance',
    name: 'Access Vestibule',
    kind: 'entrance_zone',
    bounds: { minX: -2.0, maxX: 2.0, minZ: 4.4, maxZ: 6.5 },
    color: '#7ba9ff',
    description: 'Card-controlled entry. Keep the approach clear.',
    disallowedTypes: ['server-rack', 'desk', 'sofa', 'meeting-table'],
  },
  {
    id: 'zone-server-egress',
    name: 'Emergency Egress',
    kind: 'emergency_zone',
    bounds: { minX: -8.5, maxX: -6.0, minZ: -2.0, maxZ: 2.0 },
    color: '#f2617a',
    description: 'Protected route to the emergency exit. Nothing may obstruct it.',
    disallowedTypes: ['server-rack', 'desk', 'sofa', 'meeting-table', 'partition', 'chair'],
  },
]

/** Same rule set, stricter numbers — data centre aisles need more room. */
const SERVER_ROOM_CONSTRAINTS: SpatialConstraint[] = DEFAULT_CONSTRAINTS.map((constraint) => {
  if (constraint.kind === 'walkway-width') {
    return {
      ...constraint,
      label: 'Service aisle width',
      description: 'Aisles must take a rack on a trolley.',
      value: 1.5,
    }
  }
  if (constraint.kind === 'object-spacing') {
    return {
      ...constraint,
      label: 'Rack spacing',
      description: 'Minimum clear gap between cabinets for airflow.',
      value: 0.6,
      appliesTo: ['server-rack'] as AssetType[],
    }
  }
  if (constraint.kind === 'exit-clearance') {
    return { ...constraint, value: 1.2 }
  }
  return constraint
})

const serverRoom: WorldPreset = {
  id: 'server-room',
  name: 'Server Room',
  worldName: 'Data Hall — Row A/B',
  tagline: 'Racks, aisles and emergency access',
  description: 'Two cabinet rows either side of a cold aisle, with a card-controlled vestibule and a west-wall emergency exit. Aisle and spacing rules are tighter than an office.',
  prompts: [
    'What if we add 6 more racks?',
    'Is the service aisle wide enough for a trolley?',
    'What if the vestibule is blocked during maintenance?',
    'Check the emergency egress route.',
  ],
  build: () => {
    const racks: Placement[] = []
    // Two rows facing the cold aisle between them.
    for (let i = 0; i < 8; i += 1) {
      const x = -6.3 + i * 1.8
      const n = String(i + 1).padStart(2, '0')
      racks.push({
        id: `rack-a${n}`,
        type: 'server-rack',
        position: [x, 0, -2.6],
        rotation: [0, deg(180), 0],
        label: `Rack A${n}`,
      })
      racks.push({
        id: `rack-b${n}`,
        type: 'server-rack',
        position: [x, 0, 2.6],
        label: `Rack B${n}`,
      })
    }

    const layout: Placement[] = [
      ...racks,
      // Operator station in the corner
      { id: 'desk-operator', type: 'desk', position: [6.4, 0, 5.2], rotation: [0, deg(180), 0], label: 'Operator Desk' },
      { id: 'chair-operator', type: 'chair', position: [6.4, 0, 4.3], label: 'Operator Chair' },
      // Obstacles: staged equipment in the aisle
      { id: 'partition-staging', type: 'partition', position: [0.5, 0, -0.2], rotation: [0, deg(90), 0], label: 'Staging Barrier' },
      // Doors
      { id: 'door-vestibule', type: 'door', position: [0, 0, 6.93], label: 'Access Vestibule', tags: ['entrance'] },
      {
        id: 'door-server-emergency',
        type: 'door',
        position: [-8.93, 0, 0],
        rotation: [0, deg(90), 0],
        label: 'Emergency Exit',
        tags: ['emergency-exit'],
      },
    ]

    return makeWorld({
      id: 'world-server-room',
      name: 'Data Hall — Row A/B',
      description:
        'Data hall with two cabinet rows either side of a cold aisle, an access vestibule and a west-wall emergency exit.',
      tags: ['data-centre', 'racks', 'restricted'],
      room: { width: 18, depth: 14, wallHeight: 3 },
      objects: place(layout),
      zones: SERVER_ROOM_ZONES,
      constraints: SERVER_ROOM_CONSTRAINTS,
    })
  },
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const WORLD_PRESETS: WorldPreset[] = [workspace, serverRoom]

export const DEFAULT_PRESET_ID = workspace.id

export const getWorldPreset = (id: string): WorldPreset | undefined =>
  WORLD_PRESETS.find((preset) => preset.id === id)

export const buildPresetWorld = (id: string): World | null =>
  getWorldPreset(id)?.build() ?? null
