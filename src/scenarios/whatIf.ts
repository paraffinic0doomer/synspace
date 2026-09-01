import { entrances, emergencyExits } from '@/spatial'
import type { ScenarioOperation, World, Zone } from '@/types'
import { roundTo } from '@/utils'

/**
 * "What if?" questions, expressed as scenario operations.
 *
 * Each question resolves against the *current* world — which zone has room,
 * where the entrance actually is — so the same question stays sensible in the
 * workspace preset and the server room without being rewritten. A question that
 * cannot be answered in this world reports why instead of producing nonsense.
 */

export interface WhatIfQuestion {
  id: string
  /** Shown to the human, phrased the way they would ask it. */
  question: string
  /** What the resulting scenario will contain. */
  intent: string
  build: (world: World) => { ok: true; operations: ScenarioOperation[] } | { ok: false; reason: string }
}

const largestZone = (world: World, kinds: Zone['kind'][]): Zone | null => {
  const candidates = world.zones.filter((zone) => kinds.includes(zone.kind))
  if (candidates.length === 0) return null
  return candidates.reduce((best, zone) => {
    const area = (rect: Zone['bounds']) => (rect.maxX - rect.minX) * (rect.maxZ - rect.minZ)
    if (area(zone.bounds) > area(best.bounds)) return zone
    if (area(zone.bounds) < area(best.bounds)) return best
    return zone.id < best.id ? zone : best
  })
}

const ADD_PEOPLE: WhatIfQuestion = {
  id: 'add-people',
  question: 'What if we add 10 more people?',
  intent: 'Adds 10 seats to the largest work area and re-checks capacity and circulation.',
  build: (world) => {
    const zone = largestZone(world, ['workspace', 'circulation', 'meeting_area'])
    if (!zone) return { ok: false, reason: 'This world has no work area to add people to.' }
    return {
      ok: true,
      operations: [
        {
          kind: 'add_object',
          assetType: 'chair',
          count: 10,
          zoneId: zone.id,
          labelPrefix: 'Added seat',
        },
      ],
    }
  },
}

const BLOCK_ENTRANCE: WhatIfQuestion = {
  id: 'block-entrance',
  question: 'What if the main entrance becomes unavailable?',
  intent: 'Blocks the main door and re-checks whether every part of the floor can still get out.',
  build: (world) => {
    const [door] = entrances(world)
    if (!door) return { ok: false, reason: 'This world has no entrance to block.' }

    // Sit the barrier just inside the door, along its facing axis.
    const angle = door.rotation[1]
    const inward = { x: Math.sin(angle), z: Math.cos(angle) }
    const toCentre = { x: -door.position[0], z: -door.position[2] }
    const sign = inward.x * toCentre.x + inward.z * toCentre.z >= 0 ? 1 : -1

    return {
      ok: true,
      operations: [
        {
          kind: 'block_path',
          position: [
            roundTo(door.position[0] + inward.x * 1.0 * sign, 3),
            0,
            roundTo(door.position[2] + inward.z * 1.0 * sign, 3),
          ],
          width: 2.4,
          depth: 0.4,
          label: `${door.label} closed`,
        },
      ],
    }
  },
}

const ADD_MEETING_ROOM: WhatIfQuestion = {
  id: 'add-meeting-room',
  question: 'What if we add another meeting room?',
  intent: 'Adds a table and four seats, then re-checks walkways and spacing around them.',
  build: (world) => {
    const zone = largestZone(world, ['circulation', 'workspace'])
    if (!zone) return { ok: false, reason: 'This world has no open area for another meeting space.' }
    return {
      ok: true,
      operations: [
        {
          kind: 'add_object',
          assetType: 'meeting-table',
          count: 1,
          zoneId: zone.id,
          labelPrefix: 'New meeting table',
        },
        {
          kind: 'add_object',
          assetType: 'chair',
          count: 4,
          zoneId: zone.id,
          labelPrefix: 'New meeting seat',
        },
      ],
    }
  },
}

const WIDER_EGRESS: WhatIfQuestion = {
  id: 'wider-egress',
  question: 'What if we need a wider emergency path?',
  intent: 'Raises the emergency egress requirement to 1.6 m and shows what stops complying.',
  build: (world) => {
    const constraint = world.constraints.find((candidate) => candidate.kind === 'exit-clearance')
    if (!constraint) return { ok: false, reason: 'This world has no emergency egress rule.' }
    if (emergencyExits(world).length === 0) {
      return { ok: false, reason: 'This world has no emergency exit to measure a route to.' }
    }
    return {
      ok: true,
      operations: [
        { kind: 'change_constraint', constraintId: constraint.id, value: 1.6 },
      ],
    }
  },
}

const MORE_STORAGE: WhatIfQuestion = {
  id: 'more-storage',
  question: 'What if we add six more racks?',
  intent: 'Adds six cabinets to the storage area and re-checks aisle width and spacing.',
  build: (world) => {
    const zone = largestZone(world, ['storage'])
    if (!zone) return { ok: false, reason: 'This world has no storage area.' }
    return {
      ok: true,
      operations: [
        {
          kind: 'add_object',
          assetType: 'server-rack',
          count: 6,
          zoneId: zone.id,
          labelPrefix: 'Added rack',
        },
      ],
    }
  },
}

export const WHAT_IF_QUESTIONS: WhatIfQuestion[] = [
  ADD_PEOPLE,
  BLOCK_ENTRANCE,
  ADD_MEETING_ROOM,
  WIDER_EGRESS,
  MORE_STORAGE,
]

/** Only the questions this world can actually answer. */
export const availableWhatIfQuestions = (world: World): WhatIfQuestion[] =>
  WHAT_IF_QUESTIONS.filter((question) => question.build(world).ok)

export const getWhatIfQuestion = (id: string): WhatIfQuestion | undefined =>
  WHAT_IF_QUESTIONS.find((question) => question.id === id)
