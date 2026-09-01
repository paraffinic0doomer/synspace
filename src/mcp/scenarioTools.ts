import { calculateWorldMetrics } from '@/scenarios'
import { evaluateConstraints } from '@/spatial'
import { useScenarioStore, useSceneStore, worldApi } from '@/state'
import type {
  ConstraintSeverity,
  Scenario,
  ScenarioAnalysis,
  ScenarioComparison,
  ScenarioOperation,
  Vec3,
  World,
  WorldMetrics,
} from '@/types'
import { agentActor } from '@/types'

import { toDegrees } from '@/utils'
import type { SynSpaceTool, ToolOutcome } from './tools'
import { assetKindDescription } from './validation'
import {
  asRecord,
  optionalIdList,
  requireAssetType,
  requireNumber,
  requirePosition,
  requireRotation,
  requireString,
  type Validated,
} from './validation'

const SCENARIO_AGENT_ACTOR = agentActor('Agent')

const fail = (error: string): ToolOutcome => ({ ok: false, error })
const done = (data: Record<string, unknown>): ToolOutcome => ({ ok: true, data })
const scenarios = () => useScenarioStore.getState()

function check<T>(result: Validated<T>): { ok: true; value: T } | { ok: false; outcome: ToolOutcome } {
  return result.ok ? { ok: true, value: result.value } : { ok: false, outcome: fail(result.error) }
}

function strictRecord(
  input: unknown,
  allowed: readonly string[],
  label = 'Arguments',
): Validated<Record<string, unknown>> {
  const record = asRecord(input)
  if (!record.ok) return record
  const unknown = Object.keys(record.value).filter((key) => !allowed.includes(key))
  return unknown.length > 0
    ? { ok: false, error: `${label} contains unsupported field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}.` }
    : record
}

function findScenario(id: string): Scenario | undefined {
  return scenarios().scenarios.find((scenario) => scenario.id === id)
}

function resolveWorld(args: Record<string, unknown>): Validated<{
  world: World
  source: 'current' | 'scenario'
  scenario?: Scenario
}> {
  const raw = args.scenario_id
  if (raw === undefined || raw === null) {
    return { ok: true, value: { world: useSceneStore.getState().scene, source: 'current' } }
  }
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, error: '"scenario_id" must be a non-empty string.' }
  }
  const scenario = findScenario(raw)
  if (!scenario) return { ok: false, error: `No scenario with id "${raw}".` }
  if (scenario.status === 'discarded') {
    return { ok: false, error: `Scenario "${scenario.name}" was discarded.` }
  }
  return { ok: true, value: { world: scenario.world, source: 'scenario', scenario } }
}

const scenarioIdSchema = { type: 'string', description: 'Scenario id returned by create_scenario.' }
const numberSchema = { type: 'number' } as const

const inspectWorld: SynSpaceTool = {
  name: 'inspect_world',
  description:
    'Return deterministic world metrics and a concise structured constraint summary for the current world or an isolated scenario.',
  inputSchema: {
    type: 'object',
    properties: {
      scenario_id: scenarioIdSchema,
      selected_object_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional object ids used only for the average pair-distance metric.',
      },
    },
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(strictRecord(input, ['scenario_id', 'selected_object_ids']))
    if (!args.ok) return args.outcome
    const target = check(resolveWorld(args.value))
    if (!target.ok) return target.outcome
    const ids = check(optionalIdList(args.value, 'selected_object_ids'))
    if (!ids.ok) return ids.outcome
    const report = evaluateConstraints(target.value.world)
    const metrics = calculateWorldMetrics(target.value.world, ids.value)
    return done({
      source: target.value.source,
      scenario_id: target.value.scenario?.id,
      scenario_status: target.value.scenario?.status,
      world_id: target.value.world.id,
      world_name: target.value.world.name,
      world_revision: target.value.world.metadata.revision,
      metrics: serializeMetrics(metrics),
      constraint_summary: report.summary,
      violation_count: report.violations.length,
      zone_capacities: metrics.zoneCapacities.map((zone) => ({
        zone_id: zone.zoneId,
        zone_name: zone.zoneName,
        object_count: zone.objectCount,
        capacity: zone.capacity,
        remaining: zone.remaining,
        over_capacity: zone.overCapacity,
      })),
    })
  },
}

const querySpatialRelationships: SynSpaceTool = {
  name: 'query_spatial_relationships',
  description:
    'Inspect one object in the current world or a scenario: zone membership, boundary status, derived relationships, and nearest objects.',
  inputSchema: {
    type: 'object',
    properties: {
      object_id: { type: 'string' },
      scenario_id: scenarioIdSchema,
      limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
    },
    required: ['object_id'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(strictRecord(input, ['object_id', 'scenario_id', 'limit']))
    if (!args.ok) return args.outcome
    const objectId = check(requireString(args.value, 'object_id'))
    if (!objectId.ok) return objectId.outcome
    const target = check(resolveWorld(args.value))
    if (!target.ok) return target.outcome
    const limit = check(requireNumber(args.value, 'limit', { min: 1, max: 20, fallback: 5 }))
    if (!limit.ok) return limit.outcome
    if (!Number.isInteger(limit.value)) return fail('"limit" must be an integer.')
    const view = worldApi.getObjectView(objectId.value as string, target.value.world)
    if (!view) return fail(`No object with id "${objectId.value}" in the requested world.`)

    return done({
      source: target.value.source,
      scenario_id: target.value.scenario?.id,
      object: {
        id: view.id,
        label: view.label,
        type: view.type,
        category: view.category,
        zone_id: view.zoneId,
        zone_name: view.zoneName,
        boundary: view.boundary,
        position: { x: view.position[0], y: view.position[1], z: view.position[2] },
        rotation_degrees: {
          x: toDegrees(view.rotation[0]),
          y: toDegrees(view.rotation[1]),
          z: toDegrees(view.rotation[2]),
        },
      },
      relationships: worldApi.getRelationships(view.id, target.value.world).map((relationship) => ({
        type: relationship.kind,
        target_type: relationship.targetKind,
        target_id: relationship.objectId,
        distance_m: relationship.distance,
        explanation: relationship.label,
      })),
      nearest_objects: worldApi
        .getNeighbours(view.id, limit.value, target.value.world)
        .map((neighbour) => ({
          object_id: neighbour.object.id,
          label: neighbour.object.label,
          gap_m: neighbour.gap,
          centre_distance_m: neighbour.centreDistance,
        })),
    })
  },
}

const createScenario: SynSpaceTool = {
  name: 'create_scenario',
  description:
    'Clone the current world into an isolated what-if scenario. This does not modify the current world.',
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string', minLength: 1, maxLength: 100 } },
    required: ['name'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(strictRecord(input, ['name']))
    if (!args.ok) return args.outcome
    const name = check(requireString(args.value, 'name'))
    if (!name.ok) return name.outcome
    if ((name.value as string).length > 100) return fail('Scenario name must not exceed 100 characters.')
    const result = scenarios().createScenario(name.value as string, SCENARIO_AGENT_ACTOR)
    return result.ok
      ? done({
          scenario_id: result.data.id,
          name: result.data.name,
          status: result.data.status,
          base_world_id: result.data.baseWorldId,
          base_world_revision: result.data.baseWorldRevision,
          object_count: result.data.world.objects.length,
          current_world_unchanged: true,
        })
      : fail(result.error)
  },
}

const operationSchema = {
  oneOf: [
    {
      type: 'object',
      properties: {
        kind: { const: 'add_object' },
        asset_type: { type: 'string', description: assetKindDescription('Kind of asset to add.') },
        count: { type: 'integer', minimum: 1, maximum: 50 },
        zone_id: { type: 'string' },
        x: numberSchema,
        y: numberSchema,
        z: numberSchema,
        rotation_degrees: {
          anyOf: [
            { type: 'number' },
            { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
          ],
        },
        label_prefix: { type: 'string' },
      },
      required: ['kind', 'asset_type', 'count'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { kind: { const: 'remove_object' }, object_id: { type: 'string' } },
      required: ['kind', 'object_id'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        kind: { const: 'move_object' },
        object_id: { type: 'string' },
        x: numberSchema,
        y: numberSchema,
        z: numberSchema,
      },
      required: ['kind', 'object_id', 'x', 'z'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        kind: { const: 'change_capacity' },
        zone_id: { type: 'string' },
        capacity: { type: 'integer', minimum: 0, maximum: 1000 },
      },
      required: ['kind', 'zone_id', 'capacity'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        kind: { const: 'block_path' },
        x: numberSchema,
        y: numberSchema,
        z: numberSchema,
        width: { type: 'number', exclusiveMinimum: 0, maximum: 20 },
        depth: { type: 'number', exclusiveMinimum: 0, maximum: 20 },
        label: { type: 'string' },
      },
      required: ['kind', 'x', 'z', 'width', 'depth'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        kind: { const: 'change_constraint' },
        constraint_id: { type: 'string' },
        value: { type: 'number', minimum: 0, maximum: 100 },
        enabled: { type: 'boolean' },
        severity: { type: 'string', enum: ['error', 'warning', 'info'] },
      },
      required: ['kind', 'constraint_id'],
      additionalProperties: false,
    },
  ],
} as const

const modifyScenario: SynSpaceTool = {
  name: 'modify_scenario',
  description:
    'Apply one high-level hypothetical operation to a scenario: add/remove/move objects, change zone capacity, block a path, or change a constraint. The current world remains unchanged.',
  inputSchema: {
    type: 'object',
    properties: { scenario_id: scenarioIdSchema, operation: operationSchema },
    required: ['scenario_id', 'operation'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(strictRecord(input, ['scenario_id', 'operation']))
    if (!args.ok) return args.outcome
    const scenarioId = check(requireString(args.value, 'scenario_id'))
    if (!scenarioId.ok) return scenarioId.outcome
    const operation = parseOperation(args.value.operation)
    if (!operation.ok) return fail(operation.error)
    const result = scenarios().modifyScenario(
      scenarioId.value as string,
      operation.value,
      SCENARIO_AGENT_ACTOR,
    )
    if (!result.ok) return fail(result.error)
    const change = result.data.proposedChanges.at(-1)!
    return done({
      scenario_id: result.data.id,
      status: result.data.status,
      change: {
        id: change.id,
        operation: change.operation.kind,
        summary: change.summary,
        affected_object_ids: change.affectedObjectIds,
      },
      proposed_change_count: result.data.proposedChanges.length,
      hypothetical_object_count: result.data.world.objects.length,
      current_world_object_count: useSceneStore.getState().scene.objects.length,
      current_world_unchanged: true,
    })
  },
}

const analyzeScenario: SynSpaceTool = {
  name: 'analyze_scenario',
  description:
    'Calculate deterministic world metrics and all structured constraint consequences for an isolated scenario.',
  inputSchema: {
    type: 'object',
    properties: {
      scenario_id: scenarioIdSchema,
      selected_object_ids: { type: 'array', items: { type: 'string' } },
    },
    required: ['scenario_id'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(strictRecord(input, ['scenario_id', 'selected_object_ids']))
    if (!args.ok) return args.outcome
    const id = check(requireString(args.value, 'scenario_id'))
    if (!id.ok) return id.outcome
    const selected = check(optionalIdList(args.value, 'selected_object_ids'))
    if (!selected.ok) return selected.outcome
    const result = scenarios().analyzeScenario(id.value as string, selected.value)
    return result.ok ? done(serializeAnalysis(result.data)) : fail(result.error)
  },
}

const compareScenarios: SynSpaceTool = {
  name: 'compare_scenarios',
  description:
    'Compare a scenario with the current world by default, or with another scenario. Returns metric deltas, improved/worsened constraints, and a deterministic recommendation.',
  inputSchema: {
    type: 'object',
    properties: {
      scenario_id: scenarioIdSchema,
      against_scenario_id: scenarioIdSchema,
      selected_object_ids: { type: 'array', items: { type: 'string' } },
    },
    required: ['scenario_id'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(
      strictRecord(input, ['scenario_id', 'against_scenario_id', 'selected_object_ids']),
    )
    if (!args.ok) return args.outcome
    const id = check(requireString(args.value, 'scenario_id'))
    if (!id.ok) return id.outcome
    const against = check(requireString(args.value, 'against_scenario_id', { optional: true }))
    if (!against.ok) return against.outcome
    const selected = check(optionalIdList(args.value, 'selected_object_ids'))
    if (!selected.ok) return selected.outcome
    const result = scenarios().compareScenario(
      id.value as string,
      against.value,
      selected.value,
    )
    return result.ok ? done(serializeComparison(result.data)) : fail(result.error)
  },
}

const applyScenario: SynSpaceTool = {
  name: 'apply_scenario',
  description:
    'Apply an isolated scenario to the current world as one undoable change. Requires confirm: true and rejects stale scenario bases.',
  inputSchema: {
    type: 'object',
    properties: { scenario_id: scenarioIdSchema, confirm: { type: 'boolean' } },
    required: ['scenario_id', 'confirm'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(strictRecord(input, ['scenario_id', 'confirm']))
    if (!args.ok) return args.outcome
    const id = check(requireString(args.value, 'scenario_id'))
    if (!id.ok) return id.outcome
    if (args.value.confirm !== true) {
      return fail('Applying a scenario replaces the current world layout. Call with confirm: true.')
    }
    const result = scenarios().applyScenario(id.value as string, SCENARIO_AGENT_ACTOR)
    return result.ok
      ? done({
          scenario_id: result.data.id,
          status: result.data.status,
          applied_change_count: result.data.proposedChanges.length,
          current_world_revision: useSceneStore.getState().scene.metadata.revision,
          current_world_object_count: useSceneStore.getState().scene.objects.length,
          undoable: true,
        })
      : fail(result.error)
  },
}

const discardScenario: SynSpaceTool = {
  name: 'discard_scenario',
  description: 'Reject an isolated scenario without changing the current world. Requires confirm: true.',
  inputSchema: {
    type: 'object',
    properties: { scenario_id: scenarioIdSchema, confirm: { type: 'boolean' } },
    required: ['scenario_id', 'confirm'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(strictRecord(input, ['scenario_id', 'confirm']))
    if (!args.ok) return args.outcome
    const id = check(requireString(args.value, 'scenario_id'))
    if (!id.ok) return id.outcome
    if (args.value.confirm !== true) return fail('Discard requires confirm: true.')
    const revision = useSceneStore.getState().scene.metadata.revision
    const result = scenarios().discardScenario(id.value as string, SCENARIO_AGENT_ACTOR)
    return result.ok
      ? done({
          scenario_id: result.data.id,
          status: result.data.status,
          current_world_revision: useSceneStore.getState().scene.metadata.revision,
          current_world_unchanged: useSceneStore.getState().scene.metadata.revision === revision,
        })
      : fail(result.error)
  },
}

function parseOperation(input: unknown): Validated<ScenarioOperation> {
  const base = asRecord(input)
  if (!base.ok) return { ok: false, error: '"operation" must be an object.' }
  const kind = base.value.kind
  if (typeof kind !== 'string') return { ok: false, error: 'Operation "kind" is required.' }

  switch (kind) {
    case 'add_object': {
      const args = strictRecord(base.value, [
        'kind', 'asset_type', 'count', 'zone_id', 'x', 'y', 'z', 'rotation_degrees', 'label_prefix',
      ], 'Operation')
      if (!args.ok) return args
      const type = requireAssetType(args.value, 'asset_type')
      if (!type.ok) return type
      const count = requireNumber(args.value, 'count', { min: 1, max: 50 })
      if (!count.ok) return count
      if (!Number.isInteger(count.value)) return { ok: false, error: '"count" must be an integer.' }
      const zoneId = requireString(args.value, 'zone_id', { optional: true })
      if (!zoneId.ok) return zoneId
      const position = requirePosition(args.value, { optional: true })
      if (!position.ok) return position
      const rotation = requireRotation(args.value, 'rotation_degrees', { optional: true })
      if (!rotation.ok) return rotation
      const labelPrefix = requireString(args.value, 'label_prefix', { optional: true })
      if (!labelPrefix.ok) return labelPrefix
      return {
        ok: true,
        value: {
          kind,
          assetType: type.value,
          count: count.value,
          zoneId: zoneId.value,
          position: position.value,
          rotation: rotation.value,
          labelPrefix: labelPrefix.value,
        },
      }
    }
    case 'remove_object': {
      const args = strictRecord(base.value, ['kind', 'object_id'], 'Operation')
      if (!args.ok) return args
      const id = requireString(args.value, 'object_id')
      return id.ok
        ? { ok: true, value: { kind, objectId: id.value as string } }
        : id
    }
    case 'move_object': {
      const args = strictRecord(base.value, ['kind', 'object_id', 'x', 'y', 'z'], 'Operation')
      if (!args.ok) return args
      const id = requireString(args.value, 'object_id')
      if (!id.ok) return id
      const position = requirePosition(args.value)
      return position.ok
        ? { ok: true, value: { kind, objectId: id.value as string, position: position.value as Vec3 } }
        : position
    }
    case 'change_capacity': {
      const args = strictRecord(base.value, ['kind', 'zone_id', 'capacity'], 'Operation')
      if (!args.ok) return args
      const zoneId = requireString(args.value, 'zone_id')
      if (!zoneId.ok) return zoneId
      const capacity = requireNumber(args.value, 'capacity', { min: 0, max: 1000 })
      if (!capacity.ok) return capacity
      if (!Number.isInteger(capacity.value)) return { ok: false, error: '"capacity" must be an integer.' }
      return { ok: true, value: { kind, zoneId: zoneId.value as string, capacity: capacity.value } }
    }
    case 'block_path': {
      const args = strictRecord(base.value, ['kind', 'x', 'y', 'z', 'width', 'depth', 'label'], 'Operation')
      if (!args.ok) return args
      const position = requirePosition(args.value)
      if (!position.ok) return position
      const width = requireNumber(args.value, 'width', { min: 0.01, max: 20 })
      if (!width.ok) return width
      const depth = requireNumber(args.value, 'depth', { min: 0.01, max: 20 })
      if (!depth.ok) return depth
      const label = requireString(args.value, 'label', { optional: true })
      if (!label.ok) return label
      return {
        ok: true,
        value: { kind, position: position.value as Vec3, width: width.value, depth: depth.value, label: label.value },
      }
    }
    case 'change_constraint': {
      const args = strictRecord(base.value, ['kind', 'constraint_id', 'value', 'enabled', 'severity'], 'Operation')
      if (!args.ok) return args
      const id = requireString(args.value, 'constraint_id')
      if (!id.ok) return id
      let value: number | undefined
      if (args.value.value !== undefined) {
        const result = requireNumber(args.value, 'value', { min: 0, max: 100 })
        if (!result.ok) return result
        value = result.value
      }
      const enabled = args.value.enabled
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        return { ok: false, error: '"enabled" must be a boolean.' }
      }
      const severity = args.value.severity
      if (severity !== undefined && !['error', 'warning', 'info'].includes(String(severity))) {
        return { ok: false, error: '"severity" must be error, warning, or info.' }
      }
      return {
        ok: true,
        value: {
          kind,
          constraintId: id.value as string,
          value,
          enabled: enabled as boolean | undefined,
          severity: severity as ConstraintSeverity | undefined,
        },
      }
    }
    default:
      return { ok: false, error: `Unsupported scenario operation "${kind}".` }
  }
}

function serializeMetrics(metrics: WorldMetrics) {
  return {
    object_count: metrics.objectCount,
    floor_area_sqm: metrics.floorAreaSqm,
    occupied_area_sqm: metrics.occupiedAreaSqm,
    free_area_sqm: metrics.freeAreaSqm,
    minimum_walkway_width_m: metrics.minimumWalkwayWidthM,
    blocked_path_count: metrics.blockedPathCount,
    collision_count: metrics.collisionCount,
    boundary_violation_count: metrics.boundaryViolationCount,
    entrance_clearance_violation_count: metrics.entranceClearanceViolationCount,
    emergency_exit_violation_count: metrics.emergencyExitViolationCount,
    spacing_violation_count: metrics.spacingViolationCount,
    average_selected_object_distance_m: metrics.averageSelectedObjectDistanceM,
    selected_object_ids: metrics.selectedObjectIds,
  }
}

function serializeViolation(violation: ScenarioAnalysis['violations'][number]) {
  return {
    type: violation.kind,
    severity: violation.severity,
    affected_object_ids: violation.objectIds,
    measured_value: violation.measured,
    required_value: violation.required,
    explanation: violation.message,
    constraint_id: violation.constraintId,
    at: violation.at ? { x: violation.at[0], z: violation.at[1] } : undefined,
  }
}

function serializeAnalysis(analysis: ScenarioAnalysis): Record<string, unknown> {
  return {
    scenario_id: analysis.scenarioId,
    scenario_revision: analysis.scenarioRevision,
    metrics: serializeMetrics(analysis.metrics),
    zone_capacities: analysis.metrics.zoneCapacities.map((zone) => ({
      zone_id: zone.zoneId,
      zone_name: zone.zoneName,
      object_count: zone.objectCount,
      capacity: zone.capacity,
      remaining: zone.remaining,
      over_capacity: zone.overCapacity,
    })),
    constraint_summary: analysis.constraintSummary,
    constraints_checked: analysis.constraintsChecked,
    violation_count: analysis.violations.length,
    violations: analysis.violations.map(serializeViolation),
    current_world_unchanged: true,
  }
}

function serializeComparison(comparison: ScenarioComparison): Record<string, unknown> {
  return {
    scenario_id: comparison.scenarioId,
    baseline_id: comparison.baselineId,
    baseline_revision: comparison.baselineRevision,
    scenario_revision: comparison.scenarioRevision,
    stale_base: comparison.staleBase,
    changes_made: comparison.changes.map((change) => ({
      operation: change.operation.kind,
      summary: change.summary,
      affected_object_ids: change.affectedObjectIds,
    })),
    metric_differences: comparison.metrics.map((metric) => ({
      metric: metric.key,
      label: metric.label,
      current: metric.current,
      scenario: metric.scenario,
      difference: metric.difference,
      unit: metric.unit === 'm2' ? 'm²' : metric.unit,
    })),
    zone_capacity_differences: comparison.zoneCapacities.map((zone) => ({
      zone_id: zone.zoneId,
      zone_name: zone.zoneName,
      current_count: zone.currentCount,
      scenario_count: zone.scenarioCount,
      count_difference: zone.countDifference,
      current_capacity: zone.currentCapacity,
      scenario_capacity: zone.scenarioCapacity,
      capacity_difference: zone.capacityDifference,
    })),
    constraints_improved: comparison.constraintsImproved.map(serializeViolation),
    constraints_worsened: comparison.constraintsWorsened.map(serializeViolation),
    recommendation: comparison.recommendation,
  }
}

export const SCENARIO_TOOLS: SynSpaceTool[] = [
  inspectWorld,
  querySpatialRelationships,
  createScenario,
  modifyScenario,
  analyzeScenario,
  compareScenarios,
  applyScenario,
  discardScenario,
]
