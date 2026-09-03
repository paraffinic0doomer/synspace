import { describe, expect, it } from 'vitest'
import {
  WORLD_FILE_FORMAT,
  WORLD_FILE_VERSION,
  parseWorldFile,
  serializeWorld,
  worldFileName,
} from '@/tools'
import { buildLayout, getLayout } from '@/tools'
import { createEmptyWorld } from '@/tools/sceneTemplates'
import { buildCustomAsset, BUILTIN_ASSET_TYPES } from '@/tools'
import type { World } from '@/types'

/**
 * A world file is untrusted input.
 *
 * Unlike `localStorage`, which round-trips data this app wrote seconds ago, a
 * file arrives from another machine, another build or a hand edit. These cover
 * the refusals, because a world that half-loads is worse than one that does not
 * load at all: the missing half resurfaces later as a constraint report that
 * makes no sense.
 */

const city = getLayout('city')!
const built = buildLayout('city', city.room!)!
const world: World = {
  ...createEmptyWorld(),
  name: 'City District',
  objects: built.objects,
  zones: built.zones,
  environment: { ...createEmptyWorld().environment, room: city.room! },
}

/** Round-trips a world through the file format and hands back the parse. */
const roundTrip = (input: World) => parseWorldFile(serializeWorld(input))

/** Serialises, then mutates the payload, to build a deliberately broken file. */
function corrupt(mutate: (payload: Record<string, any>) => void): string {
  const payload = JSON.parse(serializeWorld(world))
  mutate(payload)
  return JSON.stringify(payload)
}

describe('a world survives the round trip', () => {
  it('comes back with every object, zone and dimension intact', () => {
    const result = roundTrip(world)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.world.name).toBe('City District')
    expect(result.world.objects).toHaveLength(world.objects.length)
    expect(result.world.zones).toHaveLength(world.zones.length)
    expect(result.world.environment.room).toEqual({ width: 120, depth: 80, wallHeight: 24 })
    expect(result.world.objects[0].position).toEqual(world.objects[0].position)
  })

  it('carries the runtime asset library with the world', () => {
    // This is the reason export is worth more than it used to be: a world file
    // takes the kinds an agent invented for it, not just the objects.
    const tree = buildCustomAsset(
      {
        type: 'tree',
        name: 'Oak Tree',
        category: 'Ambience',
        parts: [{ shape: 'sphere', size: [3, 3, 3], position: [0, 2, 0] }],
      },
      BUILTIN_ASSET_TYPES,
    )
    expect('definition' in tree).toBe(true)
    if (!('definition' in tree)) return

    const result = roundTrip({ ...world, assetLibrary: [tree.definition] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.world.assetLibrary?.[0].type).toBe('tree')
    expect(result.world.assetLibrary?.[0].parts).toHaveLength(1)
  })

  it('names the file after the world and the date', () => {
    expect(worldFileName(world)).toMatch(/^city-district-\d{4}-\d{2}-\d{2}\.synspace\.json$/)
  })

  it('falls back to a usable name when the world name has nothing to slug', () => {
    expect(worldFileName({ ...world, name: '···' })).toMatch(/^world-/)
  })

  it('writes a self-describing envelope', () => {
    const payload = JSON.parse(serializeWorld(world))
    expect(payload.format).toBe(WORLD_FILE_FORMAT)
    expect(payload.version).toBe(WORLD_FILE_VERSION)
    expect(typeof payload.exportedAt).toBe('string')
  })
})

describe('it refuses what it cannot load', () => {
  it('rejects text that is not JSON', () => {
    const result = parseWorldFile('<html>nope</html>')
    expect(result).toEqual({ ok: false, error: 'That file is not valid JSON.' })
  })

  it('rejects JSON that is not a SynSpace file', () => {
    const result = parseWorldFile(JSON.stringify({ hello: 'world' }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/not a SynSpace world file/i)
  })

  it('refuses a future format version rather than half-loading it', () => {
    const result = parseWorldFile(corrupt((p) => { p.version = 99 }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/version 99.*reads version 1/)
  })

  it('rejects a room outside the supported range', () => {
    const result = parseWorldFile(corrupt((p) => { p.world.environment.room.width = 5000 }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/room\.width must be between/)
  })

  it('names the exact object that is malformed', () => {
    const result = parseWorldFile(corrupt((p) => { p.world.objects[3].position = [1, 'x', 3] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('objects[3].position must be three finite numbers.')
  })

  it('rejects NaN and Infinity, which JSON smuggles in as null', () => {
    const result = parseWorldFile(corrupt((p) => { p.world.objects[0].scale = [1, null, 1] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/objects\[0\]\.scale/)
  })

  it('rejects duplicate object ids, which would make every lookup ambiguous', () => {
    const result = parseWorldFile(
      corrupt((p) => { p.world.objects[2].id = p.world.objects[1].id }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/Duplicate object id/)
  })

  it('rejects a zone with unusable bounds', () => {
    const result = parseWorldFile(corrupt((p) => { delete p.world.zones[0].bounds.maxZ }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/zones\[0\]\.bounds/)
  })

  it('rejects a missing metadata revision, which staleness detection depends on', () => {
    const result = parseWorldFile(corrupt((p) => { delete p.world.metadata.revision }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/metadata\.revision/)
  })

  it('rejects a file too large to be a floor plan', () => {
    const result = parseWorldFile('x'.repeat(8_000_001))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/limit is 8 MB/)
  })
})
