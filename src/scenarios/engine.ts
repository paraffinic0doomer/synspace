import {
  buildOccupancyGrid,
  distanceBetween,
  evaluateConstraints,
  footprintsOverlap,
  objectBounds,
  objectsInZone,
  rectContainsRect,
  widestPath,
} from '@/spatial'
import type {
  ActorRef,
  MetricDifference,
  ProposedChange,
  Scenario,
  ScenarioAnalysis,
  ScenarioComparison,
  ScenarioOperation,
  SceneObject,
  Vec3,
  World,
  WorldMetrics,
  Zone,
  ZoneCapacityDifference,
} from '@/types'
import { SYSTEM_ACTOR } from '@/types'
import { getAssetDefinition } from '@/tools/assetCatalog'
import { clampToRoom, findSpawnPosition } from '@/tools/placement'
import { createId, roundTo } from '@/utils'

export type ScenarioResult<T> = { ok: true; data: T } | { ok: false; error: string }

const ok = <T>(data: T): ScenarioResult<T> => ({ ok: true, data })
const fail = <T = never>(error: string): ScenarioResult<T> => ({ ok: false, error })

/** Plain world snapshots are intentionally independent of the live store. */
export const cloneWorld = (world: World): World => structuredClone(world)

export function createScenarioDocument(world: World, name: string): Scenario {
  const now = Date.now()
  const base = cloneWorld(world)
  return {
    id: createId('scenario'),
    name: name.trim(),
    baseWorldId: world.id,
    baseWorldRevision: world.metadata.revision,
    baseWorld: base,
    world: cloneWorld(base),
    proposedChanges: [],
    analysis: null,
    comparison: null,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  }
}

/** Applies one operation to the scenario snapshot only. */
export function applyScenarioOperation(
  scenario: Scenario,
  operation: ScenarioOperation,
  actor: ActorRef = SYSTEM_ACTOR,
): ScenarioResult<Scenario> {
  if (scenario.status === 'applied' || scenario.status === 'discarded') {
    return fail(`Scenario "${scenario.name}" is ${scenario.status} and cannot be modified.`)
  }

  const world = cloneWorld(scenario.world)
  const sequence = scenario.proposedChanges.length + 1
  const now = Date.now()
  let summary = ''
  let affectedObjectIds: string[] = []

  switch (operation.kind) {
    case 'add_object': {
      if (!Number.isInteger(operation.count) || operation.count < 1 || operation.count > 50) {
        return fail('add_object count must be an integer between 1 and 50.')
      }
      const zone = operation.zoneId
        ? world.zones.find((candidate) => candidate.id === operation.zoneId)
        : undefined
      if (operation.zoneId && !zone) return fail(`No zone with id "${operation.zoneId}".`)

      const added: SceneObject[] = []
      for (let index = 0; index < operation.count; index += 1) {
        const object = makeScenarioObject(
          operation.assetType,
          `${scenario.id}-object-${sequence}-${index + 1}`,
          operation.labelPrefix
            ? `${operation.labelPrefix} ${index + 1}`
            : `${getAssetDefinition(operation.assetType).name} (scenario ${sequence}.${index + 1})`,
          operation.rotation ?? [0, 0, 0],
          actor,
          now,
        )
        object.position = choosePosition(
          world,
          object,
          zone,
          operation.position,
          index,
        )
        world.objects.push(object)
        added.push(object)
      }
      affectedObjectIds = added.map((object) => object.id)
      summary = `Add ${operation.count} ${operation.assetType}${operation.count === 1 ? '' : 's'}${zone ? ` to ${zone.name}` : ''}`
      break
    }

    case 'remove_object': {
      const object = world.objects.find((candidate) => candidate.id === operation.objectId)
      if (!object) return fail(`No object with id "${operation.objectId}" in this scenario.`)
      if (object.locked) return fail(`"${object.label}" is locked and cannot be removed.`)
      world.objects = world.objects.filter((candidate) => candidate.id !== object.id)
      affectedObjectIds = [object.id]
      summary = `Remove ${object.label}`
      break
    }

    case 'move_object': {
      const object = world.objects.find((candidate) => candidate.id === operation.objectId)
      if (!object) return fail(`No object with id "${operation.objectId}" in this scenario.`)
      if (object.locked) return fail(`"${object.label}" is locked and cannot be moved.`)
      object.position = clampToRoom(
        operation.position,
        object.dimensions,
        object.scale,
        world.environment.room,
        object.rotation,
      )
      touchObject(object, actor, now)
      affectedObjectIds = [object.id]
      summary = `Move ${object.label} to (${object.position[0]}, ${object.position[2]}) m`
      break
    }

    case 'change_capacity': {
      if (!Number.isInteger(operation.capacity) || operation.capacity < 0 || operation.capacity > 1000) {
        return fail('Zone capacity must be an integer between 0 and 1000.')
      }
      const zone = world.zones.find((candidate) => candidate.id === operation.zoneId)
      if (!zone) return fail(`No zone with id "${operation.zoneId}".`)
      zone.capacity = operation.capacity
      summary = `Set ${zone.name} capacity to ${operation.capacity} objects`
      break
    }

    case 'block_path': {
      if (
        !Number.isFinite(operation.width) ||
        !Number.isFinite(operation.depth) ||
        operation.width <= 0 ||
        operation.depth <= 0 ||
        operation.width > 20 ||
        operation.depth > 20
      ) {
        return fail('Path block width and depth must be greater than 0 and at most 20 m.')
      }
      const definition = getAssetDefinition('partition')
      const object = makeScenarioObject(
        'partition',
        `${scenario.id}-path-block-${sequence}`,
        operation.label ?? `Scenario path block ${sequence}`,
        [0, 0, 0],
        actor,
        now,
      )
      object.scale = [
        operation.width / definition.dimensions.width,
        1,
        operation.depth / definition.dimensions.depth,
      ]
      object.position = clampToRoom(
        operation.position,
        object.dimensions,
        object.scale,
        world.environment.room,
        object.rotation,
      )
      object.metadata.tags.push('scenario-path-block')
      world.objects.push(object)
      affectedObjectIds = [object.id]
      summary = `Block path at (${object.position[0]}, ${object.position[2]}) with a ${roundTo(operation.width, 2)} x ${roundTo(operation.depth, 2)} m obstacle`
      break
    }

    case 'change_constraint': {
      const constraint = world.constraints.find(
        (candidate) => candidate.id === operation.constraintId,
      )
      if (!constraint) return fail(`No constraint with id "${operation.constraintId}".`)
      if (
        operation.value === undefined &&
        operation.enabled === undefined &&
        operation.severity === undefined
      ) {
        return fail('change_constraint requires value, enabled, or severity.')
      }
      if (
        operation.value !== undefined &&
        (!Number.isFinite(operation.value) || operation.value < 0 || operation.value > 100)
      ) {
        return fail('Constraint value must be a finite number between 0 and 100.')
      }
      if (operation.value !== undefined) constraint.value = operation.value
      if (operation.enabled !== undefined) constraint.enabled = operation.enabled
      if (operation.severity !== undefined) constraint.severity = operation.severity
      summary = `Change constraint ${constraint.label}`
      break
    }
  }

  world.metadata.updatedAt = now
  world.metadata.revision += 1
  const change: ProposedChange = {
    id: `${scenario.id}-change-${sequence}`,
    operation: structuredClone(operation),
    summary,
    affectedObjectIds,
    createdAt: now,
    actor,
  }

  return ok({
    ...scenario,
    world,
    proposedChanges: [...scenario.proposedChanges, change],
    analysis: null,
    comparison: null,
    status: 'draft',
    updatedAt: now,
  })
}

function makeScenarioObject(
  type: SceneObject['type'],
  id: string,
  label: string,
  rotation: Vec3,
  actor: ActorRef,
  now: number,
): SceneObject {
  const definition = getAssetDefinition(type)
  return {
    id,
    type,
    label,
    position: [0, 0, 0],
    rotation: [...rotation],
    scale: [1, 1, 1],
    dimensions: { ...definition.dimensions },
    color: definition.defaultColor,
    locked: false,
    visible: true,
    metadata: {
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      lastModifiedBy: actor,
      revision: 1,
      tags: ['scenario'],
      custom: {},
    },
  }
}

function touchObject(object: SceneObject, actor: ActorRef, now: number) {
  object.metadata.updatedAt = now
  object.metadata.lastModifiedBy = actor
  object.metadata.revision += 1
}

function choosePosition(
  world: World,
  object: SceneObject,
  zone: Zone | undefined,
  preferred: Vec3 | undefined,
  index: number,
): Vec3 {
  if (preferred) {
    const columns = 5
    const spacingX = object.dimensions.width + 0.4
    const spacingZ = object.dimensions.depth + 0.4
    const candidate: Vec3 = [
      preferred[0] + (index % columns) * spacingX,
      preferred[1],
      preferred[2] + Math.floor(index / columns) * spacingZ,
    ]
    return clampToRoom(
      candidate,
      object.dimensions,
      object.scale,
      world.environment.room,
      object.rotation,
    )
  }

  if (zone) {
    const step = 0.25
    for (let z = zone.bounds.minZ; z <= zone.bounds.maxZ + 1e-6; z += step) {
      for (let x = zone.bounds.minX; x <= zone.bounds.maxX + 1e-6; x += step) {
        const candidate = cloneObjectAt(object, [roundTo(x, 3), 0, roundTo(z, 3)])
        candidate.position = clampToRoom(
          candidate.position,
          candidate.dimensions,
          candidate.scale,
          world.environment.room,
          candidate.rotation,
        )
        if (!rectContainsRect(zone.bounds, objectBounds(candidate))) continue
        const collides = world.objects.some(
          (existing) => existing.visible && existing.type !== 'door' && footprintsOverlap(existing, candidate),
        )
        if (!collides) return candidate.position
      }
    }
    const centre: Vec3 = [
      (zone.bounds.minX + zone.bounds.maxX) / 2,
      0,
      (zone.bounds.minZ + zone.bounds.maxZ) / 2,
    ]
    return clampToRoom(
      centre,
      object.dimensions,
      object.scale,
      world.environment.room,
      object.rotation,
    )
  }

  const found = findSpawnPosition(world.objects, object.dimensions, world.environment.room)
  return clampToRoom(
    found,
    object.dimensions,
    object.scale,
    world.environment.room,
    object.rotation,
  )
}

const cloneObjectAt = (object: SceneObject, position: Vec3): SceneObject => ({
  ...object,
  position,
})

export function calculateWorldMetrics(
  world: World,
  selectedObjectIds: string[] = [],
): WorldMetrics {
  const visible = world.objects.filter((object) => object.visible)
  const report = evaluateConstraints(world)
  const grid = buildOccupancyGrid(visible, world.environment.room)
  const blockedCells = grid.blocked.reduce((count, blocked) => count + blocked, 0)
  const floorAreaSqm = roundTo(world.environment.room.width * world.environment.room.depth, 3)
  const occupiedAreaSqm = roundTo(
    Math.min(blockedCells * grid.cellSize * grid.cellSize, floorAreaSqm),
    3,
  )

  const centre = { x: 0, z: 0 }
  const paths = visible
    .filter((object) => object.type === 'door')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((door) => {
      const angle = door.rotation[1]
      const axis = { x: Math.sin(angle), z: Math.cos(angle) }
      const toCentre = { x: -door.position[0], z: -door.position[2] }
      const sign = axis.x * toCentre.x + axis.z * toCentre.z >= 0 ? 1 : -1
      return widestPath(
        grid,
        {
          x: door.position[0] + axis.x * 0.9 * sign,
          z: door.position[2] + axis.z * 0.9 * sign,
        },
        centre,
      )
    })

  const validSelectedIds = [...new Set(selectedObjectIds)]
    .filter((id) => world.objects.some((object) => object.id === id))
    .sort()
  const pairDistances: number[] = []
  for (let i = 0; i < validSelectedIds.length; i += 1) {
    for (let j = i + 1; j < validSelectedIds.length; j += 1) {
      const distance = distanceBetween(world, validSelectedIds[i], validSelectedIds[j])
      if (distance !== null) pairDistances.push(distance)
    }
  }

  const violationsOf = (kind: ConstraintViolationKind) =>
    report.violations.filter((violation) => violation.kind === kind).length

  return {
    objectCount: world.objects.length,
    floorAreaSqm,
    occupiedAreaSqm,
    freeAreaSqm: roundTo(Math.max(floorAreaSqm - occupiedAreaSqm, 0), 3),
    minimumWalkwayWidthM:
      paths.length === 0 ? null : roundTo(Math.min(...paths.map((path) => path.width)), 3),
    blockedPathCount: paths.filter((path) => !path.reachable || path.width <= 0).length,
    collisionCount: violationsOf('collision'),
    boundaryViolationCount: violationsOf('boundary'),
    entranceClearanceViolationCount: violationsOf('entrance-clearance'),
    emergencyExitViolationCount: violationsOf('exit-clearance'),
    spacingViolationCount: violationsOf('object-spacing'),
    averageSelectedObjectDistanceM:
      pairDistances.length === 0
        ? null
        : roundTo(pairDistances.reduce((sum, value) => sum + value, 0) / pairDistances.length, 3),
    selectedObjectIds: validSelectedIds,
    zoneCapacities: world.zones.map((zone) => {
      const objectCount = objectsInZone(world, zone.id).length
      const capacity = zone.capacity ?? null
      return {
        zoneId: zone.id,
        zoneName: zone.name,
        objectCount,
        capacity,
        remaining: capacity === null ? null : capacity - objectCount,
        overCapacity: capacity === null ? 0 : Math.max(objectCount - capacity, 0),
      }
    }),
  }
}

type ConstraintViolationKind =
  | 'collision'
  | 'boundary'
  | 'entrance-clearance'
  | 'exit-clearance'
  | 'object-spacing'

export function analyzeScenarioWorld(
  scenario: Scenario,
  selectedObjectIds: string[] = [],
): ScenarioAnalysis {
  const report = evaluateConstraints(scenario.world)
  return {
    scenarioId: scenario.id,
    scenarioRevision: scenario.world.metadata.revision,
    analyzedAt: Date.now(),
    metrics: calculateWorldMetrics(scenario.world, selectedObjectIds),
    constraintSummary: report.summary,
    constraintsChecked: report.checked,
    violations: report.violations,
  }
}

export function compareScenarioWorld(
  scenario: Scenario,
  baseline: World,
  baselineId = baseline.id,
  selectedObjectIds: string[] = [],
): ScenarioComparison {
  const currentReport = evaluateConstraints(baseline)
  const scenarioReport = evaluateConstraints(scenario.world)
  const currentMetrics = calculateWorldMetrics(baseline, selectedObjectIds)
  const scenarioMetrics = calculateWorldMetrics(scenario.world, selectedObjectIds)

  const currentViolations = new Map(
    currentReport.violations.map((violation) => [violationKey(violation), violation]),
  )
  const scenarioViolations = new Map(
    scenarioReport.violations.map((violation) => [violationKey(violation), violation]),
  )
  const constraintsImproved = [...currentViolations]
    .filter(([key]) => !scenarioViolations.has(key))
    .map(([, violation]) => violation)
  const constraintsWorsened = [...scenarioViolations]
    .filter(([key]) => !currentViolations.has(key))
    .map(([, violation]) => violation)

  const metrics = metricDifferences(currentMetrics, scenarioMetrics)
  const zoneCapacities = zoneCapacityDifferences(currentMetrics, scenarioMetrics)
  const recommendation = recommend(
    currentMetrics,
    scenarioMetrics,
    constraintsImproved,
    constraintsWorsened,
  )

  return {
    scenarioId: scenario.id,
    baselineId,
    baselineRevision: baseline.metadata.revision,
    scenarioRevision: scenario.world.metadata.revision,
    staleBase:
      baseline.id === scenario.baseWorldId &&
      baseline.metadata.revision !== scenario.baseWorldRevision,
    comparedAt: Date.now(),
    changes: structuredClone(scenario.proposedChanges),
    metrics,
    zoneCapacities,
    constraintsImproved,
    constraintsWorsened,
    recommendation,
  }
}

function violationKey(violation: ReturnType<typeof evaluateConstraints>['violations'][number]) {
  return `${violation.constraintId}:${violation.kind}:${[...violation.objectIds].sort().join('+')}`
}

const METRIC_FIELDS: {
  key: MetricDifference['key']
  label: string
  unit: MetricDifference['unit']
}[] = [
  { key: 'objectCount', label: 'Objects', unit: 'count' },
  { key: 'floorAreaSqm', label: 'Floor area', unit: 'm2' },
  { key: 'occupiedAreaSqm', label: 'Occupied area', unit: 'm2' },
  { key: 'freeAreaSqm', label: 'Free area', unit: 'm2' },
  { key: 'minimumWalkwayWidthM', label: 'Minimum walkway', unit: 'm' },
  { key: 'blockedPathCount', label: 'Blocked paths', unit: 'count' },
  { key: 'collisionCount', label: 'Collisions', unit: 'count' },
  { key: 'boundaryViolationCount', label: 'Boundary violations', unit: 'count' },
  {
    key: 'entranceClearanceViolationCount',
    label: 'Entrance clearance violations',
    unit: 'count',
  },
  {
    key: 'emergencyExitViolationCount',
    label: 'Emergency exit violations',
    unit: 'count',
  },
  { key: 'spacingViolationCount', label: 'Spacing violations', unit: 'count' },
  {
    key: 'averageSelectedObjectDistanceM',
    label: 'Average selected-object distance',
    unit: 'm',
  },
]

function metricDifferences(current: WorldMetrics, scenario: WorldMetrics): MetricDifference[] {
  return METRIC_FIELDS.map(({ key, label, unit }) => {
    const currentValue = current[key] as number | null
    const scenarioValue = scenario[key] as number | null
    return {
      key,
      label,
      current: currentValue,
      scenario: scenarioValue,
      difference:
        currentValue === null || scenarioValue === null
          ? null
          : roundTo(scenarioValue - currentValue, 3),
      unit,
    }
  })
}

function zoneCapacityDifferences(
  current: WorldMetrics,
  scenario: WorldMetrics,
): ZoneCapacityDifference[] {
  const currentById = new Map(current.zoneCapacities.map((zone) => [zone.zoneId, zone]))
  return scenario.zoneCapacities.map((zone) => {
    const before = currentById.get(zone.zoneId)
    const currentCapacity = before?.capacity ?? null
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      currentCount: before?.objectCount ?? 0,
      scenarioCount: zone.objectCount,
      countDifference: zone.objectCount - (before?.objectCount ?? 0),
      currentCapacity,
      scenarioCapacity: zone.capacity,
      capacityDifference:
        currentCapacity === null || zone.capacity === null
          ? null
          : zone.capacity - currentCapacity,
    }
  })
}

function recommend(
  current: WorldMetrics,
  scenario: WorldMetrics,
  improved: ScenarioComparison['constraintsImproved'],
  worsened: ScenarioComparison['constraintsWorsened'],
): ScenarioComparison['recommendation'] {
  const hardRegression =
    scenario.collisionCount > current.collisionCount ||
    scenario.boundaryViolationCount > current.boundaryViolationCount ||
    scenario.blockedPathCount > current.blockedPathCount ||
    worsened.some((violation) => violation.severity === 'error')
  if (hardRegression) {
    return {
      decision: 'reject',
      explanation:
        'Do not apply yet: the scenario introduces a collision, boundary, blocked-path, or error-level constraint regression.',
    }
  }
  if (worsened.length === 0 && improved.length > 0) {
    return {
      decision: 'apply',
      explanation: `The scenario resolves ${improved.length} constraint finding${improved.length === 1 ? '' : 's'} without introducing another one.`,
    }
  }
  return {
    decision: 'review',
    explanation:
      worsened.length > 0
        ? `Review the trade-off: ${improved.length} findings improve and ${worsened.length} worsen.`
        : 'No decisive constraint improvement or hard regression was detected; review the metric changes.',
  }
}
