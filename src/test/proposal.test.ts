import { beforeEach, describe, expect, it } from 'vitest'
import { SYNSPACE_TOOLS } from '@/mcp/tools'
import { useProposalStore, useScenarioStore, useSceneStore } from '@/state'
import { createStarterScene } from '@/tools/sceneTemplates'
import { agentActor, HUMAN_ACTOR, type SceneObject, type World } from '@/types'

/**
 * Phase 6 — the human/agent collaboration loop.
 *
 * These run against the real stores and the real tool handlers; only the world
 * fixture is pinned, so ids and timestamps stay stable across runs.
 */

const FIXED_TIME = 1_700_000_000_000
const AGENT = agentActor('Agent')

function createCurrentWorld(): World {
  const starter = createStarterScene()
  return {
    ...starter,
    id: 'world-phase-6-test',
    name: 'Phase 6 collaboration test world',
    objects: starter.objects.map((object, index) => ({
      ...object,
      id: `object-${String(index + 1).padStart(2, '0')}`,
      position: [...object.position],
      rotation: [...object.rotation],
      scale: [...object.scale],
      dimensions: { ...object.dimensions },
      metadata: {
        ...object.metadata,
        createdAt: FIXED_TIME,
        updatedAt: FIXED_TIME,
        tags: [...object.metadata.tags],
        custom: { ...object.metadata.custom },
      },
    })),
    zones: starter.zones.map((zone) => ({
      ...zone,
      bounds: { ...zone.bounds },
      disallowedTypes: [...zone.disallowedTypes],
    })),
    environment: { ...starter.environment, room: { ...starter.environment.room } },
    constraints: starter.constraints.map((constraint) => ({
      ...constraint,
      appliesTo: [...constraint.appliesTo],
    })),
    metadata: {
      ...starter.metadata,
      createdAt: FIXED_TIME,
      updatedAt: FIXED_TIME,
      revision: 1,
      tags: [...starter.metadata.tags],
    },
  }
}

const world = () => useSceneStore.getState().scene
const revision = () => world().metadata.revision

function objectByLabel(label: string): SceneObject {
  const object = world().objects.find((candidate) => candidate.label === label)
  if (!object) throw new Error(`Missing fixture object: ${label}`)
  return object
}

function tool(name: string) {
  const found = SYNSPACE_TOOLS.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`Missing tool: ${name}`)
  return found
}

/** Runs a tool handler and unwraps its structured payload. */
function callTool(name: string, args: unknown) {
  const outcome = tool(name).run(args)
  return outcome.ok
    ? { ok: true as const, data: outcome.data }
    : { ok: false as const, error: outcome.error }
}

beforeEach(() => {
  useSceneStore.setState({
    scene: createCurrentWorld(),
    selectedId: null,
    hoveredId: null,
    pending: null,
    history: { past: [], future: [], limit: 60 },
  })
  useScenarioStore.getState().clearScenarios()
  useProposalStore.getState().clearProposals()
})

// ---------------------------------------------------------------------------

describe('collaboration tool surface', () => {
  it('registers the proposal tools with strict schemas', () => {
    const expected = [
      'create_proposal',
      'propose_layout_fix',
      'list_proposals',
      'recalculate_proposal',
      'apply_proposal',
      'set_object_fixed',
    ]
    for (const name of expected) {
      const found = tool(name)
      expect(found.description.length).toBeGreaterThan(30)
      expect(found.inputSchema).toMatchObject({ type: 'object', additionalProperties: false })
    }
  })
})

describe('the full human-agent loop', () => {
  it('runs human change -> agent proposal -> staleness -> recalculation -> approval -> apply -> undo', () => {
    // 1. Human changes the world.
    const desk = objectByLabel('Desk · A1')
    const revisionAtStart = revision()
    expect(useSceneStore.getState().moveObject(desk.id, [-2.5, 0, 2.5], HUMAN_ACTOR)).toBe(true)
    expect(revision()).toBe(revisionAtStart + 1)
    const revisionAfterHuman = revision()

    // 2. Agent reads the current state and sees the human's edit.
    const read = callTool('read_scene_graph', {})
    expect(read.ok).toBe(true)
    if (!read.ok) return
    const seen = (read.data.objects as { id: string; position: { x: number } }[]).find(
      (entry) => entry.id === desk.id,
    )
    expect(seen?.position.x).toBeCloseTo(-2.5, 3)

    // 3. Agent detects an issue.
    const check = callTool('check_constraints', {})
    expect(check.ok).toBe(true)
    if (!check.ok) return
    expect(typeof check.data.violation_count).toBe('number')

    // 4. Agent creates a proposal. The world must not change.
    const worldBeforeProposal = structuredClone(world())
    const proposed = callTool('propose_layout_fix', { strategy: 'clear_walkways' })
    expect(proposed.ok).toBe(true)
    if (!proposed.ok) return

    const proposalId = proposed.data.proposal_id as string
    expect(proposed.data.status).toBe('pending')
    expect(proposed.data.requires_human_approval).toBe(true)
    expect(proposed.data.base_world_revision).toBe(revisionAfterHuman)
    expect(world()).toEqual(worldBeforeProposal)

    // An unapproved proposal cannot be applied by the agent.
    const premature = callTool('apply_proposal', { proposal_id: proposalId })
    expect(premature.ok).toBe(false)
    if (premature.ok) return
    expect(premature.error).toMatch(/not been approved/i)
    expect(world()).toEqual(worldBeforeProposal)

    // 5. Human changes something else.
    const plant = objectByLabel('Planter · Entry')
    expect(useSceneStore.getState().moveObject(plant.id, [-3.2, 0, 5.2], HUMAN_ACTOR)).toBe(true)
    const revisionAfterSecondEdit = revision()
    expect(revisionAfterSecondEdit).toBe(revisionAfterHuman + 1)

    // 6. The proposal is now stale.
    const listed = callTool('list_proposals', {})
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    const staleEntry = (listed.data.proposals as { proposal_id: string; stale: boolean; can_apply: boolean }[]).find(
      (entry) => entry.proposal_id === proposalId,
    )
    expect(staleEntry?.stale).toBe(true)
    expect(staleEntry?.can_apply).toBe(false)

    // A stale proposal must not be approvable or applicable.
    expect(useProposalStore.getState().approveProposal(proposalId).ok).toBe(false)
    const staleApply = callTool('apply_proposal', { proposal_id: proposalId })
    expect(staleApply.ok).toBe(false)
    if (staleApply.ok) return
    expect(staleApply.error).toMatch(/revision/i)

    // 7. Agent recalculates against the newer world.
    const recalculated = callTool('recalculate_proposal', { proposal_id: proposalId })
    expect(recalculated.ok).toBe(true)
    if (!recalculated.ok) return
    const freshId = recalculated.data.proposal_id as string
    expect(freshId).not.toBe(proposalId)
    expect(recalculated.data.stale).toBe(false)
    expect(recalculated.data.base_world_revision).toBe(revisionAfterSecondEdit)
    expect(recalculated.data.recalculated_from).toBe(proposalId)

    const superseded = useProposalStore
      .getState()
      .proposals.find((candidate) => candidate.id === proposalId)
    expect(superseded?.status).toBe('superseded')

    // 8. Human approves.
    const approval = useProposalStore.getState().approveProposal(freshId, HUMAN_ACTOR)
    expect(approval.ok).toBe(true)

    // 9. Agent applies.
    const worldBeforeApply = structuredClone(world())
    const applied = callTool('apply_proposal', { proposal_id: freshId })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.data.status).toBe('applied')
    expect(world()).not.toEqual(worldBeforeApply)

    // 10. Undo restores the previous state in one step.
    expect(useSceneStore.getState().undo()).toBe(true)
    expect(world().objects.map((object) => object.position)).toEqual(
      worldBeforeApply.objects.map((object) => object.position),
    )
  })
})

describe('world versioning', () => {
  it('advances the revision by exactly one per commit, including a whole proposal', () => {
    const start = revision()

    const desk = objectByLabel('Desk · A1')
    useSceneStore.getState().moveObject(desk.id, [-2.5, 0, 2.5], HUMAN_ACTOR)
    expect(revision()).toBe(start + 1)

    const proposed = callTool('propose_layout_fix', { strategy: 'clear_walkways' })
    expect(proposed.ok).toBe(true)
    if (!proposed.ok) return
    // Proposing is not a commit.
    expect(revision()).toBe(start + 1)
    expect(proposed.data.operation_count as number).toBeGreaterThan(1)

    const proposalId = proposed.data.proposal_id as string
    useProposalStore.getState().approveProposal(proposalId, HUMAN_ACTOR)
    expect(revision()).toBe(start + 1)

    // Applying a multi-operation proposal is a single commit, not one per move.
    expect(callTool('apply_proposal', { proposal_id: proposalId }).ok).toBe(true)
    expect(revision()).toBe(start + 2)

    // Resetting installs a fresh document but must not rewind the counter.
    const beforeReset = revision()
    useSceneStore.getState().resetScene(HUMAN_ACTOR)
    expect(revision()).toBe(beforeReset + 1)
  })
})

describe('human override', () => {
  it('never moves a fixed object and reports it as preserved', () => {
    const managerDesk = objectByLabel('Desk · A1')

    // The human says: keep this desk exactly where it is.
    const fixedResult = callTool('set_object_fixed', {
      object_id: managerDesk.id,
      fixed: true,
    })
    expect(fixedResult.ok).toBe(true)
    if (!fixedResult.ok) return
    expect(fixedResult.data.status).toBe('fixed')

    const pinnedPosition = [...objectByLabel('Desk · A1').position]

    const proposed = callTool('propose_layout_fix', { strategy: 'clear_walkways' })
    expect(proposed.ok).toBe(true)
    if (!proposed.ok) return

    expect(proposed.data.preserved_object_ids).toContain(managerDesk.id)
    expect(proposed.data.affected_object_ids).not.toContain(managerDesk.id)

    const proposalId = proposed.data.proposal_id as string
    expect(useProposalStore.getState().approveProposal(proposalId, HUMAN_ACTOR).ok).toBe(true)
    expect(callTool('apply_proposal', { proposal_id: proposalId }).ok).toBe(true)

    // Applied, and the fixed desk has not moved.
    expect(objectByLabel('Desk · A1').position).toEqual(pinnedPosition)
  })

  it('refuses a proposal that explicitly targets a fixed object', () => {
    const desk = objectByLabel('Desk · A2')
    expect(callTool('set_object_fixed', { object_id: desk.id, fixed: true }).ok).toBe(true)

    const attempt = callTool('create_proposal', {
      title: 'Move the fixed desk',
      operations: [{ kind: 'move_object', object_id: desk.id, x: 0, y: 0, z: 0 }],
    })
    expect(attempt.ok).toBe(false)
    if (attempt.ok) return
    expect(attempt.error).toMatch(/fixed by the human/i)
    expect(useProposalStore.getState().proposals).toHaveLength(0)
  })
})

describe('rejection and explanation', () => {
  it('leaves the world untouched when the human rejects', () => {
    const before = structuredClone(world())
    const proposed = callTool('propose_layout_fix', { strategy: 'grid_align' })
    expect(proposed.ok).toBe(true)
    if (!proposed.ok) return

    const proposalId = proposed.data.proposal_id as string
    const rejected = useProposalStore
      .getState()
      .rejectProposal(proposalId, 'not now', HUMAN_ACTOR)
    expect(rejected.ok).toBe(true)
    expect(world()).toEqual(before)

    // A rejected proposal cannot then be applied.
    const applied = callTool('apply_proposal', { proposal_id: proposalId })
    expect(applied.ok).toBe(false)
  })

  it('returns concise explanations and measurable benefits, not reasoning traces', () => {
    const proposed = callTool('propose_layout_fix', { strategy: 'clear_walkways' })
    expect(proposed.ok).toBe(true)
    if (!proposed.ok) return

    const explanation = proposed.data.explanation as string[]
    expect(Array.isArray(explanation)).toBe(true)
    expect(explanation.length).toBeGreaterThan(0)
    for (const line of explanation) {
      expect(line.length).toBeLessThan(180)
    }

    const benefits = proposed.data.expected_benefits as {
      label: string
      before: number | null
      after: number | null
      improved: boolean
    }[]
    expect(Array.isArray(benefits)).toBe(true)
    for (const benefit of benefits) {
      expect(typeof benefit.label).toBe('string')
      expect(typeof benefit.improved).toBe('boolean')
    }

    const constraintChanges = proposed.data.constraint_changes as {
      before: { errors: number }
      after: { errors: number }
    }
    expect(typeof constraintChanges.before.errors).toBe('number')
    expect(typeof constraintChanges.after.errors).toBe('number')
  })
})

describe('per-object provenance', () => {
  it('reports who last changed each object, separating agent edits from human edits', () => {
    const humanDesk = objectByLabel('Desk · A1')
    const agentDesk = objectByLabel('Desk · A2')

    useSceneStore.getState().moveObject(humanDesk.id, [-2.5, 0, 2.0], HUMAN_ACTOR)
    useSceneStore.getState().moveObject(agentDesk.id, [-1.5, 0, 2.0], AGENT)

    const read = callTool('read_scene_graph', {})
    expect(read.ok).toBe(true)
    if (!read.ok) return

    const objects = read.data.objects as {
      id: string
      last_modified_by: string
      created_by: string
      revision: number
    }[]

    const humanEntry = objects.find((entry) => entry.id === humanDesk.id)
    const agentEntry = objects.find((entry) => entry.id === agentDesk.id)

    expect(humanEntry?.last_modified_by).toBe('human')
    expect(agentEntry?.last_modified_by).toBe('agent')
    expect(humanEntry?.created_by).toBe('system')
    expect(humanEntry?.revision).toBeGreaterThan(1)
  })
})

describe('determinism and attribution', () => {
  it('produces the same proposal payload for the same world', () => {
    const first = callTool('propose_layout_fix', { strategy: 'grid_align' })
    useProposalStore.getState().clearProposals()
    useScenarioStore.getState().clearScenarios()
    useSceneStore.setState({ scene: createCurrentWorld() })
    const second = callTool('propose_layout_fix', { strategy: 'grid_align' })

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.data.affected_object_ids).toEqual(first.data.affected_object_ids)
    expect(second.data.expected_benefits).toEqual(first.data.expected_benefits)
    expect(second.data.operation_count).toEqual(first.data.operation_count)
  })

  it('records the collaboration on the activity timeline with both actors', () => {
    const desk = objectByLabel('Desk · A3')
    useSceneStore.getState().moveObject(desk.id, [-2, 0, 3], HUMAN_ACTOR)

    const proposed = callTool('propose_layout_fix', { strategy: 'clear_walkways' })
    expect(proposed.ok).toBe(true)
    if (!proposed.ok) return
    const proposalId = proposed.data.proposal_id as string

    useProposalStore.getState().approveProposal(proposalId, HUMAN_ACTOR)
    useProposalStore.getState().applyProposal(proposalId, AGENT)

    const activity = useSceneStore.getState().activity
    const messages = activity.map((entry) => entry.message)

    expect(messages.some((message) => /^Moved Desk/.test(message))).toBe(true)
    expect(messages.some((message) => /^Proposed /.test(message))).toBe(true)
    expect(messages.some((message) => /^Approved /.test(message))).toBe(true)
    expect(messages.some((message) => /^Applied /.test(message))).toBe(true)

    // Both collaborators are represented, and distinguishable.
    expect(activity.some((entry) => entry.actorKind === 'human')).toBe(true)
    expect(activity.some((entry) => entry.actorKind === 'agent')).toBe(true)
  })
})
