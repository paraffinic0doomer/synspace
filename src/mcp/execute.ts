import { useSceneStore } from '@/state'
import { SYNSPACE_TOOLS, type SynSpaceTool, type ToolOutcome } from './tools'

/**
 * The single path every tool invocation takes.
 *
 * Both the WebMCP host adapter and the guided walkthrough run tools through
 * here, so the activity timeline is always driven by real execution — there is
 * no code path that writes a tool record without a handler having actually run.
 *
 * `origin` is the one thing that differs, and it is recorded honestly: an agent
 * connected over WebMCP chose its own arguments, while the walkthrough replays
 * scripted ones with no model in the loop.
 */

export type ToolOrigin = 'agent' | 'walkthrough'

const ORIGIN_ACTOR: Record<ToolOrigin, string> = {
  agent: 'Agent',
  walkthrough: 'Demo script',
}

export interface ExecutedTool {
  tool: string
  outcome: ToolOutcome
  durationMs: number
}

export function executeTool(
  tool: SynSpaceTool,
  args: unknown,
  origin: ToolOrigin,
): ExecutedTool {
  const startedAt = performance.now()
  let outcome: ToolOutcome

  try {
    outcome = tool.run(args)
  } catch (error) {
    // A thrown handler must never reach the caller or corrupt the world.
    outcome = {
      ok: false,
      error: error instanceof Error ? error.message : 'Unexpected tool failure.',
    }
  }

  const durationMs = Math.round(performance.now() - startedAt)
  const payload = outcome.ok ? outcome.data : { error: outcome.error }

  useSceneStore.getState().recordToolCall(
    {
      tool: tool.name,
      input: args ?? {},
      result: payload,
      success: outcome.ok,
      durationMs,
    },
    ORIGIN_ACTOR[origin],
  )

  return { tool: tool.name, outcome, durationMs }
}

/** Runs a registered tool by name. Returns a structured error for unknown names. */
export function executeToolByName(
  name: string,
  args: unknown,
  origin: ToolOrigin,
): ExecutedTool {
  const tool = SYNSPACE_TOOLS.find((candidate) => candidate.name === name)
  if (!tool) {
    return {
      tool: name,
      outcome: { ok: false, error: `No tool named "${name}".` },
      durationMs: 0,
    }
  }
  return executeTool(tool, args, origin)
}
