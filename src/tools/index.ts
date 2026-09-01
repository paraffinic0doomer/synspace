export {
  ASSET_DEFINITIONS,
  ASSET_TYPES,
  BUILTIN_ASSET_TYPES,
  allAssetTypes,
  allAssetDefinitions,
  isCustomAssetType,
  ASSET_CATEGORY_ORDER,
  getAssetDefinition,
  groupedAssets,
  createSceneObject,
  createMetadata,
  touchMetadata,
  scaleForSize,
  sizeOf,
} from './assetCatalog'
export type { CreateObjectOptions } from './assetCatalog'

export {
  PART_SHAPES,
  PART_FINISHES,
  MAX_PARTS,
  buildCustomAsset,
  customAssetDefinitions,
  customAssetTypes,
  getCustomAsset,
  partsBounds,
  syncCustomAssets,
} from './customAssets'
export type { DefineAssetInput } from './customAssets'

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

export {
  createStarterObjects,
  createStarterScene,
  createEmptyScene,
  createEmptyWorld,
} from './sceneTemplates'

export { LAYOUTS, LAYOUT_IDS, getLayout, buildLayout } from './layouts'
export type { LayoutDefinition, LayoutResult, LayoutPlacement } from './layouts'

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
