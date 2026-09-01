/**
 * Shared low-poly material palette.
 *
 * Assets take a single accent `color` from the scene model and pull every
 * supporting tone from here, so the whole room reads as one coherent kit.
 */
export const PALETTE = {
  metal: '#8f96a6',
  darkMetal: '#3a4152',
  plastic: '#2a2f3d',
  fabric: '#5c6780',
  woodDark: '#7a5836',
  glass: '#9fd4e8',
  soil: '#3a2c22',
  foliage: '#4a9c62',
  foliageDeep: '#357a4b',
  screen: '#111827',
  led: '#22d3a7',
  ledWarn: '#f0b429',
  trim: '#c9cfdb',
} as const

/** Roughness/metalness presets so surfaces respond consistently to lighting. */
export const SURFACE = {
  matte: { roughness: 0.85, metalness: 0.02 },
  soft: { roughness: 0.95, metalness: 0 },
  satin: { roughness: 0.45, metalness: 0.15 },
  metallic: { roughness: 0.35, metalness: 0.75 },
} as const
