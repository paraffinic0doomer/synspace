import { beforeEach, describe, expect, it } from 'vitest'
import { SYNSPACE_TOOLS, TOOL_NAMES } from '@/mcp/tools'
import {
  boundaryViolations,
  boundingBoxOverlap,
  distanceBetween,
  nearestObjects,
  objectsInZone,
  objectsWithinRadius,
  pathClearance,
} from '@/spatial'
import { useSceneStore, worldApi } from '@/state'
import { createStarterScene } from '@/tools/sceneTemplates'
import type { SceneObject, World } from '@/types'

const FIXED_TIME = 1_700_000_000_000

/**
 * Phase 4 verification fixture: multiple zones and objects, two kinds of door,
 * infrastructure and solid obstacles. IDs and timestamps are fixed so two
 * independently-created worlds are byte-for-byte equivalent.
 */
function createTestWorld(): World {
  const starter = createStarterScene()
  return {
    ...starter,
    id: 'world-phase-4-test',
    name: 'Phase 4 deterministic test world',
    objects: starter.objects.map((object, index) => ({
      ...object,
      id: `object-${String(index + 1).padStart(2, '0')}`,
      position: [...object.position],
      rotation: [...object.rotation],
      scale: [...object.scale],
      dimensions: { ...object.dimensions },
      metadata: {
        ...object.metadata,
        createdAt: FIXED_TIME,
        updatedAt: FIXED_TIME,
        tags: [...object.metadata.tags],
        custom: { ...object.metadata.custom },
      },
    })),
    zones: starter.zones.map((zone) => ({
      ...zone,
      bounds: { ...zone.bounds },
      disallowedTypes: [...zone.disallowedTypes],
    })),
    environment: { ...starter.environment, room: { ...starter.environment.room } },
    constraints: starter.constraints.map((constraint) => ({
      ...constraint,
      appliesTo: [...constraint.appliesTo],
    })),
    metadata: {
      ...starter.metadata,
      createdAt: FIXED_TIME,
      updatedAt: FIXED_TIME,
      revision: 1,
      tags: [...starter.metadata.tags],
    },
  }
}

function objectByLabel(world: World, label: string): SceneObject {
  const object = world.objects.find((candidate) => candidate.label === label)
  if (!object) throw new Error(`Missing fixture object: ${label}`)
  return object
}

function tool(name: string) {
  const result = SYNSPACE_TOOLS.find((candidate) => candidate.name === name)
  if (!result) throw new Error(`Missing WebMCP tool: ${name}`)
  return result
}

beforeEach(() => {
  useSceneStore.setState({
    scene: createTestWorld(),
    selectedId: null,
    hoveredId: null,
    pending: null,
    history: { past: [], future: [], limit: 60 },
  })
})

describe('deterministic world model', () => {
  it('creates a stable test world with zones, entrances, exits and obstacles', () => {
    const first = createTestWorld()
    const second = createTestWorld()

    expect(first).toEqual(second)
    expect(first.zones.length).toBeGreaterThan(1)
    expect(first.objects.some((object) => object.metadata.tags.includes('entrance'))).toBe(true)
    expect(first.objects.some((object) => object.metadata.tags.includes('emergency-exit'))).toBe(
      true,
    )
    expect(first.objects.some((object) => object.type === 'partition')).toBe(true)
  })

  it('returns stable distance, nearest, radius, zone and path query results', () => {
    const world = createTestWorld()
    const desk = objectByLabel(world, 'Desk · A1')
    const chair = objectByLabel(world, 'Chair · A1')

    expect(distanceBetween(world, desk.id, chair.id)).toBe(0.3)
    expect(boundingBoxOverlap(desk, chair)).toBe(false)
    expect(nearestObjects(world, desk.id, 4)).toEqual(nearestObjects(world, desk.id, 4))
    expect(objectsWithinRadius(world, { x: desk.position[0], z: desk.position[2] }, 0)).toEqual([
      expect.objectContaining({ object: expect.objectContaining({ id: desk.id }), gap: 0 }),
    ])

    const workspaceIds = objectsInZone(world, 'zone-workspace-a').map((object) => object.id)
    expect(workspaceIds).toContain(desk.id)
    expect(workspaceIds).toEqual([...workspaceIds].sort())

    const routeA = pathClearance(world, { x: 0, z: 6 }, { x: 0, z: 0 })
    const routeB = pathClearance(world, { x: 0, z: 6 }, { x: 0, z: 0 })
    expect(routeA).toEqual(routeB)
    expect(routeA.reachable).toBe(true)
  })
})

describe('central store and world boundaries', () => {
  it('makes human modifications immediately visible through the world read API', () => {
    const before = useSceneStore.getState().scene
    const desk = objectByLabel(before, 'Desk · A1')

    expect(useSceneStore.getState().moveObject(desk.id, [2, 0, -2])).toBe(true)

    const after = useSceneStore.getState().scene
    const view = worldApi.getObjectView(desk.id, after)
    expect(after.metadata.revision).toBe(before.metadata.revision + 1)
    expect(view?.position).toEqual([2, 0, -2])
    expect(view?.zoneId).toBe('zone-meeting')
    expect(after.objects.find((object) => object.id === desk.id)?.metadata.lastModifiedBy.kind).toBe(
      'human',
    )
  })

  it('clamps rotated footprints and reports externally introduced violations', () => {
    const world = createTestWorld()
    const sofa = objectByLabel(world, 'Lounge Sofa')
    sofa.position = [8.5, 0, 0]
    sofa.rotation = [0, Math.PI / 2, 0]
    useSceneStore.setState({ scene: world })

    expect(useSceneStore.getState().rotateObject(sofa.id, [0, 0, 0])).toBe(true)
    const contained = useSceneStore.getState().scene
    expect(boundaryViolations(contained)).toEqual([])
    expect(contained.objects.find((object) => object.id === sofa.id)?.position[0]).toBeCloseTo(7.95)

    const invalid = structuredClone(contained)
    invalid.objects.find((object) => object.id === sofa.id)!.position = [20, 0, 0]
    expect(boundaryViolations(invalid)).toEqual([
      expect.objectContaining({ objectId: sofa.id, status: 'outside' }),
    ])
  })

  it('re-contains objects when the room boundary shrinks', () => {
    useSceneStore.getState().updateEnvironment({
      room: { width: 12, depth: 10, wallHeight: 3 },
    })
    expect(boundaryViolations(useSceneStore.getState().scene)).toEqual([])
  })
})

describe('Phase 3 WebMCP compatibility', () => {
  it('retains the complete Phase 3 tool surface', () => {
    expect(TOOL_NAMES.slice(0, 9)).toEqual([
      'spawn_3d_asset',
      'read_scene_graph',
      'move_3d_asset',
      'rotate_3d_asset',
      'delete_3d_asset',
      'check_constraints',
      'optimize_layout',
      'change_environment_variables',
      'clear_canvas',
    ])
    expect(TOOL_NAMES).toEqual(
      expect.arrayContaining([
        'inspect_world',
        'query_spatial_relationships',
        'create_scenario',
        'modify_scenario',
        'analyze_scenario',
        'compare_scenarios',
        'apply_scenario',
        'discard_scenario',
      ]),
    )
  })

  it('read_scene_graph exposes the enriched live world representation', () => {
    const world = useSceneStore.getState().scene
    const desk = objectByLabel(world, 'Desk · A1')
    useSceneStore.getState().moveObject(desk.id, [2, 0, -2])

    const outcome = tool('read_scene_graph').run({ object_id: desk.id })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.data).toMatchObject({
      world_id: 'world-phase-4-test',
      coordinate_system: { units: 'meters' },
      object_count: world.objects.length,
      selected_object_id: null,
    })
    expect(outcome.data.zones).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'zone-meeting' })]))
    expect(outcome.data.constraints).toEqual(expect.any(Array))
    expect(outcome.data.focus).toMatchObject({ object_id: desk.id, zone_id: 'zone-meeting' })
    expect(outcome.data.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: desk.id, zone_id: 'zone-meeting', position: { x: 2, y: 0, z: -2 } }),
      ]),
    )
  })

  it('keeps Phase 3 move validation and mutation behavior working', () => {
    const desk = objectByLabel(useSceneStore.getState().scene, 'Desk · A1')
    const outcome = tool('move_3d_asset').run({ object_id: desk.id, x: 200, z: 0 })
    expect(outcome).toMatchObject({ ok: true, data: { status: 'moved_clamped_to_room' } })

    const moved = tool('move_3d_asset').run({ object_id: desk.id, x: 1, z: 1 })
    expect(moved).toMatchObject({ ok: true, data: { status: 'moved' } })
    expect(worldApi.getObjectView(desk.id)?.position).toEqual([1, 0, 1])
  })
})
