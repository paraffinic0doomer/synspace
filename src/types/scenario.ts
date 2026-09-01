import type { ActorRef } from './actor'
import type {
  AssetType,
  ConstraintSeverity,
  ConstraintViolation,
  SpatialConstraint,
  Vec3,
  World,
} from './scene'

export type ScenarioStatus = 'draft' | 'analyzed' | 'applied' | 'discarded'

export interface AddObjectOperation {
  kind: 'add_object'
  assetType: AssetType
  count: number
  zoneId?: string
  position?: Vec3
  rotation?: Vec3
  labelPrefix?: string
}

export interface RemoveObjectOperation {
  kind: 'remove_object'
  objectId: string
}

export interface MoveObjectOperation {
  kind: 'move_object'
  objectId: string
  position: Vec3
}

export interface ChangeCapacityOperation {
  kind: 'change_capacity'
  zoneId: string
  capacity: number
}

/** Places a physical partition footprint at a route location. */
export interface BlockPathOperation {
  kind: 'block_path'
  position: Vec3
  width: number
  depth: number
  label?: string
}

export interface ChangeConstraintOperation {
  kind: 'change_constraint'
  constraintId: string
  value?: number
  enabled?: boolean
  severity?: ConstraintSeverity
}

export type ScenarioOperation =
  | AddObjectOperation
  | RemoveObjectOperation
  | MoveObjectOperation
  | ChangeCapacityOperation
  | BlockPathOperation
  | ChangeConstraintOperation

export interface ProposedChange {
  id: string
  operation: ScenarioOperation
  summary: string
  affectedObjectIds: string[]
  createdAt: number
  actor: ActorRef
}

export interface ZoneCapacityMetric {
  zoneId: string
  zoneName: string
  objectCount: number
  capacity: number | null
  remaining: number | null
  overCapacity: number
}

export interface WorldMetrics {
  objectCount: number
  floorAreaSqm: number
  /** Occupied floor cells on the deterministic 0.25 m occupancy grid. */
  occupiedAreaSqm: number
  freeAreaSqm: number
  minimumWalkwayWidthM: number | null
  blockedPathCount: number
  collisionCount: number
  boundaryViolationCount: number
  entranceClearanceViolationCount: number
  emergencyExitViolationCount: number
  spacingViolationCount: number
  averageSelectedObjectDistanceM: number | null
  selectedObjectIds: string[]
  zoneCapacities: ZoneCapacityMetric[]
}

export interface ScenarioAnalysis {
  scenarioId: string
  scenarioRevision: number
  analyzedAt: number
  metrics: WorldMetrics
  constraintSummary: { errors: number; warnings: number; info: number }
  constraintsChecked: string[]
  violations: ConstraintViolation[]
}

export interface MetricDifference {
  key: keyof Omit<WorldMetrics, 'selectedObjectIds' | 'zoneCapacities'>
  label: string
  current: number | null
  scenario: number | null
  difference: number | null
  unit: 'count' | 'm' | 'm2'
}

export interface ZoneCapacityDifference {
  zoneId: string
  zoneName: string
  currentCount: number
  scenarioCount: number
  countDifference: number
  currentCapacity: number | null
  scenarioCapacity: number | null
  capacityDifference: number | null
}

export interface ScenarioRecommendation {
  decision: 'apply' | 'reject' | 'review'
  explanation: string
}

export interface ScenarioComparison {
  scenarioId: string
  baselineId: string
  baselineRevision: number
  scenarioRevision: number
  staleBase: boolean
  comparedAt: number
  changes: ProposedChange[]
  metrics: MetricDifference[]
  zoneCapacities: ZoneCapacityDifference[]
  constraintsImproved: ConstraintViolation[]
  constraintsWorsened: ConstraintViolation[]
  recommendation: ScenarioRecommendation
}

export interface Scenario {
  id: string
  name: string
  baseWorldId: string
  baseWorldRevision: number
  baseWorld: World
  world: World
  proposedChanges: ProposedChange[]
  analysis: ScenarioAnalysis | null
  comparison: ScenarioComparison | null
  status: ScenarioStatus
  createdAt: number
  updatedAt: number
}

/** Fields a scenario constraint operation is allowed to change. */
export type ScenarioConstraintPatch = Pick<
  SpatialConstraint,
  'value' | 'enabled' | 'severity'
>
