import { create } from 'zustand'
import {
  buildLayoutFixProposal,
  buildProposal,
  isProposalStale,
  toProposalView,
  type ProposalInput,
} from '@/proposals'
import type { ScenarioResult } from '@/scenarios'
import type { OptimizeStrategy } from '@/spatial'
import type { ActorRef, Proposal, ProposalView, World } from '@/types'
import { HUMAN_ACTOR } from '@/types'
import { useScenarioStore } from './scenarioStore'
import { useSceneStore } from './sceneStore'

/**
 * Proposal lifecycle.
 *
 * The rules this store exists to enforce:
 *  - an agent may never apply a proposal the human has not approved;
 *  - a proposal computed against an older world revision is stale and cannot
 *    be applied over the human's newer changes;
 *  - applying goes through the scenario apply path, so the whole proposal is a
 *    single undoable step.
 */

/** Which side of a preview the viewport renders solid. */
export type WorldView = 'current' | 'proposed'

export interface ProposalState {
  proposals: Proposal[]
  /** Proposal currently previewed in the viewport, if any. */
  previewId: string | null
  /**
   * `current` renders the live world with the proposal ghosted over it;
   * `proposed` renders the simulated result with the live world ghosted.
   * Either way the live world is never modified.
   */
  worldView: WorldView

  createProposal: (input: ProposalInput, actor?: ActorRef) => ScenarioResult<Proposal>
  createLayoutFixProposal: (
    strategy: OptimizeStrategy,
    actor?: ActorRef,
    title?: string,
  ) => ScenarioResult<Proposal>
  /** Rebuilds a stale proposal against the current world. */
  recalculateProposal: (id: string, actor?: ActorRef) => ScenarioResult<Proposal>
  approveProposal: (id: string, actor?: ActorRef) => ScenarioResult<Proposal>
  rejectProposal: (id: string, reason?: string, actor?: ActorRef) => ScenarioResult<Proposal>
  applyProposal: (id: string, actor?: ActorRef) => ScenarioResult<Proposal>
  setPreview: (id: string | null) => void
  setWorldView: (view: WorldView) => void
  clearProposals: () => void
}

const fail = <T = never>(error: string): ScenarioResult<T> => ({ ok: false, error })
const ok = <T>(data: T): ScenarioResult<T> => ({ ok: true, data })

const find = (proposals: Proposal[], id: string) =>
  proposals.find((proposal) => proposal.id === id)

const replace = (proposals: Proposal[], next: Proposal) =>
  proposals.map((proposal) => (proposal.id === next.id ? next : proposal))

const world = (): World => useSceneStore.getState().scene
const log = (
  message: string,
  actor: ActorRef,
  level: 'info' | 'success' | 'warn' | 'error' = 'info',
) => useSceneStore.getState().log({ message, actor, level })

/** Registers a freshly built proposal and its backing scenario. */
function adopt(
  built: { proposal: Proposal; scenario: import('@/types').Scenario },
  set: (fn: (state: ProposalState) => Partial<ProposalState>) => void,
) {
  useScenarioStore.setState((state) => ({
    scenarios: [...state.scenarios, built.scenario],
    activeScenarioId: built.scenario.id,
  }))
  set((state) => ({ proposals: [...state.proposals, built.proposal] }))
}

export const useProposalStore = create<ProposalState>()((set, get) => ({
  proposals: [],
  previewId: null,
  worldView: 'current',

  createProposal: (input, actor = HUMAN_ACTOR) => {
    const result = buildProposal(world(), input, actor)
    if (!result.ok) return fail(result.error)

    adopt(result.data, set)
    const { proposal } = result.data
    log(
      `Proposed "${proposal.title}" — ${proposal.operations.length} change(s), awaiting human review`,
      actor,
      'info',
    )
    return ok(proposal)
  },

  createLayoutFixProposal: (strategy, actor = HUMAN_ACTOR, title) => {
    const result = buildLayoutFixProposal(world(), strategy, actor, title)
    if (!result.ok) return fail(result.error)

    adopt(result.data, set)
    const { proposal } = result.data
    log(
      `Proposed "${proposal.title}" — ${proposal.operations.length} change(s), awaiting human review`,
      actor,
      'info',
    )
    return ok(proposal)
  },

  recalculateProposal: (id, actor = HUMAN_ACTOR) => {
    const previous = find(get().proposals, id)
    if (!previous) return fail(`No proposal with id "${id}".`)
    if (previous.status === 'applied') return fail('An applied proposal cannot be recalculated.')

    const current = world()
    const rebuilt = buildProposal(
      current,
      {
        title: previous.title,
        summary: undefined,
        operations: previous.operations,
      },
      actor,
    )

    if (!rebuilt.ok) {
      // The old plan no longer makes sense against the new world — say so
      // plainly rather than leaving a stale proposal looking actionable.
      const superseded: Proposal = {
        ...previous,
        status: 'superseded',
        updatedAt: Date.now(),
      }
      set((state) => ({ proposals: replace(state.proposals, superseded) }))
      log(
        `Could not recalculate "${previous.title}" against revision ${current.metadata.revision}: ${rebuilt.error}`,
        actor,
        'warn',
      )
      return fail(rebuilt.error)
    }

    const next: Proposal = {
      ...rebuilt.data.proposal,
      recalculatedFromId: previous.id,
    }
    const supersededPrevious: Proposal = {
      ...previous,
      status: 'superseded',
      supersededById: next.id,
      updatedAt: Date.now(),
    }

    useScenarioStore.setState((state) => ({
      scenarios: [...state.scenarios, rebuilt.data.scenario],
      activeScenarioId: rebuilt.data.scenario.id,
    }))
    set((state) => ({
      proposals: [...replace(state.proposals, supersededPrevious), next],
      previewId: state.previewId === previous.id ? next.id : state.previewId,
    }))

    log(
      `Recalculated "${next.title}" against world revision ${current.metadata.revision}`,
      actor,
      'success',
    )
    return ok(next)
  },

  approveProposal: (id, actor = HUMAN_ACTOR) => {
    const proposal = find(get().proposals, id)
    if (!proposal) return fail(`No proposal with id "${id}".`)
    if (proposal.status === 'applied') return fail('This proposal was already applied.')
    if (proposal.status === 'rejected') return fail('This proposal was rejected.')
    if (proposal.status === 'superseded') return fail('This proposal was superseded.')
    if (isProposalStale(proposal, world())) {
      return fail(
        `The world has changed since this proposal was computed (revision ${proposal.baseWorldRevision} → ${world().metadata.revision}). Recalculate it first.`,
      )
    }

    const next: Proposal = { ...proposal, status: 'approved', updatedAt: Date.now() }
    set((state) => ({ proposals: replace(state.proposals, next) }))
    log(`Approved "${proposal.title}"`, actor, 'success')
    return ok(next)
  },

  rejectProposal: (id, reason, actor = HUMAN_ACTOR) => {
    const proposal = find(get().proposals, id)
    if (!proposal) return fail(`No proposal with id "${id}".`)
    if (proposal.status === 'applied') return fail('An applied proposal cannot be rejected.')

    const next: Proposal = { ...proposal, status: 'rejected', updatedAt: Date.now() }
    set((state) => ({
      proposals: replace(state.proposals, next),
      previewId: state.previewId === id ? null : state.previewId,
    }))
    log(
      `Rejected "${proposal.title}"${reason ? ` — ${reason}` : ''}; the world was left unchanged`,
      actor,
      'warn',
    )
    return ok(next)
  },

  applyProposal: (id, actor = HUMAN_ACTOR) => {
    const proposal = find(get().proposals, id)
    if (!proposal) return fail(`No proposal with id "${id}".`)
    if (proposal.status === 'applied') return fail('This proposal was already applied.')
    if (proposal.status === 'rejected') return fail('This proposal was rejected.')
    if (proposal.status === 'superseded') return fail('This proposal was superseded.')

    const current = world()
    if (isProposalStale(proposal, current)) {
      return fail(
        `The world has changed since this proposal was computed (revision ${proposal.baseWorldRevision} → ${current.metadata.revision}). Recalculate it before applying.`,
      )
    }

    // The human is the authority: an agent may only apply what was approved.
    if (actor.kind === 'agent' && proposal.status !== 'approved') {
      return fail(
        'This proposal has not been approved by the human yet. Ask for approval before applying.',
      )
    }

    if (!proposal.scenarioId) return fail('This proposal has no simulated result to apply.')
    const applied = useScenarioStore.getState().applyScenario(proposal.scenarioId, actor)
    if (!applied.ok) return fail(applied.error)

    const next: Proposal = { ...proposal, status: 'applied', updatedAt: Date.now() }
    set((state) => ({
      proposals: replace(state.proposals, next),
      previewId: state.previewId === id ? null : state.previewId,
    }))
    log(
      `Applied "${proposal.title}" — ${proposal.affectedObjectIds.length} object(s) changed, undo restores the previous layout`,
      actor,
      'success',
    )
    return ok(next)
  },

  setPreview: (id) => {
    if (id !== null && !find(get().proposals, id)) return
    set({ previewId: id, worldView: id === null ? 'current' : get().worldView })
  },

  setWorldView: (view) => set({ worldView: view }),

  clearProposals: () => set({ proposals: [], previewId: null, worldView: 'current' }),
}))

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Proposals with freshness resolved against the live world. */
export function useProposalViews(): ProposalView[] {
  const proposals = useProposalStore((state) => state.proposals)
  const currentWorld = useSceneStore((state) => state.scene)
  return proposals.map((proposal) => toProposalView(proposal, currentWorld))
}

export function useProposalView(id: string | null): ProposalView | null {
  const proposals = useProposalStore((state) => state.proposals)
  const currentWorld = useSceneStore((state) => state.scene)
  if (!id) return null
  const proposal = proposals.find((candidate) => candidate.id === id)
  return proposal ? toProposalView(proposal, currentWorld) : null
}

/** The proposal being previewed in the viewport, if any. */
export function usePreviewProposal(): ProposalView | null {
  const previewId = useProposalStore((state) => state.previewId)
  return useProposalView(previewId)
}

/**
 * The simulated world behind the previewed proposal.
 *
 * Returned only while previewing; the live document is untouched either way.
 */
export function usePreviewWorld(): World | null {
  const previewId = useProposalStore((state) => state.previewId)
  const proposals = useProposalStore((state) => state.proposals)
  const scenarios = useScenarioStore((state) => state.scenarios)
  if (!previewId) return null
  const proposal = proposals.find((candidate) => candidate.id === previewId)
  if (!proposal?.scenarioId) return null
  return scenarios.find((scenario) => scenario.id === proposal.scenarioId)?.world ?? null
}

/**
 * Objects the viewport should draw.
 *
 * Switches to the proposed world only when the human explicitly asks for that
 * view — the default always shows what is actually there.
 */
export function useDisplayedObjects(): {
  objects: World['objects']
  showingProposed: boolean
} {
  const live = useSceneStore((state) => state.scene.objects)
  const worldView = useProposalStore((state) => state.worldView)
  const previewWorld = usePreviewWorld()

  const showingProposed = worldView === 'proposed' && previewWorld !== null
  return { objects: showingProposed ? previewWorld.objects : live, showingProposed }
}
