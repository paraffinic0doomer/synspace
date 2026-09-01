import type { Zone } from '@/types'

/**
 * Zones for the shipped studio floor.
 *
 * Rectangles in world metres — the origin is the centre of the floor, so a
 * room 18 x 14 spans x -9..9 and z -7..7. See `COORDINATE_SYSTEM`.
 *
 * Zones are part of the world document, so they are versioned and undoable
 * alongside everything else.
 */
export const DEFAULT_ZONES: Zone[] = [
  {
    id: 'zone-workspace-a',
    name: 'Workstation Bank A',
    kind: 'workspace',
    bounds: { minX: -7.6, maxX: -3.0, minZ: -4.6, maxZ: 1.6 },
    color: '#4f8cff',
    description: 'Focused desk work. Three sit-stand workstations behind acoustic dividers.',
    disallowedTypes: [],
    capacity: 10,
  },
  {
    id: 'zone-meeting',
    name: 'Review Room',
    kind: 'meeting_area',
    bounds: { minX: 1.0, maxX: 5.6, minZ: -5.2, maxZ: -0.5 },
    color: '#22d3a7',
    description: 'Six-seat collaboration space around the review table.',
    disallowedTypes: [],
    capacity: 8,
  },
  {
    id: 'zone-storage',
    name: 'Server Aisle',
    kind: 'storage',
    bounds: { minX: 6.0, maxX: 8.9, minZ: -6.6, maxZ: -2.4 },
    color: '#f0b429',
    description: 'Rack infrastructure. Keep the aisle in front of the cabinets clear.',
    disallowedTypes: ['sofa', 'plant'],
    capacity: 6,
  },
  {
    id: 'zone-circulation',
    name: 'Central Concourse',
    kind: 'circulation',
    bounds: { minX: -3.0, maxX: 5.6, minZ: 0.0, maxZ: 4.6 },
    color: '#8f9bb3',
    description: 'Main east-west route and breakout seating.',
    disallowedTypes: [],
  },
  {
    id: 'zone-entrance',
    name: 'Main Entry Approach',
    kind: 'entrance_zone',
    bounds: { minX: -2.2, maxX: 2.2, minZ: 4.6, maxZ: 7.0 },
    color: '#7ba9ff',
    description: 'Approach to the main door. Must stay clear for arrival and delivery.',
    disallowedTypes: ['desk', 'meeting-table', 'server-rack', 'sofa'],
  },
  {
    id: 'zone-emergency',
    name: 'Emergency Egress',
    kind: 'emergency_zone',
    bounds: { minX: -9.0, maxX: -6.4, minZ: 2.4, maxZ: 5.6 },
    color: '#f2617a',
    description: 'Protected route to the emergency exit. Nothing may obstruct it.',
    disallowedTypes: ['desk', 'meeting-table', 'server-rack', 'sofa', 'partition', 'chair'],
  },
]

export const getZone = (zones: Zone[], id: string): Zone | undefined =>
  zones.find((zone) => zone.id === id)

/** Floor area a zone covers, in square metres. */
export const zoneArea = (zone: Zone): number =>
  Math.round((zone.bounds.maxX - zone.bounds.minX) * (zone.bounds.maxZ - zone.bounds.minZ) * 100) /
  100

export const ZONE_KIND_LABELS: Record<Zone['kind'], string> = {
  workspace: 'Workspace',
  meeting_area: 'Meeting area',
  storage: 'Storage',
  circulation: 'Circulation',
  entrance_zone: 'Entrance',
  emergency_zone: 'Emergency',
  restricted_zone: 'Restricted',
}
