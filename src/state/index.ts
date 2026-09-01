export { useSceneStore } from './sceneStore'
export type { SceneState, ObjectPatch } from './sceneStore'

export {
  useScene,
  useWorld,
  useZones,
  useWorldMetadata,
  useConstraintViolations,
  useViolationsFor,
  useZoneSummaries,
  useEgressRoutes,
  useSceneObjects,
  useSceneName,
  useEnvironment,
  useConstraints,
  useSelectedObject,
  useObject,
  useObjectIds,
  useCanUndo,
  useCanRedo,
  useHistoryEntries,
  useNextUndoLabel,
  useNextRedoLabel,
  getObjectStatus,
  useSceneStats,
} from './selectors'
export type { SceneStats } from './selectors'

export { sceneApi } from './sceneApi'
export type { SceneApi, ApiResult } from './sceneApi'

export {
  worldApi,
  getWorld,
  getWorldSnapshot,
  getWorldBounds,
  listObjectViews,
  getObjectView,
  listZoneSummaries,
  summariseZone,
  getRelationships,
  getNeighbours,
  getConstraintReport,
  getViolationsFor,
  getBoundaryViolations,
  getEgressRoutes,
  toSpatialObjectView,
} from './worldApi'
export type { WorldApi, ZoneSummary, RouteSummary, WorldSnapshot } from './worldApi'

export { useScenarioStore } from './scenarioStore'
export type { ScenarioState } from './scenarioStore'

export {
  useProposalStore,
  useProposalViews,
  useProposalView,
  usePreviewProposal,
  usePreviewWorld,
  useDisplayedObjects,
} from './proposalStore'
export type { ProposalState, WorldView } from './proposalStore'
