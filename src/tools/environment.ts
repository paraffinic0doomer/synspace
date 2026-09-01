import type { EnvironmentPreset, EnvironmentSettings, RoomConfig } from '@/types'
import { clamp, roundTo } from '@/utils'

/** Default room shell. Objects are kept inside these bounds when placed. */
export const DEFAULT_ROOM: RoomConfig = {
  width: 18,
  depth: 14,
  wallHeight: 3,
}

/** Translate snap increment, metres. */
export const TRANSLATE_SNAP = 0.25
/** Rotate snap increment, radians (15°). */
export const ROTATE_SNAP = Math.PI / 12
/** Scale snap increment. */
export const SCALE_SNAP = 0.1

/**
 * Lighting moods exposed to agents through `change_environment_variables`.
 * Only the visual fields differ; room and editor settings are untouched.
 */
export type EnvironmentMood = Pick<
  EnvironmentSettings,
  'preset' | 'backgroundColor' | 'ambientIntensity' | 'ambientColor' | 'keyLightIntensity' | 'keyLightColor'
>

export const ENVIRONMENT_PRESETS: Record<EnvironmentPreset, EnvironmentMood> = {
  studio: {
    preset: 'studio',
    backgroundColor: '#0d1017',
    ambientIntensity: 0.55,
    ambientColor: '#cfe0ff',
    keyLightIntensity: 1.6,
    keyLightColor: '#ffffff',
  },
  daytime: {
    preset: 'daytime',
    backgroundColor: '#1b2740',
    ambientIntensity: 0.85,
    ambientColor: '#dbe9ff',
    keyLightIntensity: 2.3,
    keyLightColor: '#fff4e0',
  },
  sunset: {
    preset: 'sunset',
    backgroundColor: '#2b1720',
    ambientIntensity: 0.45,
    ambientColor: '#ffc39a',
    keyLightIntensity: 1.8,
    keyLightColor: '#ff9350',
  },
  cyberpunk: {
    preset: 'cyberpunk',
    backgroundColor: '#07050f',
    ambientIntensity: 0.32,
    ambientColor: '#ff3d9a',
    keyLightIntensity: 1.15,
    keyLightColor: '#7b5cff',
  },
}

export const ENVIRONMENT_PRESET_NAMES = Object.keys(ENVIRONMENT_PRESETS) as EnvironmentPreset[]

export const isEnvironmentPreset = (value: unknown): value is EnvironmentPreset =>
  typeof value === 'string' && value in ENVIRONMENT_PRESETS

export const DEFAULT_ENVIRONMENT: EnvironmentSettings = {
  room: { ...DEFAULT_ROOM },
  ...ENVIRONMENT_PRESETS.studio,
  showGrid: true,
  showRoom: true,
  showLabels: false,
  showZones: false,
  showBoundary: false,
  showWarnings: true,
  showPaths: false,
  shadowsEnabled: true,
  snapEnabled: true,
  translateSnap: TRANSLATE_SNAP,
  rotateSnap: ROTATE_SNAP,
  scaleSnap: SCALE_SNAP,
}

/** Accepted ranges, enforced on every environment write. */
export const ENVIRONMENT_LIMITS = {
  // Wide enough for a city district; a classroom and a city are not the same
  // size, and the room has to be able to become either.
  roomWidth: [4, 240] as const,
  roomDepth: [4, 240] as const,
  wallHeight: [2, 40] as const,
  translateSnap: [0, 5] as const,
  rotateSnap: [0, Math.PI / 2] as const,
  scaleSnap: [0, 1] as const,
  ambientIntensity: [0, 3] as const,
  keyLightIntensity: [0, 6] as const,
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/**
 * Coerces an environment patch into a safe, in-range partial.
 *
 * Human toggles can't produce bad values, but the WebMCP
 * `change_environment_variables` tool will hand this arbitrary model output —
 * so validation lives with the data, not in the UI.
 */
export function sanitizeEnvironmentPatch(
  patch: Partial<EnvironmentSettings>,
): Partial<EnvironmentSettings> {
  const result: Partial<EnvironmentSettings> = {}
  const L = ENVIRONMENT_LIMITS

  const num = (value: unknown, [min, max]: readonly [number, number]) =>
    typeof value === 'number' && Number.isFinite(value)
      ? roundTo(clamp(value, min, max), 4)
      : undefined
  const bool = (value: unknown) => (typeof value === 'boolean' ? value : undefined)

  if (patch.room) {
    const width = num(patch.room.width, L.roomWidth)
    const depth = num(patch.room.depth, L.roomDepth)
    const wallHeight = num(patch.room.wallHeight, L.wallHeight)
    if (width !== undefined || depth !== undefined || wallHeight !== undefined) {
      result.room = {
        width: width ?? DEFAULT_ROOM.width,
        depth: depth ?? DEFAULT_ROOM.depth,
        wallHeight: wallHeight ?? DEFAULT_ROOM.wallHeight,
      }
    }
  }

  if (isEnvironmentPreset(patch.preset)) {
    // A preset is a bundle: apply it wholesale, then let explicit fields in the
    // same patch override individual values.
    Object.assign(result, ENVIRONMENT_PRESETS[patch.preset])
  }

  const flags = [
    'showGrid',
    'showRoom',
    'showLabels',
    'showZones',
    'showBoundary',
    'showWarnings',
    'showPaths',
    'shadowsEnabled',
    'snapEnabled',
  ] as const
  for (const key of flags) {
    const value = bool(patch[key])
    if (value !== undefined) result[key] = value
  }

  const numbers = [
    ['translateSnap', L.translateSnap],
    ['rotateSnap', L.rotateSnap],
    ['scaleSnap', L.scaleSnap],
    ['ambientIntensity', L.ambientIntensity],
    ['keyLightIntensity', L.keyLightIntensity],
  ] as const
  for (const [key, range] of numbers) {
    const value = num(patch[key], range)
    if (value !== undefined) result[key] = value
  }

  const colors = ['backgroundColor', 'keyLightColor', 'ambientColor'] as const
  for (const key of colors) {
    const value = patch[key]
    if (typeof value === 'string' && HEX_COLOR.test(value)) result[key] = value
  }

  return result
}

/** Merges a room patch, preserving fields the patch omits. */
export function mergeEnvironment(
  current: EnvironmentSettings,
  patch: Partial<EnvironmentSettings>,
): EnvironmentSettings {
  return {
    ...current,
    ...patch,
    room: patch.room ? { ...current.room, ...patch.room } : current.room,
  }
}
