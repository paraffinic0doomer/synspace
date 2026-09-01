import type { ActorKind } from './actor'

/**
 * Agent roster, WebMCP transport status, and the activity timeline.
 *
 * The timeline is broader than undo history: it records selections, undo/redo,
 * system messages and every WebMCP tool call, so the console reads as a
 * narrative of what humans and agents each did.
 */

export type ActivityLevel = 'info' | 'success' | 'warn' | 'error'

/** Recorded for every WebMCP tool invocation, successful or not. */
export interface ToolInvocationRecord {
  tool: string
  input: unknown
  result: unknown
  success: boolean
  durationMs: number
}

export interface ActivityEntry {
  id: string
  timestamp: number
  actor: string
  /** `agent` for WebMCP tool calls, `human` for direct interaction. */
  actorKind: ActorKind
  level: ActivityLevel
  message: string
  /** Scene object this entry refers to, when applicable. */
  targetId?: string
  /** Set when the entry corresponds to an undoable history entry. */
  changeId?: string
  /** Present only on tool-call entries. */
  tool?: ToolInvocationRecord
}

export type AgentStatus = 'idle' | 'ready' | 'thinking' | 'offline'

export interface AgentDescriptor {
  id: string
  name: string
  role: string
  status: AgentStatus
  capabilities: string[]
}

/** Whether this browser exposes a WebMCP host, and what we registered on it. */
export type McpStatus = 'checking' | 'unavailable' | 'connected' | 'error'

export interface McpState {
  status: McpStatus
  /** Which global the host was found on, e.g. `document.modelContext`. */
  surface: string | null
  toolNames: string[]
  error: string | null
  /** Number of tool calls handled this session. */
  callCount: number
}
