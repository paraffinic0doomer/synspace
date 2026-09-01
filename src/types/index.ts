export type { ActorKind, ActorRef } from './actor'
export { HUMAN_ACTOR, SYSTEM_ACTOR, agentActor } from './actor'

export type {
  Vec3,
  Transform,
  TransformPatch,
  AssetType,
  Dimensions,
  ObjectMetadata,
  ObjectStatus,
  SceneObject,
  RoomConfig,
  EnvironmentSettings,
  ConstraintKind,
  ConstraintSeverity,
  ConstraintViolation,
  SpatialConstraint,
  EnvironmentPreset,
  World,
  Scene,
  TransformMode,
  AssetDefinition,
  AssetCategory,
  AssetPart,
  BuiltinAssetType,
  CustomAssetDefinition,
  PartFinish,
  PartShape,
} from './scene'

export type {
  Rect2,
  WorldBounds,
  BoundaryStatus,
  BoundaryCheck,
  ZoneKind,
  Zone,
  RelationKind,
  SpatialRelationship,
  SpatialObjectView,
  SpatialObject,
  WorldMetadata,
} from './world'
export { COORDINATE_SYSTEM } from './world'

export type { ChangeKind, HistoryEntry, SceneHistory } from './history'

export type {
  ActivityLevel,
  ActivityEntry,
  ToolInvocationRecord,
  AgentStatus,
  AgentDescriptor,
  McpStatus,
  McpState,
} from './agent'

export type {
  ScenarioStatus,
  AddObjectOperation,
  RemoveObjectOperation,
  MoveObjectOperation,
  ChangeCapacityOperation,
  BlockPathOperation,
  ChangeConstraintOperation,
  ScenarioOperation,
  ProposedChange,
  ZoneCapacityMetric,
  WorldMetrics,
  ScenarioAnalysis,
  MetricDifference,
  ZoneCapacityDifference,
  ScenarioRecommendation,
  ScenarioComparison,
  Scenario,
  ScenarioConstraintPatch,
} from './scenario'

export type {
  ProposalStatus,
  ProposalBenefit,
  ProposalConstraintChange,
  Proposal,
  ProposalView,
} from './proposal'
