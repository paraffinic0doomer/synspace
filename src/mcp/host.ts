/**
 * WebMCP host detection.
 *
 * The browser supplies the host; SynSpace never ships one. If nothing is found
 * the app runs exactly as before — every tool here is additive, and no UI path
 * depends on WebMCP being present.
 *
 * The specified surface is `document.modelContext.registerTool`. The other
 * globals are checked because the proposal has moved between them during
 * standardisation, and a host that exposes only `provideContext` is handled too.
 */

/** A tool as the host expects it — MCP's tool shape. */
export interface HostTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (args: unknown) => Promise<HostToolResponse>
}

/** MCP-style response envelope. */
export interface HostToolResponse {
  content: { type: 'text'; text: string }[]
  structuredContent?: unknown
  isError?: boolean
}

interface ModelContextLike {
  registerTool?: (tool: HostTool) => unknown
  unregisterTool?: (name: string) => unknown
  provideContext?: (context: { tools: HostTool[] }) => unknown
}

export interface DetectedHost {
  host: ModelContextLike
  /** Where it was found, for the status readout. */
  surface: string
}

const CANDIDATES: { surface: string; get: () => unknown }[] = [
  { surface: 'document.modelContext', get: () => (globalThis as never as { document?: Record<string, unknown> }).document?.modelContext },
  { surface: 'navigator.modelContext', get: () => (globalThis as never as { navigator?: Record<string, unknown> }).navigator?.modelContext },
  { surface: 'window.modelContext', get: () => (globalThis as Record<string, unknown>).modelContext },
]

const isUsable = (value: unknown): value is ModelContextLike => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as ModelContextLike
  return typeof candidate.registerTool === 'function' || typeof candidate.provideContext === 'function'
}

/** Returns the first usable WebMCP host, or null when the browser has none. */
export function detectHost(): DetectedHost | null {
  for (const candidate of CANDIDATES) {
    let value: unknown
    try {
      value = candidate.get()
    } catch {
      continue // A cross-origin or throwing getter is simply not our host.
    }
    if (isUsable(value)) return { host: value, surface: candidate.surface }
  }
  return null
}

export interface RegistrationOutcome {
  registered: string[]
  /** Call to remove the tools again; a no-op when the host cannot unregister. */
  dispose: () => void
}

/**
 * Registers tools on a detected host.
 *
 * Prefers per-tool `registerTool`; falls back to `provideContext`, which
 * replaces the whole tool set at once.
 */
export function registerTools(detected: DetectedHost, tools: HostTool[]): RegistrationOutcome {
  const { host } = detected

  if (typeof host.registerTool === 'function') {
    const registered: string[] = []
    for (const tool of tools) {
      host.registerTool(tool)
      registered.push(tool.name)
    }

    return {
      registered,
      dispose: () => {
        if (typeof host.unregisterTool !== 'function') return
        for (const name of registered) {
          try {
            host.unregisterTool(name)
          } catch {
            // A host that refuses to unregister is not worth failing teardown over.
          }
        }
      },
    }
  }

  host.provideContext?.({ tools })
  return {
    registered: tools.map((tool) => tool.name),
    dispose: () => host.provideContext?.({ tools: [] }),
  }
}
