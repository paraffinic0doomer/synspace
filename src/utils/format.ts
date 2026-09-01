import { toDegrees, roundTo } from './math'

/** `1.6 m` */
export const formatMeters = (value: number, decimals = 2): string =>
  `${roundTo(value, decimals).toFixed(decimals)} m`

/** `90°` from radians. */
export const formatDegrees = (radians: number): string =>
  `${Math.round(toDegrees(radians))}°`

/** `1.6 × 0.75 × 0.8 m` */
export const formatDimensions = (w: number, h: number, d: number): string =>
  `${roundTo(w, 2)} × ${roundTo(h, 2)} × ${roundTo(d, 2)} m`

/** Clock time for console rows, e.g. `14:03:22`. */
export const formatClock = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

/** Turns `meeting-table` into `Meeting Table`. */
export const titleCase = (slug: string): string =>
  slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

/** Square metres of floor a footprint occupies. */
export const formatArea = (width: number, depth: number): string =>
  `${roundTo(width * depth, 2)} m²`

/** Compact relative time for provenance rows: `just now`, `4m ago`, `2h ago`. */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
