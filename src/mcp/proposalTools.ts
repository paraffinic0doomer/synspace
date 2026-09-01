import { OPTIMIZE_STRATEGIES } from '@/spatial'
import { useProposalStore, useSceneStore } from '@/state'
import { toProposalView } from '@/proposals'
import type { Proposal, ProposalView, ScenarioOperation, Vec3 } from '@/types'
import { agentActor } from '@/types'
import type { SynSpaceTool, ToolOutcome } from './tools'
import {
  asRecord,
  requireObject,
  requirePosition,
  requireStrategy,
  requireString,
  type Validated,
} from './validation'

/**
 * Collaboration tools.
 *
 * These are how an agent participates without taking the world over: it can
 * propose, explain and recalculate freely, but applying is gated on an explicit
 * human approval and on the proposal still matching the current world revision.
 */

const PROPOSAL_AGENT = agentActor('Agent')

const fail = (error: string): ToolOutcome => ({ ok: false, error })
const done = (data: Record<string, unknown>): ToolOutcome => ({ ok: true, data })
const proposals = () => useProposalStore.getState()
const world = () => useSceneStore.getState().scene

function check<T>(result: Validated<T>): { ok: true; value: T } | { ok: false; outcome: ToolOutcome } {
  return result.ok ? { ok: true, value: result.value } : { ok: false, outcome: fail(result.error) }
}

function serializeProposal(proposal: Proposal): Record<string, unknown> {
  const view: ProposalView = toProposalView(proposal, world())
  return {
    proposal_id: view.id,
    title: view.title,
    summary: view.summary,
    explanation: view.explanation,
    status: view.status,
    stale: view.stale,
    can_apply: view.canApply,
    requires_human_approval: view.status === 'pending',
    base_world_revision: view.baseWorldRevision,
    current_world_revision: view.currentWorldRevision,
    operation_count: view.operations.length,
    affected_object_ids: view.affectedObjectIds,
    preserved_object_ids: view.preservedObjectIds,
    expected_benefits: view.expectedBenefits.map((benefit) => ({
      label: benefit.label,
      before: benefit.before,
      after: benefit.after,
      unit: benefit.unit,
      improved: benefit.improved,
    })),
    constraint_changes: {
      before: view.constraintChanges.before,
      after: view.constraintChanges.after,
      resolved: view.constraintChanges.resolved,
      introduced: view.constraintChanges.introduced,
    },
  }
}

/** Parses the `operations` array a proposal is built from. */
function parseOperations(raw: unknown): Validated<ScenarioOperation[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: '"operations" must be a non-empty array.' }
  }
  if (raw.length > 50) {
    return { ok: false, error: 'A proposal may contain at most 50 operations.' }
  }

  const operations: ScenarioOperation[] = []
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: `operations[${index}] must be an object.` }
    }
    const record = entry as Record<string, unknown>
    const kind = record.kind

    if (kind === 'move_object') {
      const target = requireObject(world().objects, record, 'object_id')
      if (!target.ok) return { ok: false, error: `operations[${index}]: ${target.error}` }
      const position = requirePosition(record)
      if (!position.ok) return { ok: false, error: `operations[${index}]: ${position.error}` }
      operations.push({
        kind: 'move_object',
        objectId: target.value.id,
        position: position.value as Vec3,
      })
      continue
    }

    if (kind === 'remove_object') {
      const target = requireObject(world().objects, record, 'object_id')
      if (!target.ok) return { ok: false, error: `operations[${index}]: ${target.error}` }
      operations.push({ kind: 'remove_object', objectId: target.value.id })
      continue
    }

    return {
      ok: false,
      error: `operations[${index}]: "kind" must be "move_object" or "remove_object".`,
    }
  }

  return { ok: true, value: operations }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const createProposal: SynSpaceTool = {
  name: 'create_proposal',
  description:
    'Propose a set of changes for the human to review. Nothing is applied: the proposal is simulated, compared against the live world, and returned with its expected benefits. Objects the human has fixed are rejected rather than silently moved.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short name for the proposal.' },
      summary: {
        type: 'string',
        description: 'One sentence a person can act on. Omit to generate one from the measured effect.',
      },
      operations: {
        type: 'array',
        description: 'The changes to simulate.',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['move_object', 'remove_object'] },
            object_id: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          required: ['kind', 'object_id'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'operations'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const title = check(requireString(args.value, 'title'))
    if (!title.ok) return title.outcome
    const summary = check(requireString(args.value, 'summary', { optional: true }))
    if (!summary.ok) return summary.outcome
    const operations = check(parseOperations(args.value.operations))
    if (!operations.ok) return operations.outcome

    const result = proposals().createProposal(
      { title: title.value as string, summary: summary.value, operations: operations.value },
      PROPOSAL_AGENT,
    )
    if (!result.ok) return fail(result.error)

    return done({
      ...serializeProposal(result.data),
      status_note:
        'Awaiting human approval. Call apply_proposal only after the human has approved it.',
    })
  },
}

const proposeLayoutFix: SynSpaceTool = {
  name: 'propose_layout_fix',
  description:
    'Work out a deterministic layout fix and return it as a proposal for the human to review. Fixed objects are never moved. Use after check_constraints reports a problem.',
  inputSchema: {
    type: 'object',
    properties: {
      strategy: { type: 'string', enum: [...OPTIMIZE_STRATEGIES] },
      title: { type: 'string', description: 'Optional proposal title.' },
    },
    required: ['strategy'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const strategy = check(requireStrategy(args.value))
    if (!strategy.ok) return strategy.outcome
    const title = check(requireString(args.value, 'title', { optional: true }))
    if (!title.ok) return title.outcome

    const result = proposals().createLayoutFixProposal(
      strategy.value,
      PROPOSAL_AGENT,
      title.value,
    )
    if (!result.ok) return fail(result.error)

    return done({
      ...serializeProposal(result.data),
      status_note:
        'Awaiting human approval. Call apply_proposal only after the human has approved it.',
    })
  },
}

const listProposals: SynSpaceTool = {
  name: 'list_proposals',
  description:
    'List every proposal with its status and whether it is still valid against the current world revision.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['pending', 'approved', 'rejected', 'applied', 'superseded'],
        description: 'Optional filter.',
      },
    },
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const status = args.value.status
    if (status !== undefined && typeof status !== 'string') {
      return fail('"status" must be a string.')
    }

    const all = proposals().proposals
    const filtered = status ? all.filter((proposal) => proposal.status === status) : all

    return done({
      current_world_revision: world().metadata.revision,
      proposal_count: filtered.length,
      proposals: filtered.map(serializeProposal),
    })
  },
}

const recalculateProposal: SynSpaceTool = {
  name: 'recalculate_proposal',
  description:
    'Rebuild a stale proposal against the current world. Use this when the human has changed the world since the proposal was created — the old proposal is superseded, never applied over newer work.',
  inputSchema: {
    type: 'object',
    properties: { proposal_id: { type: 'string' } },
    required: ['proposal_id'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const id = check(requireString(args.value, 'proposal_id'))
    if (!id.ok) return id.outcome

    const result = proposals().recalculateProposal(id.value as string, PROPOSAL_AGENT)
    if (!result.ok) return fail(result.error)

    return done({
      ...serializeProposal(result.data),
      recalculated_from: result.data.recalculatedFromId,
      status_note: 'Recalculated against the current world. Still awaiting human approval.',
    })
  },
}

const applyProposal: SynSpaceTool = {
  name: 'apply_proposal',
  description:
    'Apply a proposal the human has already approved. Fails if it has not been approved, or if the world has changed since it was computed. Applying is a single undoable step.',
  inputSchema: {
    type: 'object',
    properties: { proposal_id: { type: 'string' } },
    required: ['proposal_id'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const id = check(requireString(args.value, 'proposal_id'))
    if (!id.ok) return id.outcome

    const result = proposals().applyProposal(id.value as string, PROPOSAL_AGENT)
    if (!result.ok) return fail(result.error)

    return done({
      ...serializeProposal(result.data),
      status_note: 'Applied. The human can undo this in one step.',
    })
  },
}

const setObjectFixed: SynSpaceTool = {
  name: 'set_object_fixed',
  description:
    'Mark an object as fixed, or release it. A fixed object is never moved by optimisation or by any proposal. Use this to honour an instruction such as "keep this desk exactly where it is".',
  inputSchema: {
    type: 'object',
    properties: {
      object_id: { type: 'string' },
      fixed: { type: 'boolean', description: 'true to fix in place, false to release.' },
    },
    required: ['object_id', 'fixed'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const target = check(requireObject(world().objects, args.value))
    if (!target.ok) return target.outcome

    const fixed = args.value.fixed
    if (typeof fixed !== 'boolean') return fail('"fixed" must be a boolean.')

    if (target.value.locked === fixed) {
      return done({
        object_id: target.value.id,
        label: target.value.label,
        fixed,
        status: 'unchanged',
      })
    }

    const updated = useSceneStore
      .getState()
      .updateObject(target.value.id, { locked: fixed }, PROPOSAL_AGENT)
    if (!updated) return fail(`Could not update "${target.value.id}".`)

    return done({
      object_id: target.value.id,
      label: target.value.label,
      fixed,
      status: fixed ? 'fixed' : 'released',
      note: fixed
        ? 'This object will be preserved by every future proposal and optimisation.'
        : 'This object may now be moved by proposals and optimisation.',
    })
  },
}

export const PROPOSAL_TOOLS: SynSpaceTool[] = [
  createProposal,
  proposeLayoutFix,
  listProposals,
  recalculateProposal,
  applyProposal,
  setObjectFixed,
]
