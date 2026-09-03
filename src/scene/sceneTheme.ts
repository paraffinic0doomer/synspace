import { useThemeStore, type ResolvedTheme } from '@/state'
import type { EnvironmentSettings } from '@/types'

/**
 * Neutral surfaces for the 3D viewport.
 *
 * The room shell, floor and grid are chrome that happens to be drawn in 3D —
 * they describe the *stage*, not the world standing on it — so they follow the
 * viewer's theme. A light interface wrapped around a near-black viewport reads
 * as a bug rather than a design.
 *
 * Object colours are untouched: those live on the objects, are set by people
 * and agents, and are world data.
 */

export interface SceneSurfaces {
  background: string
  floor: string
  apron: string
  gridCell: string
  gridSection: string
  wall: string
  wallBase: string
  labelInk: string
  /** Multiplies the mood's ambient light. A light stage needs less contrast. */
  ambientScale: number
}

const DARK: SceneSurfaces = {
  background: '#0d1017',
  floor: '#20242f',
  apron: '#12151d',
  gridCell: '#39445c',
  gridSection: '#4f8cff',
  wall: '#2c3242',
  wallBase: '#3d4560',
  labelInk: '#e6ecf7',
  ambientScale: 1,
}

const LIGHT: SceneSurfaces = {
  background: '#e8ecf3',
  floor: '#d5dbe6',
  apron: '#c8cfdc',
  // A grid that glows against near-black turns into a dense blue mesh on a pale
  // floor — worst in small rooms, where the cells are half a metre apart. The
  // light theme keeps it as a faint guide rather than a graphic element.
  gridCell: '#c4cddb',
  gridSection: '#9fb0c9',
  // Walls are lighter than the floor so the room still reads as enclosed
  // without the shadowed-box look that a dark shell gives on a pale ground.
  wall: '#dfe4ed',
  wallBase: '#c6cede',
  labelInk: '#101724',
  // A dark room is lit theatrically; a light one needs flat, even fill or the
  // pale surfaces turn muddy in the corners.
  ambientScale: 1.9,
}

export const sceneSurfaces = (theme: ResolvedTheme): SceneSurfaces =>
  theme === 'light' ? LIGHT : DARK

/**
 * Whether the world has asked for a particular look.
 *
 * `studio` is the default nobody chose. The other moods are deliberate — an
 * agent may have been asked for a sunset, and quietly repainting that because
 * the viewer likes light chrome would discard a decision the world records.
 */
const isDefaultMood = (environment: EnvironmentSettings) => environment.preset === 'studio'

export function useSceneSurfaces(): SceneSurfaces {
  return sceneSurfaces(useThemeStore((state) => state.resolved))
}

/**
 * The background and fog colour to actually paint.
 *
 * The theme supplies the neutral default; an explicit mood always wins.
 */
export function backgroundFor(
  environment: EnvironmentSettings,
  surfaces: SceneSurfaces,
): string {
  return isDefaultMood(environment) ? surfaces.background : environment.backgroundColor
}

/** Ambient intensity after the theme's fill adjustment, mood permitting. */
export function ambientFor(
  environment: EnvironmentSettings,
  surfaces: SceneSurfaces,
): number {
  return isDefaultMood(environment)
    ? environment.ambientIntensity * surfaces.ambientScale
    : environment.ambientIntensity
}
