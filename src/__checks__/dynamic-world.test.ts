import { describe, expect, it } from 'vitest'
import { buildLayout, getLayout, LAYOUTS, scaleForSize, sizeOf, getAssetDefinition } from '@/tools'
import { cellSizeFor } from '@/spatial/occupancy'
import { boundaryViolations, footprintsOverlap } from '@/spatial'
import { createEmptyWorld } from '@/tools/sceneTemplates'
import { SYNSPACE_TOOLS } from '@/mcp/tools'
import type { SceneObject } from '@/types'

/**
 * The world has to be able to become a city or a classroom.
 *
 * These cover the four things that made "build a city" fail: the room was
 * fixed, no city layout existed, the asset kit had no way to change size, and
 * the occupancy grid could not have taken a city-sized room.
 */

const cityLayout = getLayout('city')!
const built = buildLayout('city', cityLayout.room!)!

const world = {
  ...createEmptyWorld(),
  objects: built.objects,
  zones: built.zones,
  environment: {
    ...createEmptyWorld().environment,
    room: cityLayout.room!,
  },
}

describe('the room adapts to what is being built', () => {
  it('lets a layout state its own footprint', () => {
    expect(cityLayout.room).toEqual({ width: 120, depth: 80, wallHeight: 24 })
    // A layout that works anywhere still says nothing, and keeps the room.
    expect(getLayout('classroom')!.room).toBeUndefined()
  })

  it('exposes room resizing to agents, with the range a city needs', () => {
    const resize = SYNSPACE_TOOLS.find((tool) => tool.name === 'resize_world')
    expect(resize).toBeDefined()
    expect(resize!.description).toMatch(/city district/i)
    expect(resize!.description).toMatch(/4–240/)
  })

  it('keeps the occupancy grid affordable at city scale', () => {
    const classroom = cellSizeFor({ width: 10, depth: 8 })
    const city = cellSizeFor(cityLayout.room!)
    expect(classroom).toBe(0.25) // fine detail where the room is small
    expect(city).toBeGreaterThan(0.25) // coarser where it would otherwise explode
    const cells = (120 / city) * (80 / city)
    expect(cells).toBeLessThan(60_000)
  })
})

describe('the city layout', () => {
  it('builds a district with streets, blocks and a hospital', () => {
    const types = built.objects.map((object) => object.type)
    expect(types.filter((t) => t === 'road').length).toBeGreaterThanOrEqual(10)
    expect(types.filter((t) => t === 'building').length).toBeGreaterThanOrEqual(8)
    expect(types).toContain('hospital')
    expect(types).toContain('vehicle')
    expect(types.filter((t) => t === 'door').length).toBe(2)
  })

  it('fits inside the room it asks for', () => {
    expect(boundaryViolations(world)).toEqual([])
  })

  it('does not stack buildings on top of each other', () => {
    const solid = built.objects.filter(
      (object): object is SceneObject => object.type === 'building' || object.type === 'hospital',
    )
    const collisions: string[] = []
    for (let i = 0; i < solid.length; i += 1) {
      for (let j = i + 1; j < solid.length; j += 1) {
        if (footprintsOverlap(solid[i], solid[j])) {
          collisions.push(`${solid[i].id} / ${solid[j].id}`)
        }
      }
    }
    expect(collisions).toEqual([])
  })

  it('labels every building so the signage reads as a place', () => {
    const named = built.objects.filter(
      (object) => object.type === 'building' || object.type === 'hospital',
    )
    expect(named.length).toBeGreaterThan(0)
    expect(named.every((object) => object.label.trim().length > 0)).toBe(true)
    expect(named.some((object) => /hospital/i.test(object.label))).toBe(true)
  })

  it('is offered to agents alongside the indoor layouts', () => {
    expect(LAYOUTS.map((layout) => layout.id)).toContain('city')
    expect(cityLayout.matches).toContain('city')
  })
})

describe('a fixed asset kit that still covers any scenario', () => {
  it('scales an instance to a requested real-world size', () => {
    const base = getAssetDefinition('building').dimensions
    const scale = scaleForSize('building', { width: 12, height: 40, depth: 12 })
    expect(scale[0]).toBeCloseTo(12 / base.width, 3)
    expect(scale[1]).toBeCloseTo(40 / base.height, 3)
  })

  it('leaves axes alone when they are not given', () => {
    const scale = scaleForSize('building', { height: 30 }, [2, 1, 3])
    expect(scale[0]).toBe(2)
    expect(scale[2]).toBe(3)
  })

  it('reports the scaled size, not the catalogue size', () => {
    const base = getAssetDefinition('building').dimensions
    const object = { dimensions: base, scale: scaleForSize('building', { height: 40 }) }
    expect(sizeOf(object).height).toBeCloseTo(40, 2)
    expect(sizeOf(object).width).toBeCloseTo(base.width, 2)
  })

  it('gives agents both spawn-time sizing and a resize tool', () => {
    const spawn = SYNSPACE_TOOLS.find((tool) => tool.name === 'spawn_3d_asset')!
    const properties = spawn.inputSchema.properties as Record<string, unknown>
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining(['width_m', 'height_m', 'depth_m']),
    )

    const resize = SYNSPACE_TOOLS.find((tool) => tool.name === 'resize_3d_asset')
    expect(resize).toBeDefined()
    expect(resize!.description).toMatch(/tower block|warehouse/i)
  })
})
