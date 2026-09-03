import { describe, expect, it } from 'vitest'
import { ambientFor, backgroundFor, sceneSurfaces } from '@/scene/sceneTheme'
import { resolveTheme } from '@/state/themeStore'
import { DEFAULT_ENVIRONMENT, ENVIRONMENT_PRESETS } from '@/tools'
import type { EnvironmentSettings } from '@/types'

/**
 * Theme is a viewer preference, and the world is a shared artefact.
 *
 * The rule these protect: the theme supplies the neutral default, but a mood
 * the world explicitly records always wins. Getting that backwards would mean
 * switching to light chrome silently repaints a sunset an agent was asked to
 * set up — a viewer preference quietly overwriting world data.
 */

const withPreset = (preset: EnvironmentSettings['preset']): EnvironmentSettings => ({
  ...DEFAULT_ENVIRONMENT,
  ...ENVIRONMENT_PRESETS[preset],
})

describe('resolving a preference', () => {
  it('takes an explicit choice at face value', () => {
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
  })

  it('resolves "system" to a concrete theme, never leaves it unresolved', () => {
    expect(['light', 'dark']).toContain(resolveTheme('system'))
  })
})

describe('the two surface palettes', () => {
  it('are genuinely different, not one palette reused', () => {
    const light = sceneSurfaces('light')
    const dark = sceneSurfaces('dark')
    expect(light.background).not.toBe(dark.background)
    expect(light.floor).not.toBe(dark.floor)
    expect(light.gridCell).not.toBe(dark.gridCell)
  })

  it('lights a pale room more flatly than a dark one', () => {
    // A dark room is lit theatrically; a light one goes muddy without fill.
    expect(sceneSurfaces('light').ambientScale).toBeGreaterThan(
      sceneSurfaces('dark').ambientScale,
    )
  })
})

describe('the theme defers to a mood the world chose', () => {
  const studio = withPreset('studio')
  const sunset = withPreset('sunset')

  it('paints the theme background for the default studio mood', () => {
    const light = sceneSurfaces('light')
    expect(backgroundFor(studio, light)).toBe(light.background)
    const dark = sceneSurfaces('dark')
    expect(backgroundFor(studio, dark)).toBe(dark.background)
  })

  it('leaves an explicitly chosen mood alone in either theme', () => {
    expect(backgroundFor(sunset, sceneSurfaces('light'))).toBe(sunset.backgroundColor)
    expect(backgroundFor(sunset, sceneSurfaces('dark'))).toBe(sunset.backgroundColor)
  })

  it('applies the fill boost only to the default mood', () => {
    const light = sceneSurfaces('light')
    expect(ambientFor(studio, light)).toBeCloseTo(studio.ambientIntensity * light.ambientScale, 5)
    expect(ambientFor(sunset, light)).toBe(sunset.ambientIntensity)
  })

  it('changes nothing at all in dark mode, which is the baseline', () => {
    const dark = sceneSurfaces('dark')
    expect(ambientFor(studio, dark)).toBe(studio.ambientIntensity)
  })
})

describe('theme is not world data', () => {
  it('is absent from the environment settings the world carries', () => {
    // If a theme field ever appears here, switching it would dirty the world,
    // bump its revision and land in the undo stack.
    expect(Object.keys(DEFAULT_ENVIRONMENT)).not.toContain('theme')
    expect(Object.keys(DEFAULT_ENVIRONMENT)).not.toContain('colorScheme')
  })
})
