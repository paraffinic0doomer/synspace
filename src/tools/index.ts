export {
  ASSET_DEFINITIONS,
  ASSET_TYPES,
  ASSET_CATEGORY_ORDER,
  getAssetDefinition,
  groupedAssets,
  createSceneObject,
  createMetadata,
  touchMetadata,
} from './assetCatalog'
export type { CreateObjectOptions } from './assetCatalog'

export {
  DEFAULT_ROOM,
  DEFAULT_ENVIRONMENT,
  ENVIRONMENT_LIMITS,
  ENVIRONMENT_PRESETS,
  ENVIRONMENT_PRESET_NAMES,
  isEnvironmentPreset,
  TRANSLATE_SNAP,
  ROTATE_SNAP,
  SCALE_SNAP,
  sanitizeEnvironmentPatch,
  mergeEnvironment,
} from './environment'
export type { EnvironmentMood } from './environment'

export { DEFAULT_CONSTRAINTS, getConstraint } from './constraints'

export { clampToRoom, findSpawnPosition, footprintRadius } from './placement'

export { createStarterObjects, createStarterScene, createEmptyScene } from './sceneTemplates'

export { requestFocus, requestResetView, onFocusRequest, onResetViewRequest } from './viewportEvents'

export { useKeyboardShortcuts, SHORTCUTS } from './useKeyboardShortcuts'
export type { Shortcut } from './useKeyboardShortcuts'

export {
  WORLD_PRESETS,
  DEFAULT_PRESET_ID,
  getWorldPreset,
  buildPresetWorld,
} from './worldPresets'
export type { WorldPreset } from './worldPresets'
