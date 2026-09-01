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
  'storage-unit': 'M7 4h18v25H7zM7 11h18M7 18h18M7 25h18M10 7h5M17 14h5M10 21h5',
  whiteboard: 'M4 5h24v14H4zM8 19v8M24 19v8M6 27h6M20 27h6M9 23h14',
  'cafe-table': 'M6 13h20M16 13v13M10 29h12M11 26h10M9 10h3M20 10h3',
  counter: 'M4 12h24v4H4zM6 16v13h20V16M6 24h20M22 8h4v4h-4z',
  'wall-segment': 'M4 6h24v20H4zM4 26h24v3H4zM4 13h24M4 20h24M12 6v20M20 6v20',
  barrier: 'M3 12h26M3 19h26M8 8v16M24 8v16M5 24h6M21 24h6M12 12l3 7M18 12l3 7',
  building: 'M8 5h16v24H8zM11 9h3v3h-3zM18 9h3v3h-3zM11 15h3v3h-3zM18 15h3v3h-3zM14 23h4v6h-4zM6 5h20',
  hospital: 'M6 8h20v21H6zM6 5h20M16 11v7M12.5 14.5h7M9 21h3v3H9zM20 21h3v3h-3zM14 25h4v4h-4z',
  road: 'M9 3l-4 26M23 3l4 26M16 5v3M16 12v3M16 19v3M16 26v3',
  vehicle: 'M5 19h22v6H5zM7 19l3-7h12l3 7M11 25v2M21 25v2M9 22h.01M23 22h.01M12 12v7M20 12v7',
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
