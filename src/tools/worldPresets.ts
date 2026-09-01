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
// Emergency response — the same engine at street scale
// ---------------------------------------------------------------------------

/**
 * Outdoor world: city blocks, a hospital, roads and a blocked route.
 *
 * The engine is untouched. Only the numbers change — the "room" is a 60 x 44 m
 * district rather than an 18 x 14 m floor, the walkway rule becomes a vehicle
 * access rule at 3.5 m, and roads are surfaces the routing runs along instead
 * of obstacles it avoids.
 */
const EMERGENCY_ZONES: Zone[] = [
  {
    id: 'zone-hospital',
    name: 'Hospital Grounds',
    kind: 'emergency_zone',
    bounds: { minX: 8, maxX: 28, minZ: -20, maxZ: -2 },
    color: '#f2617a',
    description: 'Ambulance approach and hospital forecourt. Must stay driveable.',
    disallowedTypes: ['building', 'barrier', 'storage-unit'],
  },
  {
    id: 'zone-north-block',
    name: 'North Block',
    kind: 'restricted_zone',
    bounds: { minX: -28, maxX: -4, minZ: -21, maxZ: -4 },
    color: '#4f8cff',
    description: 'Residential blocks north of the main route.',
    disallowedTypes: [],
    capacity: 6,
  },
  {
    id: 'zone-south-block',
    name: 'South Block',
    kind: 'restricted_zone',
    bounds: { minX: -28, maxX: -4, minZ: 4, maxZ: 21 },
    color: '#8f9bb3',
    description: 'Residential blocks south of the main route.',
    disallowedTypes: [],
    capacity: 6,
  },
  {
    id: 'zone-main-route',
    name: 'Main Route',
    kind: 'circulation',
    bounds: { minX: -30, maxX: 30, minZ: -3.5, maxZ: 3.5 },
    color: '#22d3a7',
    description: 'Primary east-west corridor. Emergency vehicles depend on it.',
    disallowedTypes: ['building', 'hospital', 'storage-unit', 'desk', 'sofa'],
  },
  {
    id: 'zone-staging',
    name: 'Staging Area',
    kind: 'entrance_zone',
    bounds: { minX: 8, maxX: 28, minZ: 4, maxZ: 20 },
    color: '#7ba9ff',
    description: 'Where responding units assemble. Keep the approach open.',
    disallowedTypes: ['building', 'hospital'],
  },
]

/** Same rules, street numbers: a fire appliance needs far more than a corridor. */
const EMERGENCY_CONSTRAINTS: SpatialConstraint[] = DEFAULT_CONSTRAINTS.map((constraint) => {
  if (constraint.kind === 'walkway-width') {
    return {
      ...constraint,
      label: 'Vehicle access width',
      description: 'Emergency vehicles must be able to pass along the route.',
      value: 3.5,
    }
  }
  if (constraint.kind === 'exit-clearance') {
    return {
      ...constraint,
      label: 'Evacuation route width',
      description: 'Every area must reach an exit at this width.',
      value: 3.0,
    }
  }
  if (constraint.kind === 'entrance-clearance') {
    return { ...constraint, label: 'Access point clearance', value: 4.0 }
  }
  if (constraint.kind === 'object-spacing') {
    return { ...constraint, value: 2.0, appliesTo: ['building'] as AssetType[] }
  }
  return constraint
})

const emergencyResponse: WorldPreset = {
  id: 'emergency-response',
  name: 'Emergency Response',
  worldName: 'District 4 — Incident Map',
  tagline: 'Buildings, roads, a hospital and a blocked route',
  description:
    'A city district with residential blocks either side of the main route, a hospital to the east, and a collapsed section blocking the western approach. Access rules are sized for vehicles, not people.',
  prompts: [
    'Is the hospital still reachable from the west?',
    'What if we clear the blocked section of the main route?',
    'Which areas cannot evacuate at 3 m?',
    'Find the narrowest point on the vehicle route.',
  ],
  build: () => {
    const layout: Placement[] = []

    // The main east-west route, laid as road surfaces end to end.
    for (let i = 0; i < 5; i += 1) {
      layout.push({
        id: 'road-main-' + String(i + 1),
        type: 'road',
        position: [-24 + i * 12, 0, 0],
        rotation: [0, deg(90), 0],
        label: 'Main Route ' + String(i + 1),
      })
    }
    layout.push({
      id: 'road-hospital-spur',
      type: 'road',
      position: [16, 0, -7],
      label: 'Hospital Spur',
    })

    // Residential blocks either side of the route.
    const blockX = [-24, -16, -8]
    blockX.forEach((x, index) => {
      layout.push({
        id: 'building-n' + String(index + 1),
        type: 'building',
        position: [x, 0, -11],
        label: 'Block N' + String(index + 1),
      })
      layout.push({
        id: 'building-s' + String(index + 1),
        type: 'building',
        position: [x, 0, 11],
        label: 'Block S' + String(index + 1),
      })
    })

    layout.push({
      id: 'hospital-central',
      type: 'hospital',
      position: [18, 0, -12],
      rotation: [0, deg(180), 0],
      label: 'Central Hospital',
    })

    // Responding units staged to the south-east.
    layout.push({
      id: 'vehicle-ambulance',
      type: 'vehicle',
      position: [14, 0, 8],
      rotation: [0, deg(180), 0],
      label: 'Ambulance 1',
    })
    layout.push({
      id: 'vehicle-support',
      type: 'vehicle',
      position: [19, 0, 8],
      rotation: [0, deg(180), 0],
      label: 'Support Unit',
    })

    // The incident: a collapsed section closing the western approach.
    //
    // The closure has to span the whole drivable gap between the north and
    // south building rows (z -8 .. 8) to actually be a closure — a couple of
    // barriers in a 44 m wide district is something you simply drive around.
    // Nine units spanning z -7.15 .. 7.15: wide enough to close the gap between
    // the building rows, spaced so no two barriers touch each other or a block.
    for (let i = 0; i < 9; i += 1) {
      layout.push({
        id: 'barrier-incident-' + String(i + 1),
        type: 'barrier',
        position: [-13, 0, -7.15 + i * 1.7875],
        rotation: [0, deg(90), 0],
        label: 'Road Closure ' + String(i + 1),
      })
    }

    // Access points at either end of the district.
    layout.push({
      id: 'door-west-access',
      type: 'door',
      // Set in from the wall: an access point flush against the boundary has
      // its approach width capped by the boundary itself, which would report a
      // pinch that has nothing to do with the incident.
      position: [-27.5, 0, 0],
      rotation: [0, deg(90), 0],
      label: 'West Access',
      tags: ['entrance'],
    })
    layout.push({
      id: 'door-east-access',
      type: 'door',
      position: [27.5, 0, 0],
      rotation: [0, deg(-90), 0],
      label: 'East Access',
      tags: ['emergency-exit'],
    })

    return makeWorld({
      id: 'world-emergency-response',
      name: 'District 4 — Incident Map',
      description:
        'City district with residential blocks, a hospital to the east, a main east-west route and a collapsed section blocking the western approach.',
      tags: ['urban', 'emergency', 'district-4'],
      room: { width: 60, depth: 44, wallHeight: 12 },
      objects: place(layout),
      zones: EMERGENCY_ZONES,
      constraints: EMERGENCY_CONSTRAINTS,
    })
  },
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const WORLD_PRESETS: WorldPreset[] = [workspace, serverRoom, emergencyResponse]

export const DEFAULT_PRESET_ID = workspace.id

export const getWorldPreset = (id: string): WorldPreset | undefined =>
  WORLD_PRESETS.find((preset) => preset.id === id)

export const buildPresetWorld = (id: string): World | null =>
  getWorldPreset(id)?.build() ?? null
