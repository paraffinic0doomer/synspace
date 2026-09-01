import { useMemo } from 'react'
import { useProposalViews, useSceneStore } from '@/state'
import type { ActivityEntry } from '@/types'
import { Icon } from '@/components/ui'

/**
 * Observe → Analyze → Propose → Apply.
 *
 * The activity log says what happened; this says where the collaboration is.
 * Every stage is read back out of real records — tool calls and proposal
 * status — so it reports the session rather than describing an ideal one.
 */

type StageState = 'idle' | 'done' | 'waiting'

interface Stage {
  key: string
  label: string
  detail: string
  state: StageState
}

/** Most recent successful call of any of the given tools. */
function lastToolResult(activity: ActivityEntry[], names: string[]): Record<string, unknown> | null {
  for (const entry of activity) {
    if (!entry.tool || !entry.tool.success) continue
    if (!names.includes(entry.tool.tool)) continue
    const result = entry.tool.result
    return result && typeof result === 'object' ? (result as Record<string, unknown>) : {}
  }
  return null
}

export function CollaborationFlow() {
  const activity = useSceneStore((state) => state.activity)
  const proposals = useProposalViews()

  const stages = useMemo<Stage[]>(() => {
    const observed = lastToolResult(activity, ['read_scene_graph', 'inspect_world'])
    const analyzed = lastToolResult(activity, ['check_constraints'])

    const pending = proposals.filter(
      (proposal) => proposal.status === 'pending' || proposal.status === 'approved',
    )
    const awaiting = pending.filter((proposal) => proposal.status === 'pending')
    const applied = proposals.filter((proposal) => proposal.status === 'applied')

    const observeCount =
      observed && typeof observed.object_count === 'number' ? observed.object_count : null
    const violationCount =
      analyzed && typeof analyzed.violation_count === 'number' ? analyzed.violation_count : null
    const latestPending = pending.at(-1)
    const latestApplied = applied.at(-1)

    return [
      {
        key: 'observe',
        label: 'Observe',
        detail: observeCount === null ? 'Not yet read' : `Read ${observeCount} objects`,
        state: observed ? 'done' : 'idle',
      },
      {
        key: 'analyze',
        label: 'Analyze',
        detail:
          violationCount === null
            ? 'Not yet analysed'
            : violationCount === 0
              ? 'No violations found'
              : `Detected ${violationCount} violation${violationCount === 1 ? '' : 's'}`,
        state: analyzed ? 'done' : 'idle',
      },
      {
        key: 'propose',
        label: 'Propose',
        detail: latestPending
          ? `${latestPending.operations.length} change${latestPending.operations.length === 1 ? '' : 's'}`
          : 'Nothing proposed',
        state: awaiting.length > 0 ? 'waiting' : latestPending ? 'done' : 'idle',
      },
      {
        key: 'apply',
        label: 'Apply',
        detail: latestApplied
          ? `Applied "${latestApplied.title}"`
          : awaiting.length > 0
            ? 'Blocked on your approval'
            : 'Nothing applied',
        state: latestApplied ? 'done' : 'idle',
      },
    ]
  }, [activity, proposals])

  const waiting = stages.some((stage) => stage.state === 'waiting')

  return (
    <div className="sticky top-0 z-10 border-b border-ink-800 bg-ink-900/95 backdrop-blur">
      <div className="flex items-stretch">
        {stages.map((stage, index) => (
          <div
            key={stage.key}
            className="flex min-w-0 flex-1 items-center gap-1.5 border-r border-ink-850 px-2.5 py-1.5 last:border-r-0"
          >
            <StageDot state={stage.state} />
            <div className="min-w-0 flex-1 leading-tight">
              <p
                className={`font-mono text-[9px] tracking-[0.14em] uppercase ${
                  stage.state === 'waiting'
                    ? 'text-warn-500'
                    : stage.state === 'done'
                      ? 'text-signal-400'
                      : 'text-ink-600'
                }`}
              >
                {stage.label}
              </p>
              <p
                className={`truncate text-[10.5px] ${
                  stage.state === 'idle' ? 'text-ink-600' : 'text-ink-300'
                }`}
              >
                {stage.detail}
              </p>
            </div>
            {index < stages.length - 1 && (
              <Icon name="chevronRight" size={11} className="shrink-0 text-ink-700" />
            )}
          </div>
        ))}
      </div>

      {waiting && (
        <div className="flex items-center gap-1.5 border-t border-warn-500/30 bg-warn-500/8 px-2.5 py-1">
          <Icon name="info" size={11} className="shrink-0 text-warn-500" />
          <span className="font-mono text-[9.5px] tracking-[0.12em] text-warn-500 uppercase">
            Waiting for human approval
          </span>
          <span className="text-[10.5px] text-ink-400">
            — open the Proposals tab to preview, approve or reject.
          </span>
        </div>
      )}
    </div>
  )
}

function StageDot({ state }: { state: StageState }) {
  if (state === 'waiting') {
    return (
      <span className="relative inline-flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warn-500 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-warn-500" />
      </span>
    )
  }
  return (
    <span
      className={`inline-flex h-2 w-2 shrink-0 rounded-full ${
        state === 'done' ? 'bg-signal-500' : 'bg-ink-700'
      }`}
    />
  )
}
