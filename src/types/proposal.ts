import type { ActorRef } from './actor'
import type { ScenarioOperation } from './scenario'

/**
 * Agent proposals — the human-in-the-loop layer.
 *
 * A proposal is a *pending* set of changes with a stated rationale and an
 * expected outcome. Nothing in it touches the live world until a human approves
 * it, so an agent can suggest a substantial reorganisation without ever taking
 * the world out from under the person using it.
 *
 * Proposals are pinned to the world revision they were computed against. When
 * the human edits the world afterwards, the proposal goes stale and must be
 * recalculated rather than applied blindly — see `isProposalStale`.
 */

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'superseded'

/** One measurable expected effect, e.g. walkway width 0.9 m -> 1.5 m. */
export interface ProposalBenefit {
  key: string
  label: string
  before: number | null
  after: number | null
  unit: 'm' | 'm2' | 'count'
  /** True when the change moves this metric in the desirable direction. */
  improved: boolean
}

/** The constraint picture before and after, in counts. */
export interface ProposalConstraintChange {
  before: { errors: number; warnings: number; info: number }
  after: { errors: number; warnings: number; info: number }
  resolved: string[]
  introduced: string[]
}

export interface Proposal {
  id: string
  title: string
  /** One sentence a person can act on. Never chain-of-thought. */
  summary: string
  /** Short, concrete statements about what was done and why. */
  explanation: string[]
  operations: ScenarioOperation[]
  affectedObjectIds: string[]
  /**
   * Objects the human has fixed, which this proposal deliberately did not move.
   * Surfacing these is how the human sees their override was respected.
   */
  preservedObjectIds: string[]
  expectedBenefits: ProposalBenefit[]
  constraintChanges: ProposalConstraintChange
  /** The world this was computed against. */
  baseWorldId: string
  baseWorldRevision: number
  /** Scenario holding the simulated result, used for preview and apply. */
  scenarioId: string | null
  status: ProposalStatus
  actor: ActorRef
  createdAt: number
  updatedAt: number
  /** Set when a recalculation replaced this proposal. */
  supersededById?: string
  /** Set on the replacement, pointing back at what it recalculated. */
  recalculatedFromId?: string
}

/**
 * A proposal plus the freshness facts that depend on the live world.
 *
 * Staleness is derived, never stored: it is a comparison against the current
 * revision, so a stored copy could only ever be out of date.
 */
export interface ProposalView extends Proposal {
  stale: boolean
  currentWorldRevision: number
  /** Actionable only when pending/approved, not stale, and still valid. */
  canApply: boolean
}
