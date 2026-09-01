import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPersistedWorld,
  hasPersistedWorld,
  loadPersistedWorld,
  persistWorld,
} from '@/state/persistence'
import { createStarterScene } from '@/tools/sceneTemplates'
import type { World } from '@/types'

/**
 * Persistence has to be defensive: storage can be absent, full, or hold
 * something an older build wrote. None of that may stop the app from opening.
 */

function installStorage(): Map<string, string> {
  const store = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  return store
}

const KEY = 'synspace.world'

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('world persistence', () => {
  it('round-trips a world', () => {
    installStorage()
    const world = createStarterScene()
    persistWorld(world)

    expect(hasPersistedWorld()).toBe(true)
    const restored = loadPersistedWorld()
    expect(restored?.id).toBe(world.id)
    expect(restored?.objects).toHaveLength(world.objects.length)
    expect(restored?.zones.map((z) => z.id)).toEqual(world.zones.map((z) => z.id))
  })

  it('discards a copy written by an older schema', () => {
    const store = installStorage()
    store.set(KEY, JSON.stringify({ version: 0, savedAt: 1, world: createStarterScene() }))

    expect(loadPersistedWorld()).toBeNull()
    expect(store.has(KEY)).toBe(false)
  })

  it('discards anything that is not a world', () => {
    const store = installStorage()
    store.set(KEY, JSON.stringify({ version: 1, savedAt: 1, world: { id: 'x' } }))

    expect(loadPersistedWorld()).toBeNull()
    expect(store.has(KEY)).toBe(false)
  })

  it('discards unparseable data rather than throwing', () => {
    const store = installStorage()
    store.set(KEY, 'not json {{{')

    expect(() => loadPersistedWorld()).not.toThrow()
    expect(loadPersistedWorld()).toBeNull()
    expect(store.has(KEY)).toBe(false)
  })

  it('does nothing at all when storage is unavailable', () => {
    // No window at all — a server render, or a locked-down browser.
    expect(loadPersistedWorld()).toBeNull()
    expect(hasPersistedWorld()).toBe(false)
    expect(() => persistWorld(createStarterScene())).not.toThrow()
    expect(() => clearPersistedWorld()).not.toThrow()
  })

  it('survives a storage that throws on write', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError')
        },
        removeItem: () => {},
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    })
    expect(() => persistWorld(createStarterScene())).not.toThrow()
  })

  it('refuses to store an implausibly large world', () => {
    const store = installStorage()
    const huge: World = {
      ...createStarterScene(),
      metadata: {
        ...createStarterScene().metadata,
        description: 'x'.repeat(2_100_000),
      },
    }
    persistWorld(huge)
    expect(store.has(KEY)).toBe(false)
  })

  it('clears on request', () => {
    const store = installStorage()
    persistWorld(createStarterScene())
    expect(store.has(KEY)).toBe(true)
    clearPersistedWorld()
    expect(store.has(KEY)).toBe(false)
    expect(loadPersistedWorld()).toBeNull()
  })
})
