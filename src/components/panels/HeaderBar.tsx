import { useState } from 'react'
import {
  useCanRedo,
  useCanUndo,
  useEnvironment,
  useNextRedoLabel,
  useNextUndoLabel,
  useSceneName,
  useSceneStats,
  useSceneStore,
  useWorldMetadata,
} from '@/state'
import { SHORTCUTS, requestResetView } from '@/tools'
import type { TransformMode } from '@/types'
import { Badge, Icon, IconButton, SegmentedControl, StatusDot } from '@/components/ui'

const MODE_OPTIONS: {
  value: TransformMode
  label: string
  hint: string
  icon: React.ReactNode
}[] = [
  { value: 'translate', label: 'Move', hint: 'W', icon: <Icon name="move" size={13} /> },
  { value: 'rotate', label: 'Rotate', hint: 'E', icon: <Icon name="rotate" size={13} /> },
  { value: 'scale', label: 'Scale', hint: 'R', icon: <Icon name="scale" size={13} /> },
]

/** Top chrome: identity, document context, transform tools, history and view state. */
interface HeaderBarProps {
  demoOpen: boolean
  onToggleDemo: () => void
}

export function HeaderBar({ demoOpen, onToggleDemo }: HeaderBarProps) {
  const sceneName = useSceneName()
  const environment = useEnvironment()
  const transformMode = useSceneStore((state) => state.transformMode)
  const agents = useSceneStore((state) => state.agents)
  const mcp = useSceneStore((state) => state.mcp)

  const setTransformMode = useSceneStore((state) => state.setTransformMode)
  const updateEnvironment = useSceneStore((state) => state.updateEnvironment)
  const undo = useSceneStore((state) => state.undo)
  const redo = useSceneStore((state) => state.redo)

  const canUndo = useCanUndo()
  const canRedo = useCanRedo()
  const undoLabel = useNextUndoLabel()
  const redoLabel = useNextRedoLabel()

  const stats = useSceneStats()
  const revision = useWorldMetadata().revision
  const [showShortcuts, setShowShortcuts] = useState(false)

  const { snapEnabled, showGrid, showRoom, showLabels } = environment

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-ink-750 bg-ink-900 px-3">
      {/* Identity */}
      <div className="flex items-center gap-2.5 pr-3">
        <div className="relative grid h-8 w-8 place-items-center rounded-[9px] border border-brand-500/40 bg-linear-to-br from-brand-500/25 to-signal-500/10">
          <Icon name="cube" size={17} className="text-brand-400" />
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-[13.5px] font-semibold tracking-tight text-ink-100">
              SynSpace
            </span>
            <Badge>v0.3</Badge>
          </div>
          <span className="text-[10.5px] tracking-wide text-brand-400/90">
            One world. Two minds.
          </span>
        </div>
      </div>

      <div className="h-7 w-px bg-ink-750" />

      {/* Document context — counts live in the viewport's world-state bar */}
      <div className="hidden min-w-0 flex-col leading-tight lg:flex">
        <span className="truncate text-[12px] font-medium text-ink-200">{sceneName}</span>
        <span className="font-mono text-[10.5px] text-ink-500">
          {stats.floorArea} m² floor · rev {revision}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* History */}
        <div className="flex items-center gap-0.5 rounded-lg border border-ink-750 bg-ink-850 p-0.5">
          <IconButton
            label="Undo"
            tooltip={undoLabel ? `Undo: ${undoLabel}` : 'Nothing to undo'}
            disabled={!canUndo}
            onClick={() => undo()}
          >
            <Icon name="undo" size={14} />
          </IconButton>
          <IconButton
            label="Redo"
            tooltip={redoLabel ? `Redo: ${redoLabel}` : 'Nothing to redo'}
            disabled={!canRedo}
            onClick={() => redo()}
          >
            <Icon name="redo" size={14} />
          </IconButton>
        </div>

        <div className="h-7 w-px bg-ink-750" />

        {/* Transform tools */}
        <SegmentedControl
          value={transformMode}
          options={MODE_OPTIONS}
          onChange={setTransformMode}
        />

        <IconButton
          label={snapEnabled ? 'Snapping on (X)' : 'Snapping off (X)'}
          tone="brand"
          active={snapEnabled}
          onClick={() => updateEnvironment({ snapEnabled: !snapEnabled })}
        >
          <Icon name="magnet" size={14} />
        </IconButton>

        <div className="h-7 w-px bg-ink-750" />

        {/* View state */}
        <div className="flex items-center gap-0.5 rounded-lg border border-ink-750 bg-ink-850 p-0.5">
          <IconButton
            label="Grid"
            tone="brand"
            active={showGrid}
            onClick={() => updateEnvironment({ showGrid: !showGrid })}
          >
            <Icon name="grid" size={14} />
          </IconButton>
          <IconButton
            label="Room shell"
            tone="brand"
            active={showRoom}
            onClick={() => updateEnvironment({ showRoom: !showRoom })}
          >
            <Icon name="room" size={14} />
          </IconButton>
          <IconButton
            label="Labels (L)"
            tone="brand"
            active={showLabels}
            onClick={() => updateEnvironment({ showLabels: !showLabels })}
          >
            <Icon name="tag" size={14} />
          </IconButton>
        </div>

        <IconButton label="Reset view (Home)" onClick={requestResetView}>
          <Icon name="home" size={14} />
        </IconButton>

        <button
          type="button"
          onClick={onToggleDemo}
          aria-pressed={demoOpen}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-medium transition-colors ${
            demoOpen
              ? 'border-brand-500/50 bg-brand-500/15 text-brand-400'
              : 'border-ink-650 text-ink-200 hover:bg-ink-750'
          }`}
        >
          <Icon name="play" size={12} />
          Demo
        </button>

        <div className="h-7 w-px bg-ink-750" />

        {/* Agent presence — reflects the real WebMCP transport */}
        <div
          title={
            mcp.status === 'connected'
              ? `WebMCP on ${mcp.surface}: ${mcp.toolNames.join(', ')}`
              : 'No WebMCP host detected in this browser'
          }
          className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
            mcp.status === 'connected'
              ? 'border-signal-500/40 bg-signal-500/8'
              : 'border-ink-750 bg-ink-850'
          }`}
        >
          <StatusDot
            tone={mcp.status === 'connected' ? 'signal' : mcp.status === 'error' ? 'danger' : 'warn'}
            pulse={mcp.status === 'connected'}
          />
          <span className="text-[11.5px] text-ink-300">
            <span className="font-medium text-ink-100">
              {mcp.status === 'connected' ? mcp.toolNames.length : agents.length}
            </span>{' '}
            {mcp.status === 'connected' ? 'tools' : 'agents'}
          </span>
          <span className="hidden font-mono text-[10px] text-ink-500 xl:inline">
            {mcp.status === 'connected' ? 'webmcp live' : 'webmcp offline'}
          </span>
        </div>

        <div className="relative">
          <IconButton
            label="Keyboard shortcuts"
            active={showShortcuts}
            onClick={() => setShowShortcuts((open) => !open)}
          >
            <Icon name="keyboard" size={14} />
          </IconButton>

          {showShortcuts && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowShortcuts(false)}
                aria-hidden="true"
              />
              <div className="absolute top-9 right-0 z-50 w-64 rounded-panel border border-ink-700 bg-ink-850 p-1.5 shadow-2xl shadow-black/60">
                <p className="px-2 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-ink-400 uppercase">
                  Shortcuts
                </p>
                {SHORTCUTS.map((shortcut) => (
                  <div
                    key={shortcut.keys}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1 hover:bg-ink-800"
                  >
                    <span className="text-[11.5px] text-ink-300">{shortcut.label}</span>
                    <kbd className="rounded border border-ink-650 bg-ink-900 px-1.5 py-px font-mono text-[10px] text-ink-300">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
