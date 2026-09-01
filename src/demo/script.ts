import { executeToolByName, type ExecutedTool } from '@/mcp'
import { useProposalStore, useSceneStore } from '@/state'
import { buildPresetWorld } from '@/tools'
import { HUMAN_ACTOR, SYSTEM_ACTOR, type Vec3 } from '@/types'

/**
 * The guided walkthrough.
 *
 * Every agent step here runs the *real* tool handlers through the same logged
 * path a connected agent uses — the timeline is never written by this script,
 * only by tools that actually executed. What the walkthrough supplies is the
 * arguments: there is no model in the loop, and the UI says so.
 *
 * Human steps go through the ordinary store actions, exactly as dragging in the
 * viewport would. Nothing here is a special case for the demo.
 */

export type StepActor = 'human' | 'agent' | 'system'

export interface StepResult {
  ok: boolean
  /** One line a presenter can read out. */
  outcome: string
  /** Tools that actually ran, for the evidence strip. */
  executed: ExecutedTool[]
}

export interface DemoStep {
  id: string
  scene: string
  title: string
  /** What to say while this step runs. */
  say: string
  actor: StepActor
  /** Tools this step is expected to run, shown before it does. */
  tools: string[]
  run: () => StepResult
}

const scene = () => useSceneStore.getState()
const proposals = () => useProposalStore.getState()

const MANAGER_DESK = 'desk-manager'
/**
 * Where Scene 2 pushes the manager's desk.
 *
 * Chosen because it creates a real, consequential problem rather than a cosmetic
 * one: the desk lands in the emergency egress zone and blocks the approach to
 * the emergency exit, which the constraint evaluator reports as an error and the
 * layout planner can genuinely resolve.
 */
const MANAGER_DESK_MOVED: Vec3 = [-7.2, 0, 4.0]
/** Its home position, restored in Scene 7. */
const MANAGER_DESK_HOME: Vec3 = [-5.4, 0, 2.6]

const run = (calls: [string, unknown][]): ExecutedTool[] =>
  calls.map(([name, args]) => executeToolByName(name, args, 'walkthrough'))

const data = (executed: ExecutedTool, key: string): unknown =>
  executed.outcome.ok ? (executed.outcome.data as Record<string, unknown>)[key] : undefined

// ---------------------------------------------------------------------------

const sceneOne: DemoStep = {
  id: 'world',
  scene: 'Scene 1',
  title: 'The world',
  say: 'This is a live spatial world. I can change it directly — and so can an agent, through the same model.',
  actor: 'system',
  tools: [],
  run: () => {
    const world = buildPresetWorld('workspace')
    if (!world) return { ok: false, outcome: 'The workspace preset is unavailable.', executed: [] }

    scene().loadScene(world, SYSTEM_ACTOR)
    proposals().clearProposals()
    return {
      ok: true,
      outcome: `Loaded the studio floor — ${world.objects.length} objects, ${world.zones.length} zones, a main entrance and an emergency exit.`,
      executed: [],
    }
  },
}

const sceneTwo: DemoStep = {
  id: 'human-move',
  scene: 'Scene 2',
  title: 'A human changes the world',
  say: "I'll drag the manager's desk over toward the west wall to make room — the same action as dragging it in the viewport.",
  actor: 'human',
  tools: [],
  run: () => {
    const desk = scene().scene.objects.find((object) => object.id === MANAGER_DESK)
    if (!desk) return { ok: false, outcome: "The manager's desk is not in this world.", executed: [] }

    const from = [...desk.position]
    const moved = scene().moveObject(MANAGER_DESK, MANAGER_DESK_MOVED, HUMAN_ACTOR)
    if (!moved) return { ok: false, outcome: 'The desk could not be moved.', executed: [] }

    const after = scene().scene
    const now = after.objects.find((object) => object.id === MANAGER_DESK)
    return {
      ok: true,
      outcome: `Moved the manager's desk from (${from[0]}, ${from[2]}) to (${now?.position[0]}, ${now?.position[2]}). World is now revision ${after.metadata.revision}. Nothing has told the agent.`,
      executed: [],
    }
  },
}

const sceneThree: DemoStep = {
  id: 'agent-observe',
  scene: 'Scene 3',
  title: 'The agent observes',
  say: '"I moved the manager\'s desk. What changed?" The agent reads the world itself — not a screenshot of it.',
  actor: 'agent',
  tools: ['read_scene_graph', 'check_constraints'],
  run: () => {
    const executed = run([
      ['read_scene_graph', { object_id: MANAGER_DESK }],
      ['check_constraints', {}],
    ])
    const [read, check] = executed
    if (!read.outcome.ok || !check.outcome.ok) {
      return { ok: false, outcome: 'The agent could not read the world.', executed }
    }

    const objectCount = data(read, 'object_count')
    const summary = data(check, 'summary') as { errors: number; warnings: number } | undefined
    const violations = (data(check, 'violations') as { message: string; object_ids: string[] }[]) ?? []

    // Lead with the consequence for the object the human actually touched.
    const aboutTheDesk = violations
      .filter((violation) => violation.object_ids.includes(MANAGER_DESK))
      .map((violation) => violation.message)

    return {
      ok: true,
      outcome:
        aboutTheDesk.length > 0
          ? `Read ${objectCount} objects. ${aboutTheDesk.join(' ')} (${summary?.errors ?? 0} error, ${summary?.warnings ?? 0} warnings in total.)`
          : `Read ${objectCount} objects and found ${summary?.errors ?? 0} error(s), ${summary?.warnings ?? 0} warning(s).`,
      executed,
    }
  },
}

const sceneFour: DemoStep = {
  id: 'what-if',
  scene: 'Scene 4',
  title: 'What if?',
  say: '"What happens if we add 10 more employees while keeping the emergency exit clear?" This runs in an isolated copy — the real world is untouched.',
  actor: 'agent',
  tools: ['create_scenario', 'modify_scenario', 'analyze_scenario', 'compare_scenarios'],
  run: () => {
    const revisionBefore = scene().scene.metadata.revision

    const created = executeToolByName(
      'create_scenario',
      { name: 'Ten more employees' },
      'walkthrough',
    )
    if (!created.outcome.ok) {
      return { ok: false, outcome: 'The scenario could not be created.', executed: [created] }
    }
    const scenarioId = data(created, 'scenario_id') as string

    const executed = [
      created,
      ...run([
        [
          'modify_scenario',
          {
            scenario_id: scenarioId,
            operation: {
              kind: 'add_object',
              asset_type: 'chair',
              count: 10,
              zone_id: 'zone-workspace-a',
              label_prefix: 'New employee',
            },
          },
        ],
        ['analyze_scenario', { scenario_id: scenarioId }],
        ['compare_scenarios', { scenario_id: scenarioId }],
      ]),
    ]

    const failed = executed.find((step) => !step.outcome.ok)
    if (failed) {
      const error = failed.outcome.ok ? '' : failed.outcome.error
      return { ok: false, outcome: `${failed.tool} failed: ${error}`, executed }
    }

    const comparison = executed[executed.length - 1]
    const recommendation = data(comparison, 'recommendation') as
      | { decision: string; explanation: string }
      | undefined
    const revisionAfter = scene().scene.metadata.revision

    return {
      ok: revisionAfter === revisionBefore,
      outcome:
        revisionAfter === revisionBefore
          ? `Simulated 10 extra seats. Recommendation: ${recommendation?.decision ?? 'review'} — ${recommendation?.explanation ?? ''} The live world is still revision ${revisionAfter}.`
          : 'The live world changed during a what-if, which it must not.',
      executed,
    }
  },
}

const sceneFive: DemoStep = {
  id: 'proposal',
  scene: 'Scene 5',
  title: 'The agent proposes',
  say: 'The agent turns its analysis into a proposal, with the numbers behind it — and the emergency exit clear. Nothing is applied yet.',
  actor: 'agent',
  tools: ['propose_layout_fix'],
  run: () => {
    const executed = run([['propose_layout_fix', { strategy: 'clear_walkways' }]])
    const [proposed] = executed
    if (!proposed.outcome.ok) {
      const error = proposed.outcome.ok ? '' : proposed.outcome.error
      return { ok: false, outcome: `No proposal was produced: ${error}`, executed }
    }

    const id = data(proposed, 'proposal_id') as string
    proposals().setPreview(id)

    const benefits = (data(proposed, 'expected_benefits') as
      | { label: string; before: number | null; after: number | null }[]
      | undefined) ?? []
    const headline = benefits.find((benefit) => benefit.label === 'Narrowest walkway') ?? benefits[0]

    return {
      ok: true,
      outcome: headline
        ? `Proposed ${data(proposed, 'operation_count')} change(s). ${headline.label}: ${headline.before} → ${headline.after}. Awaiting your approval.`
        : `Proposed ${data(proposed, 'operation_count')} change(s). Awaiting your approval.`,
      executed,
    }
  },
}

const sceneSix: DemoStep = {
  id: 'approve',
  scene: 'Scene 6',
  title: 'The human decides',
  say: 'I review it and approve. Only then can the agent apply it — and it lands as a single undoable step.',
  actor: 'human',
  tools: ['apply_proposal'],
  run: () => {
    const pending = proposals().proposals.find((proposal) => proposal.status === 'pending')
    if (!pending) return { ok: false, outcome: 'There is no proposal awaiting review.', executed: [] }

    const approved = proposals().approveProposal(pending.id, HUMAN_ACTOR)
    if (!approved.ok) return { ok: false, outcome: approved.error, executed: [] }

    // The agent applies what the human approved, through the real tool.
    const executed = run([['apply_proposal', { proposal_id: pending.id }]])
    const [applied] = executed
    if (!applied.outcome.ok) {
      const error = applied.outcome.ok ? '' : applied.outcome.error
      return { ok: false, outcome: `Apply failed: ${error}`, executed }
    }

    proposals().setPreview(null)
    return {
      ok: true,
      outcome: `Approved and applied. The world is now revision ${scene().scene.metadata.revision}; one Ctrl+Z puts it back.`,
      executed,
    }
  },
}

const sceneSeven: DemoStep = {
  id: 'override',
  scene: 'Scene 7',
  title: 'Human override',
  say: 'I change the room again and fix the desk in place. The agent re-reads the world rather than trusting what it saw a moment ago.',
  actor: 'human',
  tools: ['set_object_fixed', 'read_scene_graph', 'check_constraints'],
  run: () => {
    const desk = scene().scene.objects.find((object) => object.id === MANAGER_DESK)
    if (!desk) return { ok: false, outcome: "The manager's desk is not in this world.", executed: [] }

    scene().moveObject(MANAGER_DESK, MANAGER_DESK_HOME, HUMAN_ACTOR)
    const revisionAfterHuman = scene().scene.metadata.revision

    const executed = run([
      ['set_object_fixed', { object_id: MANAGER_DESK, fixed: true }],
      ['read_scene_graph', { object_id: MANAGER_DESK }],
      ['check_constraints', {}],
      ['propose_layout_fix', { strategy: 'clear_walkways' }],
    ])

    const read = executed[1]
    const proposal = executed[3]
    const seen = read.outcome.ok
      ? ((read.outcome.data as Record<string, unknown>).focus as { object_id: string } | undefined)
      : undefined
    const preserved = proposal.outcome.ok
      ? ((proposal.outcome.data as Record<string, unknown>).preserved_object_ids as string[])
      : []

    return {
      ok: seen?.object_id === MANAGER_DESK && preserved.includes(MANAGER_DESK),
      outcome: `The agent re-read the world at revision ${revisionAfterHuman} and its new proposal preserves the desk I fixed — it did not reuse what it saw before.`,
      executed,
    }
  },
}

export const DEMO_STEPS: DemoStep[] = [
  sceneOne,
  sceneTwo,
  sceneThree,
  sceneFour,
  sceneFive,
  sceneSix,
  sceneSeven,
]
