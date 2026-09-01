import type { SVGProps } from 'react'

/**
 * Single-stroke icon set. Everything is drawn on a 24×24 grid with a 1.6px
 * stroke so icons stay optically consistent across every panel.
 */
const PATHS = {
  select: 'M5 3l6.5 16 2.2-6.3 6.3-2.2z',
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  rotate: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4',
  scale: 'M4 14v6h6M20 10V4h-6M20 4l-7 7M4 20l7-7',
  magnet: 'M6 4v8a6 6 0 0 0 12 0V4M6 4h4v8a2 2 0 0 0 4 0V4h4M6 9h4M14 9h4',
  grid: 'M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18',
  room: 'M3 20V8l9-5 9 5v12M3 20h18M9 20v-6h6v6',
  tag: 'M3 12.5V4a1 1 0 0 1 1-1h8.5L21 11.5 12.5 20zM7.5 7.5h.01',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13M10 11v6M14 11v6',
  copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  lock: 'M6 11h12v10H6zM9 11V7a3 3 0 0 1 6 0v4M12 15v3',
  unlock: 'M6 11h12v10H6zM9 11V7a3 3 0 0 1 5.9-.8M12 15v3',
  eye: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z M12 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z',
  eyeOff: 'M4 4l16 16M9.6 9.7A2.6 2.6 0 0 0 12 14.6c.7 0 1.3-.25 1.8-.66M6.3 6.6C3.8 8.2 2 12 2 12s3.6 6.5 10 6.5c1.9 0 3.5-.45 4.9-1.13M20.4 15.1C21.5 13.6 22 12 22 12s-3.6-6.5-10-6.5c-.8 0-1.5.07-2.2.2',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 2v3M12 19v3M2 12h3M19 12h3',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 3v5h-5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.9-3.9',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  cube: 'M12 2.6l8.5 4.7v9.4L12 21.4l-8.5-4.7V7.3zM12 12.2l8.5-4.9M12 12.2v9.2M12 12.2L3.5 7.3',
  activity: 'M3 12h3.5l2.5-7 4 14 2.6-7H21',
  bot: 'M8 8h8a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3zM12 5V8M9.5 13.5v1.5M14.5 13.5v1.5M2.5 12.5v3M21.5 12.5v3M12 3.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2',
  chevronDown: 'M6 9.5l6 6 6-6',
  chevronRight: 'M9.5 6l6 6-6 6',
  x: 'M6 6l12 12M18 6L6 18',
  download: 'M12 3v12M7.5 10.5L12 15l4.5-4.5M4 20h16',
  sparkles: 'M12 3l1.7 4.8L18.5 9.5l-4.8 1.7L12 16l-1.7-4.8L5.5 9.5l4.8-1.7zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.6h.01',
  ruler: 'M3.5 14.5l11-11 5 5-11 11zM7 8l2 2M10 5l2 2M4.5 10.5l2 2',
  home: 'M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z',
  play: 'M7 4.5l12 7.5-12 7.5z',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M17 10h.01M7 14h10',
  undo: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5',
  redo: 'M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3 4v5h5M12 7.5V12l3.2 1.9',
} as const

export type IconName = keyof typeof PATHS

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
