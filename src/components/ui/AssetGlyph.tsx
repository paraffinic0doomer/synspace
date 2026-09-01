import type { SVGProps } from 'react'
import type { AssetType } from '@/types'

/**
 * Elevation glyphs for the asset library. Deliberately schematic — they read
 * as a furniture spec sheet rather than as icons.
 */
const GLYPHS: Record<AssetType, string> = {
  desk: 'M4 13h24M6 13v11M26 13v11M9 20h14M9 13V9h8v4M13 9V6',
  chair: 'M9 18h14M9 18v-2h14v2M11 18v6M21 18v6M11 16V7h10v9M16 24v3M11 27h10',
  'meeting-table': 'M3 14h26M6 14v9M26 14v9M16 14v9M8 11h4M14 11h4M20 11h4M8 26h4M14 26h4M20 26h4',
  sofa: 'M5 14v10h22V14M5 18h22M8 14V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5M5 14a2 2 0 0 1 4 0M23 14a2 2 0 0 1 4 0M9 24v3M23 24v3',
  plant: 'M12 20h8l-1 8h-6zM16 20v-7M16 13c0-3 3-5 6-5 0 3-2 5-6 5zM16 15c0-3-3-5-6-5 0 3 2 5 6 5M11 24h10',
  partition: 'M6 5h20v20H6zM6 15h20M16 5v20M4 25h5M23 25h5M6 25v3M26 25v3',
  'server-rack': 'M8 3h16v26H8zM11 8h10M11 12h10M11 16h10M11 20h10M22 8h.01M22 12h.01M22 16h.01M22 20h.01M10 29v2M22 29v2',
  door: 'M7 3h18v26H7zM11 3v26M11 29a10 10 0 0 0 10-10M13 16h1.5',
}

interface AssetGlyphProps extends SVGProps<SVGSVGElement> {
  type: AssetType
  size?: number
}

export function AssetGlyph({ type, size = 30, ...props }: AssetGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={GLYPHS[type]} />
    </svg>
  )
}
