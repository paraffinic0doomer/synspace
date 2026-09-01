import { useEffect } from 'react'
import { connectWebMcp } from './index'
import { installDevHost } from './devHost'

/**
 * Mounts the WebMCP tool surface once for the application.
 *
 * Kept as a one-line hook so tool registration lives in the MCP layer rather
 * than being scattered through UI components — the shell just says "connect",
 * and knows nothing about the browser API or the tools themselves.
 */
export function useWebMcp(): void {
  useEffect(() => {
    let connection: ReturnType<typeof connectWebMcp> = null
    let disposed = false

    // In development a host can be requested with `?webmcp=1`; installing it is
    // async, so connect after it settles. In production this branch is compiled
    // out entirely and connection happens synchronously.
    if (import.meta.env.DEV) {
      void installDevHost().then(() => {
        if (disposed) return
        connection = connectWebMcp()
      })
    } else {
      connection = connectWebMcp()
    }

    return () => {
      disposed = true
      connection?.dispose()
    }
  }, [])
}
