import { beforeEach, describe, expect, it } from 'vitest'
import { SYNSPACE_TOOLS } from '@/mcp/tools'
import { SCENARIO_TOOLS } from '@/mcp/scenarioTools'
import { calculateWorldMetrics } from '@/scenarios'
import { useScenarioStore, useSceneStore } from '@/state'
import { createStarterScene } from '@/tools/sceneTemplates'
import type { SceneObject, World } from '@/types'

const FIXED_TIME = 1_700_000_000_000

function createCurrentWorld(): World {
  const starter = createStarterScene()
  return {
    ...starter,
    id: 'world-phase-5-test',
    name: 'Phase 5 scenario test world',
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
  const found = SYNSPACE_TOOLS.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`Missing tool: ${name}`)
  return found
}

beforeEach(() => {
  useSceneStore.setState({
    scene: createCurrentWorld(),
    selectedId: null,
    hoveredId: null,
    pending: null,
    history: { past: [], future: [], limit: 60 },
  })
  useScenarioStore.getState().clearScenarios()
})

describe('isolated scenario lifecycle', () => {
  it('creates, modifies, analyzes, compares, rejects, then applies a second scenario', () => {
    const currentBefore = structuredClone(useSceneStore.getState().scene)
    const baseCount = currentBefore.objects.length

    const first = useScenarioStore.getState().createScenario('Ten more desks')
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const modified = useScenarioStore.getState().modifyScenario(first.data.id, {
      kind: 'add_object',
      assetType: 'desk',
      count: 10,
      zoneId: 'zone-workspace-a',
      labelPrefix: 'Expansion desk',
    })
    expect(modified.ok).toBe(true)
    if (!modified.ok) return

    expect(modified.data.world.objects).toHaveLength(baseCount + 10)
    expect(useSceneStore.getState().scene).toEqual(currentBefore)

    const analysis = useScenarioStore.getState().analyzeScenario(first.data.id)
    expect(analysis.ok).toBe(true)
    if (!analysis.ok) return
    expect(analysis.data.metrics.objectCount).toBe(baseCount + 10)
    expect(analysis.data.violations[0]).toEqual(
      expect.objectContaining({
        kind: expect.any(String),
        severity: expect.any(String),
        objectIds: expect.any(Array),
        measured: expect.any(Number),
        required: expect.any(Number),
        message: expect.any(String),
      }),
    )

    const comparison = useScenarioStore.getState().compareScenario(first.data.id)
    expect(comparison.ok).toBe(true)
    if (!comparison.ok) return
    expect(comparison.data.metrics.find((metric) => metric.key === 'objectCount')).toMatchObject({
      current: baseCount,
      scenario: baseCount + 10,
      difference: 10,
    })
    expect(comparison.data.changes).toHaveLength(1)
    expect(useSceneStore.getState().scene).toEqual(currentBefore)

    const rejected = useScenarioStore.getState().discardScenario(first.data.id)
    expect(rejected).toMatchObject({ ok: true, data: { status: 'discarded' } })
    expect(useSceneStore.getState().scene).toEqual(currentBefore)

    const second = useScenarioStore.getState().createScenario('Add two plants')
    expect(second.ok).toBe(true)
    if (!second.ok) return
    const secondModified = useScenarioStore.getState().modifyScenario(second.data.id, {
      kind: 'add_object',
      assetType: 'plant',
      count: 2,
      zoneId: 'zone-circulation',
    })
    expect(secondModified.ok).toBe(true)
    expect(useSceneStore.getState().scene.objects).toHaveLength(baseCount)

    const applied = useScenarioStore.getState().applyScenario(second.data.id)
    expect(applied).toMatchObject({ ok: true, data: { status: 'applied' } })
    expect(useSceneStore.getState().scene.objects).toHaveLength(baseCount + 2)
    expect(useSceneStore.getState().history.past).toHaveLength(1)
  })

  it('calculates repeatable metrics and supports capacity, path, move, remove, and constraint operations', () => {
    const created = useScenarioStore.getState().createScenario('Operation coverage')
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const id = created.data.id
    const desk = objectByLabel(created.data.world, 'Desk · A1')

    expect(
      useScenarioStore.getState().modifyScenario(id, {
        kind: 'change_capacity',
        zoneId: 'zone-workspace-a',
        capacity: 20,
      }).ok,
    ).toBe(true)
    expect(
      useScenarioStore.getState().modifyScenario(id, {
        kind: 'block_path',
        position: [0, 0, 2],
        width: 4,
        depth: 0.5,
      }).ok,
    ).toBe(true)
    expect(
      useScenarioStore.getState().modifyScenario(id, {
        kind: 'move_object',
        objectId: desk.id,
        position: [2, 0, -2],
      }).ok,
    ).toBe(true)
    expect(
      useScenarioStore.getState().modifyScenario(id, {
        kind: 'change_constraint',
        constraintId: 'walkway-primary',
        value: 1.6,
      }).ok,
    ).toBe(true)
    expect(
      useScenarioStore.getState().modifyScenario(id, {
        kind: 'remove_object',
        objectId: desk.id,
      }).ok,
    ).toBe(true)

    const scenario = useScenarioStore.getState().scenarios.find((candidate) => candidate.id === id)!
    expect(scenario.world.zones.find((zone) => zone.id === 'zone-workspace-a')?.capacity).toBe(20)
    expect(scenario.world.constraints.find((rule) => rule.id === 'walkway-primary')?.value).toBe(1.6)
    expect(scenario.world.objects.some((object) => object.metadata.tags.includes('scenario-path-block'))).toBe(true)
    expect(scenario.world.objects.some((object) => object.id === desk.id)).toBe(false)

    expect(calculateWorldMetrics(scenario.world)).toEqual(calculateWorldMetrics(scenario.world))
  })

  it('rejects applying a scenario after the current world revision changes', () => {
    const created = useScenarioStore.getState().createScenario('Stale scenario')
    expect(created.ok).toBe(true)
    if (!created.ok) return
    useScenarioStore.getState().modifyScenario(created.data.id, {
      kind: 'add_object',
      assetType: 'plant',
      count: 1,
    })
    useSceneStore.getState().addObject('chair')

    const result = useScenarioStore.getState().applyScenario(created.data.id)
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.error).toContain('stale')
  })
})

describe('scenario WebMCP tools', () => {
  it('performs the isolated create/modify/analyze/compare/apply flow with strict inputs', () => {
    expect(SCENARIO_TOOLS.map((candidate) => candidate.name)).toContain('create_scenario')
    const baseCount = useSceneStore.getState().scene.objects.length
    const created = tool('create_scenario').run({ name: 'MCP expansion' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const scenarioId = created.data.scenario_id as string

    const invalid = tool('modify_scenario').run({
      scenario_id: scenarioId,
      operation: { kind: 'add_object', asset_type: 'desk', count: 2, secret: true },
    })
    expect(invalid.ok).toBe(false)

    const modified = tool('modify_scenario').run({
      scenario_id: scenarioId,
      operation: {
        kind: 'add_object',
        asset_type: 'desk',
        count: 2,
        zone_id: 'zone-workspace-a',
      },
    })
    expect(modified).toMatchObject({
      ok: true,
      data: {
        hypothetical_object_count: baseCount + 2,
        current_world_object_count: baseCount,
        current_world_unchanged: true,
      },
    })

    expect(tool('inspect_world').run({ scenario_id: scenarioId }).ok).toBe(true)
    expect(tool('analyze_scenario').run({ scenario_id: scenarioId }).ok).toBe(true)
    const compared = tool('compare_scenarios').run({ scenario_id: scenarioId })
    expect(compared.ok).toBe(true)
    if (compared.ok) {
      expect(compared.data.metric_differences).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ metric: 'objectCount', difference: 2 }),
        ]),
      )
      expect(compared.data.recommendation).toEqual(
        expect.objectContaining({ decision: expect.any(String), explanation: expect.any(String) }),
      )
    }

    expect(tool('apply_scenario').run({ scenario_id: scenarioId, confirm: false }).ok).toBe(false)
    const applied = tool('apply_scenario').run({ scenario_id: scenarioId, confirm: true })
    expect(applied).toMatchObject({
      ok: true,
      data: { status: 'applied', current_world_object_count: baseCount + 2 },
    })
  })
})
