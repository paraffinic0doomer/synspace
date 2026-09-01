import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useCanRedo,
  useCanUndo,
  useHistoryEntries,
  useSceneObjects,
  useSceneStore,
} from '@/state'
import { requestFocus } from '@/tools'
import type {
  ActivityEntry,
  ActivityLevel,
  ActorKind,
  AgentDescriptor,
  ChangeKind,
  HistoryEntry,
  McpState,
} from '@/types'
import { formatClock } from '@/utils'
import { Badge, Button, Icon, IconButton, StatusDot } from '@/components/ui'
import { CollaborationFlow } from './CollaborationFlow'
import { ProposalPanel, useOpenProposalCount } from './ProposalPanel'
import { ScenarioPanel } from './ScenarioPanel'

type ConsoleTab = 'activity' | 'proposals' | 'history' | 'agents'

const MIN_HEIGHT = 132
const MAX_HEIGHT = 460
const COLLAPSED_HEIGHT = 38

const LEVEL_STYLES: Record<ActivityLevel, { bar: string; text: string }> = {
  info: { bar: 'bg-ink-600', text: 'text-ink-300' },
  success: { bar: 'bg-signal-500', text: 'text-signal-400' },
  warn: { bar: 'bg-warn-500', text: 'text-warn-500' },
  error: { bar: 'bg-danger-500', text: 'text-danger-500' },
}

const ACTOR_ICON: Record<ActorKind, 'user' | 'bot' | 'sparkles'> = {
  human: 'user',
  agent: 'bot',
  system: 'sparkles',
}

const ACTOR_TONE: Record<ActorKind, string> = {
  human: 'text-ink-300',
  agent: 'text-signal-400',
  system: 'text-brand-400',
}

const KIND_LABEL: Record<ChangeKind, string> = {
  add: 'add',
  update: 'update',
  move: 'move',
  rotate: 'rotate',
  scale: 'scale',
  delete: 'delete',
  clear: 'clear',
  environment: 'env',
  load: 'load',
}

/**
 * Bottom dock: the shared human/agent record.
 *
 * Activity is the full narrative (selections and undo included); History is the
 * undo stack itself. Both stamp every row with the actor that caused it, so an
 * agent's edits are as reviewable as a person's.
 */
export function AgentConsole() {
  const [tab, setTab] = useState<ConsoleTab>('activity')
  const [height, setHeight] = useState(184)
  const [collapsed, setCollapsed] = useState(false)
  const dragOrigin = useRef<{ y: number; height: number } | null>(null)

  const activity = useSceneStore((state) => state.activity)
  const agents = useSceneStore((state) => state.agents)
  const clearActivity = useSceneStore((state) => state.clearActivity)
  const mcp = useSceneStore((state) => state.mcp)
  const history = useHistoryEntries()
  const openProposals = useOpenProposalCount()

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (collapsed) return
      event.preventDefault()
      dragOrigin.current = { y: event.clientY, height }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [collapsed, height],
  )

  const handleResizeMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current
    if (!origin) return
    const next = origin.height + (origin.y - event.clientY)
    setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, next)))
  }, [])

  const handleResizeEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragOrigin.current = null
  }, [])

  const open = (next: ConsoleTab) => {
    setTab(next)
    setCollapsed(false)
    // A proposal card carries an explanation, benefits and controls; the
    // default console height cuts it off, so give it room the first time.
    if (next === 'proposals') setHeight((current) => Math.max(current, 320))
  }

  return (
    <section
      style={{ height: collapsed ? COLLAPSED_HEIGHT : height }}
      className="relative z-20 flex shrink-0 flex-col border-t border-ink-750 bg-ink-900"
      aria-label="Agent activity console"
    >
      <div
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        className={`absolute -top-[3px] right-0 left-0 h-[6px] touch-none ${
          collapsed ? '' : 'cursor-ns-resize hover:bg-brand-500/30'
        }`}
      />

      <div className="flex h-[37px] shrink-0 items-center gap-2 border-b border-ink-750 px-2.5">
        <div className="flex items-center gap-1">
          <ConsoleTabButton active={tab === 'activity'} onClick={() => open('activity')} icon="activity">
            Activity
            <Badge className="ml-1">{activity.length}</Badge>
          </ConsoleTabButton>
          <ConsoleTabButton
            active={tab === 'proposals'}
            onClick={() => open('proposals')}
            icon="sparkles"
          >
            Proposals
            {openProposals > 0 && (
              <Badge tone="brand" className="ml-1">
                {openProposals}
              </Badge>
            )}
          </ConsoleTabButton>
          <ConsoleTabButton active={tab === 'history'} onClick={() => open('history')} icon="history">
            History
            <Badge className="ml-1">{history.length}</Badge>
          </ConsoleTabButton>
          <ConsoleTabButton active={tab === 'agents'} onClick={() => open('agents')} icon="bot">
            Agents
            <Badge className="ml-1">{agents.length}</Badge>
          </ConsoleTabButton>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <TransportPill mcp={mcp} />
          {tab === 'activity' && (
            <IconButton label="Clear activity" onClick={clearActivity}>
              <Icon name="trash" size={13} />
            </IconButton>
          )}
          <IconButton
            label={collapsed ? 'Expand console' : 'Collapse console'}
            onClick={() => setCollapsed((value) => !value)}
          >
            <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={14} />
          </IconButton>
        </div>
      </div>

      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'activity' && (
            <>
              <CollaborationFlow />
              <ActivityFeed entries={activity} />
            </>
          )}
          {tab === 'proposals' && (
            <div className="flex flex-col">
              <ProposalPanel />
              <ScenarioPanel />
            </div>
          )}
          {tab === 'history' && <HistoryList entries={history} />}
          {tab === 'agents' && <AgentRoster agents={agents} mcp={mcp} />}
        </div>
      )}
    </section>
  )
}

const TRANSPORT: Record<
  McpState['status'],
  { tone: 'signal' | 'warn' | 'danger' | 'default'; label: (mcp: McpState) => string }
> = {
  checking: { tone: 'default', label: () => 'webmcp: checking…' },
  unavailable: { tone: 'warn', label: () => 'webmcp: unavailable in this browser' },
  error: { tone: 'danger', label: (mcp) => `webmcp: ${mcp.error ?? 'registration failed'}` },
  connected: {
    tone: 'signal',
    label: (mcp) =>
      `webmcp: ${mcp.toolNames.length} tools on ${mcp.surface} · ${mcp.callCount} calls`,
  },
}

/** Live WebMCP transport readout — the honest state, not a placeholder. */
function TransportPill({ mcp }: { mcp: McpState }) {
  const transport = TRANSPORT[mcp.status]
  return (
    <span
      title={mcp.toolNames.join(', ') || undefined}
      className="hidden items-center gap-1.5 rounded-md border border-ink-750 bg-ink-850 px-2 py-1 md:inline-flex"
    >
      <StatusDot tone={transport.tone} pulse={mcp.status === 'connected'} />
      <span className="font-mono text-[10px] text-ink-400">{transport.label(mcp)}</span>
    </span>
  )
}

function ConsoleTabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: 'activity' | 'bot' | 'history' | 'sparkles'
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11.5px] font-medium transition-colors ${
        active ? 'bg-ink-750 text-ink-100' : 'text-ink-400 hover:bg-ink-800 hover:text-ink-200'
      }`}
    >
      <Icon name={icon} size={13} />
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  const listRef = useRef<HTMLUListElement>(null)
  const objects = useSceneObjects()
  const selectObject = useSceneStore((state) => state.selectObject)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
  }, [entries.length])

  const exists = (id?: string) => Boolean(id && objects.some((object) => object.id === id))

  return (
    <ul ref={listRef} className="flex flex-col divide-y divide-ink-850 font-mono text-[11px]">
      {entries.map((entry) => {
        const style = LEVEL_STYLES[entry.level]
        const targetExists = exists(entry.targetId)
        return (
          <li
            key={entry.id}
            className="group flex items-start gap-2.5 px-3 py-1.5 hover:bg-ink-850"
          >
            <span className={`mt-1 h-3 w-[2px] shrink-0 rounded-full ${style.bar}`} />
            <span className="w-[58px] shrink-0 pt-px text-ink-600">
              {formatClock(entry.timestamp)}
            </span>
            <span
              className={`inline-flex w-[74px] shrink-0 items-center gap-1 pt-px ${ACTOR_TONE[entry.actorKind]}`}
            >
              <Icon name={ACTOR_ICON[entry.actorKind]} size={11} className="shrink-0" />
              <span className="truncate">{entry.actor}</span>
            </span>
            <span className={`min-w-0 flex-1 pt-px ${style.text}`}>
              {entry.message}
              {entry.tool && expanded === entry.id && <ToolDetail entry={entry} />}
            </span>
            {entry.tool && (
              <button
                type="button"
                onClick={() => setExpanded((current) => (current === entry.id ? null : entry.id))}
                aria-expanded={expanded === entry.id}
                className="shrink-0 rounded border border-ink-700 px-1 text-[9.5px] text-ink-400 hover:border-brand-500/50 hover:text-brand-400"
              >
                {expanded === entry.id ? 'hide' : 'i/o'}
              </button>
            )}
            {targetExists && (
              <button
                type="button"
                onClick={() => {
                  selectObject(entry.targetId!)
                  requestFocus(entry.targetId!)
                }}
                className="shrink-0 rounded border border-transparent px-1 text-[10px] text-ink-600 opacity-0 transition-opacity group-hover:opacity-100 hover:border-ink-650 hover:text-brand-400"
              >
                {entry.targetId}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Full input and output of a tool call, for auditing what an agent did. */
function ToolDetail({ entry }: { entry: ActivityEntry }) {
  if (!entry.tool) return null
  return (
    <div className="mt-1.5 grid gap-1.5 rounded-md border border-ink-750 bg-ink-900 p-2 lg:grid-cols-2">
      <div>
        <p className="pb-0.5 text-[9.5px] tracking-wider text-ink-500 uppercase">input</p>
        <pre className="max-h-32 overflow-auto text-[10px] leading-relaxed whitespace-pre-wrap text-ink-300">
          {JSON.stringify(entry.tool.input, null, 2)}
        </pre>
      </div>
      <div>
        <p className="pb-0.5 text-[9.5px] tracking-wider text-ink-500 uppercase">result</p>
        <pre
          className={`max-h-32 overflow-auto text-[10px] leading-relaxed whitespace-pre-wrap ${
            entry.tool.success ? 'text-signal-400' : 'text-danger-500'
          }`}
        >
          {JSON.stringify(entry.tool.result, null, 2)}
        </pre>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// History (the undo stack)
// ---------------------------------------------------------------------------

function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  const undo = useSceneStore((state) => state.undo)
  const redo = useSceneStore((state) => state.redo)
  const canUndo = useCanUndo()
  const canRedo = useCanRedo()

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
        <Icon name="history" size={22} className="text-ink-600" />
        <p className="text-[12px] font-medium text-ink-300">No changes yet</p>
        <p className="max-w-[22rem] text-[11px] leading-relaxed text-ink-500">
          Every scene modification lands here with the actor that made it, and can be stepped
          back with Ctrl+Z.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-ink-800 bg-ink-900/95 px-3 py-1.5 backdrop-blur">
        <Button onClick={() => undo()} disabled={!canUndo}>
          <Icon name="undo" size={12} />
          Undo
        </Button>
        <Button onClick={() => redo()} disabled={!canRedo}>
          <Icon name="redo" size={12} />
          Redo
        </Button>
        <span className="ml-auto font-mono text-[10px] text-ink-500">
          {entries.length} undoable {entries.length === 1 ? 'change' : 'changes'}
        </span>
      </div>

      <ol className="flex flex-col divide-y divide-ink-850 font-mono text-[11px]">
        {entries.map((entry, index) => (
          <li
            key={entry.id}
            className={`flex items-start gap-2.5 px-3 py-1.5 ${
              index === 0 ? 'bg-brand-500/8' : 'hover:bg-ink-850'
            }`}
          >
            <span className="w-[58px] shrink-0 pt-px text-ink-600">
              {formatClock(entry.timestamp)}
            </span>
            <span
              className={`inline-flex w-[74px] shrink-0 items-center gap-1 pt-px ${ACTOR_TONE[entry.actor.kind]}`}
            >
              <Icon name={ACTOR_ICON[entry.actor.kind]} size={11} className="shrink-0" />
              <span className="truncate">{entry.actor.name}</span>
            </span>
            <Badge className="mt-px shrink-0">{KIND_LABEL[entry.kind]}</Badge>
            <span className="min-w-0 flex-1 pt-px text-ink-300">{entry.label}</span>
            <span className="hidden shrink-0 pt-px text-[10px] text-ink-600 lg:inline">
              {entry.before.objects.length} → {entry.after.objects.length}
            </span>
            {index === 0 && (
              <span className="shrink-0 pt-px text-[10px] text-brand-400">next undo</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agent roster
// ---------------------------------------------------------------------------

const STATUS_TONE = {
  idle: 'default',
  ready: 'signal',
  thinking: 'brand',
  offline: 'warn',
} as const

function AgentRoster({ agents, mcp }: { agents: AgentDescriptor[]; mcp: McpState }) {
  return (
    <div className="grid gap-2 p-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {agents.map((agent) => (
        <article
          key={agent.id}
          className="flex flex-col gap-2 rounded-lg border border-ink-750 bg-ink-850 p-2.5"
        >
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-signal-500/30 bg-signal-500/10 text-signal-400">
              <Icon name="bot" size={15} />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[12px] font-medium text-ink-100">{agent.name}</p>
              <p className="truncate text-[10.5px] text-ink-500">{agent.role}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-900 px-1.5 py-0.5">
              <StatusDot tone={STATUS_TONE[agent.status]} />
              <span className="font-mono text-[9.5px] text-ink-400">{agent.status}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {agent.capabilities.map((capability) => (
              <Badge key={capability}>{capability}</Badge>
            ))}
          </div>
        </article>
      ))}

      <article
        className={`flex flex-col justify-between gap-2 rounded-lg border p-2.5 ${
          mcp.status === 'connected'
            ? 'border-signal-500/40 bg-signal-500/5'
            : 'border-dashed border-ink-700 bg-ink-900/60'
        }`}
      >
        <div className="flex items-start gap-2">
          <span
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-md border ${
              mcp.status === 'connected'
                ? 'border-signal-500/40 text-signal-400'
                : 'border-ink-700 text-ink-500'
            }`}
          >
            <Icon name="sparkles" size={15} />
          </span>
          <p className="text-[11px] leading-relaxed text-ink-400">
            {mcp.status === 'connected'
              ? `WebMCP is live on ${mcp.surface}. Agent tool calls appear in Activity with their full input and output.`
              : mcp.status === 'error'
                ? `WebMCP registration failed: ${mcp.error}`
                : 'No WebMCP host in this browser, so agent tools are inactive. Everything else works normally.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {mcp.toolNames.map((name) => (
            <Badge key={name} tone="signal">
              {name}
            </Badge>
          ))}
        </div>
      </article>
    </div>
  )
}
