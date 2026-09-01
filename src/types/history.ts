import type { ActorRef } from './actor'
import type { Scene } from './scene'

/**
 * Undo history.
 *
 * Entries are snapshot-based: each holds the whole `Scene` before and after the
 * change. Because scene updates are immutable, unchanged objects are shared by
 * reference between snapshots, so a snapshot costs one array and a handful of
 * pointers — far cheaper and far less bug-prone than maintaining inverse
 * operations for every action.
 */

export type ChangeKind =
  | 'add'
  | 'update'
  | 'move'
  | 'rotate'
  | 'scale'
  | 'delete'
  | 'clear'
  | 'environment'
  | 'load'

export interface HistoryEntry {
  id: string
  /** Human-readable summary, e.g. "Moved Desk · A1". */
  label: string
  kind: ChangeKind
  /** Who made the change — this is what separates human edits from agent edits. */
  actor: ActorRef
  timestamp: number
  targetIds: string[]
  before: Scene
  after: Scene
}

export interface SceneHistory {
  /** Oldest first; the last element is the change undo will revert. */
  past: HistoryEntry[]
  /** Most recently undone first. */
  future: HistoryEntry[]
  /** Maximum retained entries. */
  limit: number
}
