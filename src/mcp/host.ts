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

/** Options the standard API accepts alongside a tool. */
interface RegisterToolOptions {
  /** Aborting this signal is how the standard API unregisters a tool. */
  signal?: AbortSignal
  exposedTo?: string[]
}

interface ModelContextLike {
  registerTool?: (tool: HostTool, options?: RegisterToolOptions) => unknown
  /** Not part of the standard interface; some runtimes still provide it. */
  unregisterTool?: (name: string) => unknown
  /** Older proposal shape, kept for hosts that only offer it. */
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

/**
 * True when the host came from the locally installed polyfill rather than the
 * browser itself. Reported so the UI never implies native support.
 */
const isPolyfilled = (): boolean => {
  try {
    return (
      typeof window !== 'undefined' &&
      window.localStorage.getItem('synspace.webmcp.polyfill') === '1'
    )
  } catch {
    return false
  }
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
    if (isUsable(value)) {
      return {
        host: value,
        surface: isPolyfilled() ? `${candidate.surface} (polyfill)` : candidate.surface,
      }
    }
  }
  return null
}

export interface RegistrationOutcome {
  registered: string[]
  /** Removes the tools again. */
  dispose: () => void
}

export interface RegisterOptions {
  /** Reports a registration that failed after the synchronous call returned. */
  onError?: (error: string) => void
}

/**
 * Registers tools on a detected host.
 *
 * Prefers per-tool `registerTool`; falls back to `provideContext`, which
 * replaces the whole tool set at once.
 */
export function registerTools(
  detected: DetectedHost,
  tools: HostTool[],
  options: RegisterOptions = {},
): RegistrationOutcome {
  const { host } = detected

  if (typeof host.registerTool === 'function') {
    // The standard API unregisters by aborting the signal the tool was
    // registered with — there is no `unregisterTool` on `ModelContext`. One
    // controller covers the whole set, so teardown is a single abort.
    const controller = new AbortController()
    const registered: string[] = []

    for (const tool of tools) {
      // `registerTool` resolves asynchronously; a rejection must not be
      // swallowed, or a failed registration would look like a success.
      const result = host.registerTool(tool, { signal: controller.signal }) as
        | Promise<void>
        | undefined
      if (result && typeof result.then === 'function') {
        result.catch((error: unknown) => {
          if (controller.signal.aborted) return // teardown, not a failure
          options.onError?.(
            `${tool.name}: ${error instanceof Error ? error.message : String(error)}`,
          )
        })
      }
      registered.push(tool.name)
    }

    return {
      registered,
      dispose: () => {
        controller.abort()
        // Some runtimes predate the signal contract and expose an explicit
        // removal instead; calling both is harmless.
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
