import { useEnvironment, useSceneStore, useSelectedObject } from '@/state'
import { formatDegrees, roundTo, titleCase } from '@/utils'
import { Badge, Icon } from '@/components/ui'
import { WorldStateBar, WorldViewSwitch } from './WorldStateBar'

const MODE_LABEL = {
  translate: 'Move',
  rotate: 'Rotate',
  scale: 'Scale',
} as const

/**
 * Non-interactive HUD layered over the canvas. Everything here is read-only
 * status; the actual controls live in the docked panels so the viewport stays
 * uncluttered.
 */
export function ViewportOverlay() {
  const selected = useSelectedObject()
  const transformMode = useSceneStore((state) => state.transformMode)
  const { snapEnabled, translateSnap, rotateSnap } = useEnvironment()

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* Stage vignette */}
      <div className="viewport-vignette absolute inset-0" />

      {/* Top-right: the state of the world at a glance */}
      <div className="absolute top-3 right-3">
        <WorldStateBar />
      </div>

      {/* Top-centre: which world you are looking at, while previewing */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2">
        <WorldViewSwitch />
      </div>

      {/* Top-left: one chip, not three. The active transform mode already sits
          in the header as a lit control, so repeating it here was the same fact
          twice; what the header does not carry is the snap increment. */}
      <div className="absolute top-3 left-3 hidden lg:block">
        <div className="inline-flex items-center gap-2 rounded-lg border border-ink-750/80 bg-ink-900/80 px-2.5 py-1.5 backdrop-blur-md">
          <Icon
            name={transformMode === 'translate' ? 'move' : transformMode === 'rotate' ? 'rotate' : 'scale'}
            size={13}
            className="text-brand-400"
          />
          <span className="text-[11.5px] text-ink-300">{MODE_LABEL[transformMode]}</span>
          <span className="h-3 w-px bg-ink-700" />
          <span className="font-mono text-[10.5px] text-ink-500">
            {snapEnabled ? `snap ${translateSnap} m / ${formatDegrees(rotateSnap)}` : 'free'}
          </span>
        </div>
      </div>

      {/* Bottom-left: navigation keys, which are learned once and then only ever
          in the way. Kept one hover away rather than removed. */}
      <div className="pointer-events-auto absolute bottom-3 left-3 hidden md:block">
        <div className="group relative">
          <button
            type="button"
            aria-label="Viewport navigation"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-ink-750/70 bg-ink-900/70 text-ink-500 backdrop-blur-md transition-colors hover:text-ink-200"
          >
            <Icon name="select" size={12} />
          </button>
          <div className="invisible absolute bottom-0 left-0 flex flex-col gap-1 rounded-lg border border-ink-750/70 bg-ink-900/90 px-2.5 py-2 opacity-0 backdrop-blur-md transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
            <Hint keys="Drag" action="Orbit" />
            <Hint keys="Right-drag" action="Pan" />
            <Hint keys="Scroll" action="Zoom" />
            <Hint keys="Click" action="Select · Esc clears" />
          </div>
        </div>
      </div>

      {/* Bottom-centre: selection readout */}
      {selected && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-2.5 rounded-lg border border-brand-500/35 bg-ink-900/85 px-3 py-1.5 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            <span className="max-w-[16rem] truncate text-[11.5px] font-medium text-ink-100">
              {selected.label}
            </span>
            <Badge tone="brand">{titleCase(selected.type)}</Badge>
            <span className="hidden font-mono text-[10.5px] text-ink-400 lg:inline">
              x {roundTo(selected.position[0], 2)} · y {roundTo(selected.position[1], 2)} · z{' '}
              {roundTo(selected.position[2], 2)}
            </span>
            <span className="hidden font-mono text-[10.5px] text-ink-500 lg:inline">
              {formatDegrees(selected.rotation[1])}
            </span>
            {selected.locked && <Badge tone="warn">locked</Badge>}
          </div>
        </div>
      )}
    </div>
  )
}

function Hint({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-center gap-2">
      <kbd className="min-w-[62px] rounded border border-ink-700 bg-ink-850 px-1.5 py-px text-center font-mono text-[9.5px] text-ink-400">
        {keys}
      </kbd>
      <span className="text-[10.5px] text-ink-500">{action}</span>
    </div>
  )
}
