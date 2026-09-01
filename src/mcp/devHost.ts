/**
 * Opt-in WebMCP host for local testing.
 *
 * No browser ships WebMCP enabled today — Chrome 152 does not expose it even
 * with `--enable-features=WebMCP`, because the feature is not compiled in. So
 * there is otherwise no way to exercise the tool surface on a normal machine.
 *
 * This loads `@mcp-b/global`, the W3C WebMCP polyfill. It is a real
 * implementation of the specification, not a stand-in written here: SynSpace's
 * own detection and registration run against it completely unchanged. It is
 * still labelled `polyfill` everywhere it is reported, so nothing ever claims
 * the browser supports WebMCP natively.
 *
 * Three guards keep it out of the product:
 *  - it is a devDependency, imported dynamically;
 *  - the call site is behind `import.meta.env.DEV`, so a production build tree
 *    shakes the whole module away;
 *  - even in development it does nothing unless explicitly asked for.
 */

const FLAG = 'webmcp'
const STORAGE_KEY = 'synspace.webmcp.polyfill'

/** True when the developer asked for a host via `?webmcp=1` or a stored preference. */
export function wantsDevHost(): boolean {
  if (typeof window === 'undefined') return false

  try {
    const requested = new URLSearchParams(window.location.search).get(FLAG)
    if (requested !== null) {
      // `?webmcp=0` turns it off again and clears the preference.
      const on = requested !== '0' && requested !== 'false' && requested !== 'off'
      window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
      return on
    }
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Installs the polyfill if one is wanted and the browser has no host already.
 * Returns true when `document.modelContext` is available afterwards.
 */
export async function installDevHost(): Promise<boolean> {
  if (!wantsDevHost()) return false

  // Never displace a genuine implementation.
  if (typeof document !== 'undefined' && 'modelContext' in document) return true

  try {
    const { initializeWebModelContext } = await import('@mcp-b/global')
    initializeWebModelContext({ autoInitialize: true })
    return 'modelContext' in document
  } catch (error) {
    console.warn('[synspace] WebMCP polyfill failed to load', error)
    return false
  }
}
