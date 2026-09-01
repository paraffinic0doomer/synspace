import type { World } from '@/types'

/**
 * Local persistence for the world document.
 *
 * A refresh should not throw away what you built. Only the world is kept —
 * objects, zones, environment, rules and metadata. Undo history, scenarios and
 * proposals are session work and are deliberately not restored: reviving an
 * undo stack whose snapshots reference a page that no longer exists would be
 * worse than starting the stack clean.
 *
 * Everything here is defensive. Storage can be unavailable (a private window),
 * full, or hold something written by an older build — none of which should stop
 * the app from opening.
 */

const STORAGE_KEY = 'synspace.world'
/** Bumped when the world shape changes; a mismatch is discarded, not migrated. */
const SCHEMA_VERSION = 1
/** A world this large is a bug, not a floor plan. */
const MAX_BYTES = 2_000_000

interface StoredWorld {
  version: number
  savedAt: number
  world: World
}

const canUseStorage = (): boolean => {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage)
  } catch {
    return false
  }
}

/** Enough of a shape check to reject anything an older build wrote. */
function looksLikeWorld(value: unknown): value is World {
  if (!value || typeof value !== 'object') return false
  const world = value as Partial<World>
  return (
    typeof world.id === 'string' &&
    typeof world.name === 'string' &&
    Array.isArray(world.objects) &&
    Array.isArray(world.zones) &&
    Array.isArray(world.constraints) &&
    Boolean(world.environment?.room) &&
    typeof world.metadata?.revision === 'number'
  )
}

export function loadPersistedWorld(): World | null {
  if (!canUseStorage()) return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as StoredWorld
    if (parsed?.version !== SCHEMA_VERSION) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    if (!looksLikeWorld(parsed.world)) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed.world
  } catch {
    // Corrupt or unreadable: drop it rather than failing to boot.
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* nothing more to do */
    }
    return null
  }
}

export function persistWorld(world: World): void {
  if (!canUseStorage()) return

  try {
    const payload: StoredWorld = { version: SCHEMA_VERSION, savedAt: Date.now(), world }
    const serialised = JSON.stringify(payload)
    if (serialised.length > MAX_BYTES) return
    window.localStorage.setItem(STORAGE_KEY, serialised)
  } catch {
    // Quota exceeded or storage disabled — the app carries on unsaved.
  }
}

export function clearPersistedWorld(): void {
  if (!canUseStorage()) return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing more to do */
  }
}

/** Was this session's world restored from a previous one? */
export function hasPersistedWorld(): boolean {
  if (!canUseStorage()) return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}

/**
 * Saves the world whenever it changes.
 *
 * Writes are debounced: a gizmo drag commits a new document on every frame, and
 * serialising the whole world at 60 Hz would be wasteful for a value only read
 * on the next page load.
 */
export function watchWorld(
  subscribe: (listener: (world: World) => void) => () => void,
): () => void {
  if (!canUseStorage()) return () => {}

  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: World | null = null

  const flush = () => {
    timer = null
    if (pending) persistWorld(pending)
    pending = null
  }

  const unsubscribe = subscribe((world) => {
    pending = world
    if (timer === null) timer = setTimeout(flush, 400)
  })

  // A tab closing mid-debounce should still save.
  const onHide = () => {
    if (timer !== null) {
      clearTimeout(timer)
      flush()
    }
  }
  window.addEventListener('pagehide', onHide)

  return () => {
    unsubscribe()
    window.removeEventListener('pagehide', onHide)
    onHide()
  }
}
