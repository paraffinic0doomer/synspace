import { useEffect } from 'react'
import { connectWebMcp } from './index'

/**
 * Mounts the WebMCP tool surface once for the application.
 *
 * Kept as a one-line hook so tool registration lives in the MCP layer rather
 * than being scattered through UI components — the shell just says "connect",
 * and knows nothing about the browser API or the tools themselves.
 */
export function useWebMcp(): void {
  useEffect(() => {
    const connection = connectWebMcp()
    return () => connection?.dispose()
  }, [])
}
