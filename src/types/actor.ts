/**
 * Who caused a change.
 *
 * Every mutating scene action takes an `ActorRef`. Human interaction passes
 * `HUMAN_ACTOR`; when WebMCP tools are wired up they pass an agent ref instead.
 * That single parameter is what lets history, the activity timeline and the
 * inspector all distinguish human edits from agent edits without any other
 * plumbing.
 */

export type ActorKind = 'human' | 'agent' | 'system'

export interface ActorRef {
  kind: ActorKind
  /** Display name — "You", "Planner", "SynSpace". */
  name: string
}

export const HUMAN_ACTOR: ActorRef = { kind: 'human', name: 'You' }
export const SYSTEM_ACTOR: ActorRef = { kind: 'system', name: 'SynSpace' }

/** Convenience for the (future) WebMCP tool layer. */
export const agentActor = (name: string): ActorRef => ({ kind: 'agent', name })
