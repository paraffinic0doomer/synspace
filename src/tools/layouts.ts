import type { AssetType, RoomConfig, SceneObject, Vec3, Zone } from '@/types'
import { SYSTEM_ACTOR } from '@/types'
import { createSceneObject } from './assetCatalog'
import { toRadians } from '@/utils'

/**
 * Layout library.
 *
 * A layout is an *arrangement* — objects and the zones that describe them —
 * placed into whatever room the world already has. Presets define a whole world
 * (room size, rules, arrangement); layouts only refurnish the room in front of
 * you, which is what "build me a classroom" actually means.
 *
 * Every generator is deterministic and room-aware: it reads the room's extent
 * and lays out relative to it, so the same request produces the same result and
 * a bigger room simply gets more of it.
 */

const deg = toRadians

export interface LayoutPlacement {
  id: string
  type: AssetType
  position: Vec3
  rotation?: Vec3
  label?: string
  tags?: string[]
}

export interface LayoutResult {
  objects: SceneObject[]
  zones: Zone[]
}

export interface LayoutDefinition {
  id: string
  name: string
  summary: string
  /** What an agent would be asked that should land here. */
  matches: string[]
  /**
   * Ground the layout needs, applied when it is generated.
   *
   * A classroom and a city district are not the same size, so the layout
   * states its own footprint instead of being squeezed into whatever room
   * happens to be loaded. Omitted means "works in the current room".
   */
  room?: RoomConfig
  build: (room: RoomConfig) => { placements: LayoutPlacement[]; zones: Zone[] }
}

/** Usable floor, inset from the walls so nothing is born overhanging. */
const bounds = (room: RoomConfig, margin = 1.2) => ({
  minX: -room.width / 2 + margin,
  maxX: room.width / 2 - margin,
  minZ: -room.depth / 2 + margin,
  maxZ: room.depth / 2 - margin,
})

const zone = (
  id: string,
  name: string,
  kind: Zone['kind'],
  b: Zone['bounds'],
  color: string,
  description: string,
  disallowedTypes: AssetType[] = [],
  capacity?: number,
): Zone => ({ id, name, kind, bounds: b, color, description, disallowedTypes, capacity })

/** Door set into the south wall, plus the entrance zone in front of it. */
function southEntrance(room: RoomConfig, id = 'door-entrance', label = 'Entrance') {
  const z = room.depth / 2 - 0.07
  return {
    door: { id, type: 'door' as AssetType, position: [0, 0, z] as Vec3, label, tags: ['entrance'] },
    zone: zone(
      'zone-entrance',
      'Entrance',
      'entrance_zone',
      { minX: -2.2, maxX: 2.2, minZ: room.depth / 2 - 2.6, maxZ: room.depth / 2 },
      '#7ba9ff',
      'Approach to the main door. Keep it clear.',
      ['desk', 'meeting-table', 'sofa', 'counter', 'storage-unit'],
    ),
  }
}

/** Emergency exit in the west wall, plus its protected route. */
function westExit(room: RoomConfig) {
  const x = -room.width / 2 + 0.07
  return {
    door: {
      id: 'door-emergency-exit',
      type: 'door' as AssetType,
      position: [x, 0, 0] as Vec3,
      rotation: [0, deg(90), 0] as Vec3,
      label: 'Emergency Exit',
      tags: ['emergency-exit'],
    },
    zone: zone(
      'zone-emergency',
      'Emergency Egress',
      'emergency_zone',
      { minX: -room.width / 2, maxX: -room.width / 2 + 2.6, minZ: -1.8, maxZ: 1.8 },
      '#f2617a',
      'Protected route to the emergency exit. Nothing may obstruct it.',
      ['desk', 'meeting-table', 'server-rack', 'sofa', 'partition', 'chair', 'counter', 'storage-unit'],
    ),
  }
}

// ---------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------

const classroom: LayoutDefinition = {
  id: 'classroom',
  name: 'Classroom',
  summary: 'Whiteboard and teaching desk at the front, seating in rows facing it.',
  matches: ['classroom', 'lecture', 'teaching room', 'training room', 'school'],
  build: (room) => {
    const b = bounds(room)
    const entrance = southEntrance(room, 'door-classroom', 'Classroom Door')
    const exit = westExit(room)
    const placements: LayoutPlacement[] = [
      { id: 'whiteboard-front', type: 'whiteboard', position: [0, 0, b.minZ + 0.4], label: 'Whiteboard' },
      {
        id: 'desk-teacher',
        type: 'desk',
        position: [0, 0, b.minZ + 1.8],
        rotation: [0, deg(180), 0],
        label: "Teacher's Desk",
      },
      {
        id: 'chair-teacher',
        type: 'chair',
        position: [0, 0, b.minZ + 2.7],
        label: "Teacher's Chair",
      },
      entrance.door,
      exit.door,
    ]

    // Rows of seats facing the front, sized to the room with a centre aisle.
    const rows = Math.max(2, Math.min(5, Math.floor((b.maxZ - b.minZ - 5.5) / 1.5)))
    const perSide = Math.max(2, Math.min(3, Math.floor((b.maxX - b.minX - 2.4) / 2 / 1.4)))
    for (let row = 0; row < rows; row += 1) {
      for (let seat = 0; seat < perSide * 2; seat += 1) {
        const side = seat < perSide ? -1 : 1
        const index = seat % perSide
        const x = side * (1.2 + index * 1.4)
        placements.push({
          id: 'chair-r' + String(row + 1) + 'c' + String(seat + 1),
          type: 'chair',
          position: [x, 0, b.minZ + 4.4 + row * 1.5],
          label: 'Seat R' + String(row + 1) + 'C' + String(seat + 1),
        })
      }
    }

    placements.push(
      { id: 'storage-supplies', type: 'storage-unit', position: [b.maxX - 0.4, 0, b.minZ + 1.2], rotation: [0, deg(-90), 0], label: 'Supplies' },
      { id: 'plant-corner', type: 'plant', position: [b.minX + 0.6, 0, b.maxZ - 0.8], label: 'Planter' },
    )

    return {
      placements,
      zones: [
        zone(
          'zone-teaching',
          'Teaching Area',
          'workspace',
          { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.minZ + 3.4 },
          '#4f8cff',
          'Board and teaching position. Keep the front clear.',
          ['sofa', 'server-rack'],
        ),
        zone(
          'zone-seating',
          'Seating',
          'workspace',
          { minX: b.minX, maxX: b.maxX, minZ: b.minZ + 3.6, maxZ: b.maxZ - 2.8 },
          '#22d3a7',
          'Student seating, arranged in rows with a centre aisle.',
          [],
          rows * perSide * 2,
        ),
        entrance.zone,
        exit.zone,
      ],
    }
  },
}

const cafe: LayoutDefinition = {
  id: 'cafe',
  name: 'Cafe',
  summary: 'Service counter along one wall, two-seat tables spread across the floor.',
  matches: ['cafe', 'coffee shop', 'canteen', 'restaurant', 'lounge'],
  build: (room) => {
    const b = bounds(room)
    const entrance = southEntrance(room, 'door-cafe', 'Cafe Entrance')
    const exit = westExit(room)
    const placements: LayoutPlacement[] = [
      {
        id: 'counter-service',
        type: 'counter',
        position: [0, 0, b.minZ + 0.6],
        label: 'Service Counter',
      },
      { id: 'storage-back', type: 'storage-unit', position: [b.maxX - 0.4, 0, b.minZ + 1.4], rotation: [0, deg(-90), 0], label: 'Back Stock' },
      entrance.door,
      exit.door,
    ]

    // Tables on a grid, each with a pair of chairs.
    const cols = Math.max(2, Math.min(4, Math.floor((b.maxX - b.minX) / 3.2)))
    const rows = Math.max(2, Math.min(3, Math.floor((b.maxZ - b.minZ - 5) / 3)))
    let n = 0
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        n += 1
        const x = b.minX + 1.6 + col * ((b.maxX - b.minX - 3.2) / Math.max(cols - 1, 1))
        const z = b.minZ + 3.4 + row * 3.0
        placements.push(
          { id: 'cafe-table-' + String(n), type: 'cafe-table', position: [x, 0, z], label: 'Table ' + String(n) },
          { id: 'cafe-chair-' + String(n) + 'a', type: 'chair', position: [x, 0, z - 0.95], label: 'Table ' + String(n) + ' Seat A' },
          { id: 'cafe-chair-' + String(n) + 'b', type: 'chair', position: [x, 0, z + 0.95], rotation: [0, deg(180), 0], label: 'Table ' + String(n) + ' Seat B' },
        )
      }
    }

    placements.push(
      { id: 'plant-cafe-a', type: 'plant', position: [b.minX + 0.6, 0, b.minZ + 2.2], label: 'Planter · West' },
      { id: 'plant-cafe-b', type: 'plant', position: [b.maxX - 0.6, 0, b.maxZ - 1.4], label: 'Planter · East' },
    )

    return {
      placements,
      zones: [
        zone(
          'zone-service',
          'Service',
          'workspace',
          { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.minZ + 2.4 },
          '#f0b429',
          'Counter and back-of-house. Staff side of the room.',
          ['sofa', 'cafe-table'],
        ),
        zone(
          'zone-seating-area',
          'Seating',
          'circulation',
          { minX: b.minX, maxX: b.maxX, minZ: b.minZ + 2.6, maxZ: b.maxZ - 2.6 },
          '#22d3a7',
          'Customer seating and circulation between tables.',
          ['server-rack', 'desk'],
          cols * rows * 3,
        ),
        entrance.zone,
        exit.zone,
      ],
    }
  },
}

const openPlanOffice: LayoutDefinition = {
  id: 'open-plan-office',
  name: 'Open-plan office',
  summary: 'Desk bank behind dividers, a review table, and breakout seating.',
  matches: ['office', 'workspace', 'open plan', 'studio', 'desks'],
  build: (room) => {
    const b = bounds(room)
    const entrance = southEntrance(room, 'door-office', 'Main Entry')
    const exit = westExit(room)
    const placements: LayoutPlacement[] = [entrance.door, exit.door]

    const deskCount = Math.max(2, Math.min(4, Math.floor((b.maxZ - b.minZ - 4) / 2)))
    for (let i = 0; i < deskCount; i += 1) {
      const z = b.minZ + 1.4 + i * 2
      placements.push(
        { id: 'desk-a' + String(i + 1), type: 'desk', position: [b.minX + 1.4, 0, z], rotation: [0, deg(90), 0], label: 'Desk A' + String(i + 1) },
        { id: 'chair-a' + String(i + 1), type: 'chair', position: [b.minX + 2.4, 0, z], rotation: [0, deg(-90), 0], label: 'Chair A' + String(i + 1) },
      )
      if (i % 2 === 0) {
        placements.push({
          id: 'partition-' + String(i + 1),
          type: 'partition',
          position: [b.minX + 3.3, 0, z],
          rotation: [0, deg(90), 0],
          label: 'Divider ' + String(i + 1),
        })
      }
    }

    const meetX = b.maxX - 3.2
    placements.push(
      { id: 'meeting-table-review', type: 'meeting-table', position: [meetX, 0, b.minZ + 2.2], label: 'Review Table' },
      // The board sits clear of the near seat row: a whiteboard is 0.5 m deep
      // including its legs, so 0.3 m from the wall leaves a real gap at 1.15.
      { id: 'whiteboard-review', type: 'whiteboard', position: [meetX, 0, b.minZ + 0.3], label: 'Review Board' },
    )
    for (let i = 0; i < 3; i += 1) {
      placements.push(
        { id: 'chair-m' + String(i + 1), type: 'chair', position: [meetX - 1 + i, 0, b.minZ + 1.15], label: 'Chair M' + String(i + 1) },
        { id: 'chair-m' + String(i + 4), type: 'chair', position: [meetX - 1 + i, 0, b.minZ + 3.45], rotation: [0, deg(180), 0], label: 'Chair M' + String(i + 4) },
      )
    }

    placements.push(
      { id: 'sofa-breakout', type: 'sofa', position: [meetX, 0, b.maxZ - 2.6], rotation: [0, deg(180), 0], label: 'Breakout Sofa' },
      { id: 'plant-breakout', type: 'plant', position: [meetX + 1.8, 0, b.maxZ - 2.4], label: 'Planter · Breakout' },
      { id: 'storage-office', type: 'storage-unit', position: [b.minX + 0.6, 0, b.maxZ - 1.6], label: 'Office Storage' },
    )

    return {
      placements,
      zones: [
        zone(
          'zone-workspace-a',
          'Workstation Bank',
          'workspace',
          { minX: b.minX, maxX: b.minX + 4.2, minZ: b.minZ, maxZ: b.minZ + deskCount * 2 + 0.6 },
          '#4f8cff',
          'Focused desk work behind acoustic dividers.',
          [],
          deskCount * 3,
        ),
        zone(
          'zone-meeting',
          'Review Room',
          'meeting_area',
          { minX: meetX - 2.2, maxX: meetX + 2.2, minZ: b.minZ, maxZ: b.minZ + 4.4 },
          '#22d3a7',
          'Collaboration space around the review table.',
          [],
          8,
        ),
        zone(
          'zone-circulation',
          'Concourse',
          'circulation',
          { minX: b.minX + 4.4, maxX: b.maxX, minZ: b.maxZ - 4.6, maxZ: b.maxZ - 2.4 },
          '#8f9bb3',
          'Main route and breakout seating.',
          ['desk', 'server-rack'],
        ),
        entrance.zone,
        exit.zone,
      ],
    }
  },
}

const clinic: LayoutDefinition = {
  id: 'clinic',
  name: 'Clinic waiting room',
  summary: 'Reception counter facing rows of waiting seats, with an accessible route.',
  matches: ['clinic', 'waiting room', 'reception', 'surgery', 'health centre'],
  build: (room) => {
    const b = bounds(room)
    const entrance = southEntrance(room, 'door-clinic', 'Clinic Entrance')
    const exit = westExit(room)
    const placements: LayoutPlacement[] = [
      { id: 'counter-reception', type: 'counter', position: [0, 0, b.minZ + 0.6], label: 'Reception' },
      { id: 'chair-reception', type: 'chair', position: [0, 0, b.minZ + 1.8], rotation: [0, deg(180), 0], label: 'Receptionist' },
      { id: 'storage-records', type: 'storage-unit', position: [b.maxX - 0.4, 0, b.minZ + 1.4], rotation: [0, deg(-90), 0], label: 'Records' },
      entrance.door,
      exit.door,
    ]

    // Two banks of waiting seats with a wide accessible aisle between them.
    const perRow = Math.max(3, Math.min(5, Math.floor((b.maxX - b.minX - 3.6) / 2 / 0.9)))
    for (let bank = 0; bank < 2; bank += 1) {
      for (let i = 0; i < perRow; i += 1) {
        const side = bank === 0 ? -1 : 1
        const x = side * (1.8 + i * 0.9)
        placements.push({
          id: 'chair-wait-' + String(bank + 1) + '-' + String(i + 1),
          type: 'chair',
          position: [x, 0, b.minZ + 4.2],
          label: 'Waiting Seat ' + String(bank * perRow + i + 1),
        })
        placements.push({
          id: 'chair-wait-' + String(bank + 1) + '-' + String(i + 1) + 'b',
          type: 'chair',
          position: [x, 0, b.minZ + 6.0],
          rotation: [0, deg(180), 0],
          label: 'Waiting Seat ' + String(bank * perRow + i + 1) + 'B',
        })
      }
    }

    placements.push(
      { id: 'plant-clinic-a', type: 'plant', position: [b.minX + 0.6, 0, b.minZ + 3.0], label: 'Planter · West' },
      { id: 'plant-clinic-b', type: 'plant', position: [b.maxX - 0.6, 0, b.minZ + 3.0], label: 'Planter · East' },
    )

    return {
      placements,
      zones: [
        zone(
          'zone-reception',
          'Reception',
          'workspace',
          { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.minZ + 2.6 },
          '#4f8cff',
          'Staff side of the counter.',
          ['sofa'],
        ),
        zone(
          'zone-waiting',
          'Waiting Area',
          'circulation',
          { minX: b.minX, maxX: b.maxX, minZ: b.minZ + 2.8, maxZ: b.maxZ - 2.8 },
          '#22d3a7',
          'Patient waiting. The central aisle must stay accessible.',
          ['desk', 'server-rack', 'counter'],
          perRow * 4,
        ),
        entrance.zone,
        exit.zone,
      ],
    }
  },
}

const dataHall: LayoutDefinition = {
  id: 'data-hall',
  name: 'Data hall',
  summary: 'Two cabinet rows either side of a service aisle, with an operator station.',
  matches: ['data hall', 'server room', 'racks', 'data centre', 'data center'],
  build: (room) => {
    const b = bounds(room)
    const entrance = southEntrance(room, 'door-vestibule', 'Access Vestibule')
    const exit = westExit(room)
    const placements: LayoutPlacement[] = [entrance.door, exit.door]

    const perRow = Math.max(3, Math.min(8, Math.floor((b.maxX - b.minX) / 1.8)))
    for (let i = 0; i < perRow; i += 1) {
      const x = b.minX + 0.8 + i * 1.8
      const n = String(i + 1).padStart(2, '0')
      placements.push(
        { id: 'rack-a' + n, type: 'server-rack', position: [x, 0, -1.9], rotation: [0, deg(180), 0], label: 'Rack A' + n },
        { id: 'rack-b' + n, type: 'server-rack', position: [x, 0, 1.9], label: 'Rack B' + n },
      )
    }

    placements.push(
      { id: 'desk-operator', type: 'desk', position: [b.maxX - 1.4, 0, b.maxZ - 1.6], rotation: [0, deg(180), 0], label: 'Operator Desk' },
      { id: 'chair-operator', type: 'chair', position: [b.maxX - 1.4, 0, b.maxZ - 2.5], label: 'Operator Chair' },
      { id: 'storage-spares', type: 'storage-unit', position: [b.minX + 0.6, 0, b.maxZ - 1.6], label: 'Spares' },
    )

    return {
      placements,
      zones: [
        zone(
          'zone-cold-aisle',
          'Cold Aisle',
          'restricted_zone',
          { minX: b.minX, maxX: b.maxX, minZ: -1.0, maxZ: 1.0 },
          '#4f8cff',
          'Service access in front of the rack faces. Must stay clear.',
          ['sofa', 'plant', 'desk', 'meeting-table', 'chair', 'cafe-table'],
        ),
        zone(
          'zone-rack-row-a',
          'Rack Row A',
          'storage',
          { minX: b.minX, maxX: b.maxX, minZ: -3.2, maxZ: -1.1 },
          '#f0b429',
          'North cabinet row.',
          ['sofa', 'plant'],
          perRow + 2,
        ),
        zone(
          'zone-rack-row-b',
          'Rack Row B',
          'storage',
          { minX: b.minX, maxX: b.maxX, minZ: 1.1, maxZ: 3.2 },
          '#f0b429',
          'South cabinet row.',
          ['sofa', 'plant'],
          perRow + 2,
        ),
        entrance.zone,
        exit.zone,
      ],
    }
  },
}

const retail: LayoutDefinition = {
  id: 'retail',
  name: 'Retail floor',
  summary: 'Shelving gondolas in aisles with a till point by the entrance.',
  matches: ['shop', 'store', 'retail', 'supermarket', 'aisles'],
  build: (room) => {
    const b = bounds(room)
    const entrance = southEntrance(room, 'door-shop', 'Shop Entrance')
    const exit = westExit(room)
    const placements: LayoutPlacement[] = [
      { id: 'counter-till', type: 'counter', position: [b.maxX - 1.6, 0, b.maxZ - 1.4], rotation: [0, deg(180), 0], label: 'Till Point' },
      entrance.door,
      exit.door,
    ]

    const aisles = Math.max(2, Math.min(4, Math.floor((b.maxX - b.minX) / 2.6)))
    const unitsPerAisle = Math.max(2, Math.min(4, Math.floor((b.maxZ - b.minZ - 5) / 1.4)))
    for (let a = 0; a < aisles; a += 1) {
      const x = b.minX + 1.0 + a * ((b.maxX - b.minX - 3.4) / Math.max(aisles - 1, 1))
      for (let u = 0; u < unitsPerAisle; u += 1) {
        placements.push({
          id: 'shelf-' + String(a + 1) + '-' + String(u + 1),
          type: 'storage-unit',
          position: [x, 0, b.minZ + 1.2 + u * 1.3],
          rotation: [0, deg(90), 0],
          label: 'Aisle ' + String(a + 1) + ' Unit ' + String(u + 1),
        })
      }
    }

    placements.push({ id: 'plant-shop', type: 'plant', position: [b.minX + 0.6, 0, b.maxZ - 1.4], label: 'Planter' })

    return {
      placements,
      zones: [
        zone(
          'zone-shopfloor',
          'Shop Floor',
          'circulation',
          { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ - 2.6 },
          '#22d3a7',
          'Aisles and customer circulation.',
          ['desk', 'server-rack'],
          aisles * unitsPerAisle,
        ),
        zone(
          'zone-till',
          'Till Point',
          'workspace',
          { minX: b.maxX - 3.2, maxX: b.maxX, minZ: b.maxZ - 2.6, maxZ: b.maxZ },
          '#4f8cff',
          'Checkout. Keep the queue route clear.',
          ['storage-unit'],
        ),
        entrance.zone,
        exit.zone,
      ],
    }
  },
}

const city: LayoutDefinition = {
  id: 'city',
  name: 'City district',
  summary: 'Street grid with residential blocks, a hospital and vehicles on the roads.',
  matches: ['city', 'town', 'district', 'streets', 'urban', 'neighbourhood'],
  // A city is not a classroom: the layout says how much ground it needs, and
  // the room is resized to suit rather than the layout being squeezed into a
  // floor plan.
  room: { width: 120, depth: 80, wallHeight: 24 },
  build: (room) => {
    const placements: LayoutPlacement[] = []
    const halfW = room.width / 2
    const halfD = room.depth / 2

    // Main east-west route, tiled end to end.
    const eastWestTiles = Math.max(2, Math.round((room.width - 8) / 12))
    for (let i = 0; i < eastWestTiles; i += 1) {
      const x = -((eastWestTiles - 1) / 2) * 12 + i * 12
      placements.push({
        id: 'road-ew-' + String(i + 1),
        type: 'road',
        position: [x, 0, 0],
        rotation: [0, deg(90), 0],
        label: 'Main Street ' + String(i + 1),
      })
    }

    // Two north-south avenues.
    const avenueX = [-halfW * 0.5, halfW * 0.5]
    const northSouthTiles = Math.max(2, Math.round((room.depth - 8) / 12))
    avenueX.forEach((x, avenue) => {
      for (let i = 0; i < northSouthTiles; i += 1) {
        const z = -((northSouthTiles - 1) / 2) * 12 + i * 12
        placements.push({
          id: 'road-ns-' + String(avenue + 1) + '-' + String(i + 1),
          type: 'road',
          position: [Math.round(x), 0, z],
          label: (avenue === 0 ? 'West' : 'East') + ' Avenue ' + String(i + 1),
        })
      }
    })

    // Blocks, kept clear of every carriageway.
    const roadX = avenueX.map((x) => Math.round(x))
    const blockZ = [-halfD * 0.6, -halfD * 0.28, halfD * 0.28, halfD * 0.6].map((z) =>
      Math.round(z),
    )
    const columns = 6
    let block = 0
    for (let c = 0; c < columns; c += 1) {
      const x = Math.round(-halfW + 10 + c * ((room.width - 20) / (columns - 1)))
      if (roadX.some((rx) => Math.abs(x - rx) < 7)) continue
      for (const z of blockZ) {
        if (Math.abs(z) < 7) continue
        block += 1
        placements.push({
          id: 'building-' + String(block).padStart(2, '0'),
          type: 'building',
          position: [x, 0, z],
          label: 'Block ' + String(block).padStart(2, '0'),
        })
      }
    }

    // A hospital on the main street, set back from the carriageway.
    placements.push({
      id: 'hospital-district',
      type: 'hospital',
      position: [0, 0, Math.round(-halfD * 0.55)],
      rotation: [0, deg(180), 0],
      label: 'District Hospital',
    })

    // Traffic.
    placements.push(
      { id: 'vehicle-1', type: 'vehicle', position: [-18, 0, -1], rotation: [0, deg(90), 0], label: 'Vehicle 1' },
      { id: 'vehicle-2', type: 'vehicle', position: [12, 0, 1], rotation: [0, deg(-90), 0], label: 'Vehicle 2' },
      { id: 'vehicle-ambulance', type: 'vehicle', position: [4, 0, -8], label: 'Ambulance' },
    )

    // Access at either end of the main street.
    placements.push(
      {
        id: 'door-west-access',
        type: 'door',
        position: [-halfW + 3, 0, 0],
        rotation: [0, deg(90), 0],
        label: 'West Access',
        tags: ['entrance'],
      },
      {
        id: 'door-east-access',
        type: 'door',
        position: [halfW - 3, 0, 0],
        rotation: [0, deg(-90), 0],
        label: 'East Access',
        tags: ['emergency-exit'],
      },
    )

    return {
      placements,
      zones: [
        zone(
          'zone-main-street',
          'Main Street',
          'circulation',
          { minX: -halfW, maxX: halfW, minZ: -6, maxZ: 6 },
          '#22d3a7',
          'Primary east-west route. Emergency vehicles depend on it.',
          ['building', 'hospital', 'desk', 'sofa', 'storage-unit'],
        ),
        zone(
          'zone-hospital-grounds',
          'Hospital Grounds',
          'emergency_zone',
          {
            minX: -8,
            maxX: 8,
            minZ: Math.round(-halfD * 0.55) - 7,
            maxZ: Math.round(-halfD * 0.55) + 9,
          },
          '#f2617a',
          'Ambulance approach and forecourt. Must stay driveable.',
          ['building', 'barrier', 'storage-unit'],
        ),
        zone(
          'zone-north-quarter',
          'North Quarter',
          'restricted_zone',
          { minX: -halfW, maxX: halfW, minZ: -halfD, maxZ: -7 },
          '#4f8cff',
          'Residential blocks north of the main street.',
          [],
          14,
        ),
        zone(
          'zone-south-quarter',
          'South Quarter',
          'restricted_zone',
          { minX: -halfW, maxX: halfW, minZ: 7, maxZ: halfD },
          '#8f9bb3',
          'Residential blocks south of the main street.',
          [],
          14,
        ),
      ],
    }
  },
}

export const LAYOUTS: LayoutDefinition[] = [
  openPlanOffice,
  classroom,
  cafe,
  clinic,
  dataHall,
  retail,
  city,
]

export const LAYOUT_IDS = LAYOUTS.map((layout) => layout.id)

export const getLayout = (id: string): LayoutDefinition | undefined =>
  LAYOUTS.find((layout) => layout.id === id)

/** Builds a layout's objects and zones for a given room. */
export function buildLayout(id: string, room: RoomConfig): LayoutResult | null {
  const layout = getLayout(id)
  if (!layout) return null

  const { placements, zones } = layout.build(room)
  return {
    objects: placements.map((placement) =>
      createSceneObject(
        placement.type,
        {
          id: placement.id,
          position: placement.position,
          rotation: placement.rotation,
          label: placement.label,
          tags: placement.tags,
        },
        SYSTEM_ACTOR,
      ),
    ),
    zones,
  }
}
