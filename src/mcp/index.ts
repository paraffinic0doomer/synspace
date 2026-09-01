import { useSceneStore } from '@/state'
import { SYSTEM_ACTOR } from '@/types'
import { detectHost, registerTools, type HostTool, type HostToolResponse } from './host'
import { AGENT_ACTOR, SYNSPACE_TOOLS, TOOL_NAMES, type SynSpaceTool } from './tools'
import { executeTool } from './execute'

/**
 * WebMCP wiring.
 *
 * This module is the only place that touches `document.modelContext`. Tools are
 * defined in `tools.ts` against centralized state actions and know nothing
 * about the browser API; this file adapts them to the host and records every
 * call on the activity timeline.
 */

export interface McpConnection {
  surface: string
  toolNames: string[]
  dispose: () => void
}

/** Adapts a tool to the host, routing execution through the shared logged path. */
function toHostTool(tool: SynSpaceTool): HostTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    execute: async (args: unknown): Promise<HostToolResponse> => {
      const { outcome } = executeTool(tool, args, 'agent')
      const payload = outcome.ok ? outcome.data : { error: outcome.error }

      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
        isError: !outcome.ok,
      }
    },
  }
}

/**
 * Registers the SynSpace tool surface if this browser exposes a WebMCP host.
 *
 * Returns null when no host exists — the caller carries on and the app behaves
 * exactly as it did before WebMCP.
 */
export function connectWebMcp(): McpConnection | null {
  const store = useSceneStore.getState()
  const detected = detectHost()

  if (!detected) {
    // StrictMode mounts effects twice in development; only narrate a genuine
    // change of transport state, not a remount.
    const alreadyReported = store.mcp.status === 'unavailable'
    store.setMcpState({
      status: 'unavailable',
      surface: null,
      toolNames: [],
      error: null,
    })
    if (alreadyReported) return null
    store.log({
      message:
        'WebMCP host not found in this browser — SynSpace runs normally, agent tools are inactive.',
      actor: SYSTEM_ACTOR,
      level: 'info',
    })
    return null
  }

  // A remount re-registers the tools but is not news; only a genuine change of
  // transport state gets narrated.
  const alreadyConnected =
    store.mcp.status === 'connected' && store.mcp.surface === detected.surface

  try {
    const { registered, dispose } = registerTools(detected, SYNSPACE_TOOLS.map(toHostTool))

    store.setMcpState({
      status: 'connected',
      surface: detected.surface,
      toolNames: registered,
      error: null,
    })
    if (!alreadyConnected) {
      store.log({
        message: `WebMCP connected on ${detected.surface} — ${registered.length} tools registered.`,
        actor: SYSTEM_ACTOR,
        level: 'success',
      })
    }

    return { surface: detected.surface, toolNames: registered, dispose }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool registration failed.'
    store.setMcpState({
      status: 'error',
      surface: detected.surface,
      toolNames: [],
      error: message,
    })
    store.log({
      message: `WebMCP registration failed on ${detected.surface}: ${message}`,
      actor: SYSTEM_ACTOR,
      level: 'error',
    })
    return null
  }
}

export { SYNSPACE_TOOLS, TOOL_NAMES, AGENT_ACTOR }
export type { SynSpaceTool, ToolOutcome } from './tools'
export { detectHost } from './host'
export { executeTool, executeToolByName } from './execute'
export type { ToolOrigin, ExecutedTool } from './execute'
export { useWebMcp } from './useWebMcp'
