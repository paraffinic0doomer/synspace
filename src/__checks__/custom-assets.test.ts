import { beforeEach, describe, expect, it } from 'vitest'
import {
  BUILTIN_ASSET_TYPES,
  allAssetTypes,
  buildCustomAsset,
  getAssetDefinition,
  partsBounds,
  syncCustomAssets,
} from '@/tools'
import { createSceneObject } from '@/tools/assetCatalog'
import { footprintOf } from '@/spatial/geometry'
import { SYNSPACE_TOOLS } from '@/mcp/tools'
import type { AssetPart } from '@/types'

/**
 * A new kind of asset should be data an agent writes, not code we ship.
 *
 * The point of these is that a runtime-defined kind is not a second-class
 * citizen: it is measured, placed and constrained through exactly the same path
 * as a built-in one.
 */

const treeParts: AssetPart[] = [
  { shape: 'cylinder', size: [0.36, 2.4, 0.36], position: [0, 1.2, 0], color: '#6b4f3a' },
  { shape: 'sphere', size: [2.8, 2.8, 2.8], position: [0, 3.2, 0], color: '#3f7f4f' },
]

const tree = buildCustomAsset(
  { type: 'tree', name: 'Oak Tree', category: 'Ambience', parts: treeParts },
  BUILTIN_ASSET_TYPES,
)

beforeEach(() => {
  syncCustomAssets({ assetLibrary: 'definition' in tree ? [tree.definition] : [] })
})

describe('defining an asset from primitives', () => {
  it('accepts a well-formed description', () => {
    expect('definition' in tree).toBe(true)
  })

  it('measures the footprint from the parts rather than trusting a declaration', () => {
    // The canopy is the widest part and sets the footprint; the top of it sets
    // the height. Nothing here was declared — it is all derived.
    expect(partsBounds(treeParts)).toEqual({ width: 2.8, height: 4.6, depth: 2.8 })
  })

  it('refuses to shadow a built-in kind', () => {
    const clash = buildCustomAsset(
      { type: 'desk', name: 'Not a desk', category: 'Workstations', parts: treeParts },
      BUILTIN_ASSET_TYPES,
    )
    expect('error' in clash && clash.error).toMatch(/built-in/i)
  })

  it('rejects malformed parts by name, so an agent can fix them', () => {
    const bad = buildCustomAsset(
      {
        type: 'broken',
        name: 'Broken',
        category: 'Structure',
        parts: [{ shape: 'blob', size: [1, 1, 1], position: [0, 0, 0] }],
      },
      BUILTIN_ASSET_TYPES,
    )
    expect('error' in bad && bad.error).toMatch(/parts\[0\]\.shape/)
  })

  it('rejects a type name that is not kebab-case', () => {
    const bad = buildCustomAsset(
      { type: 'Bus Shelter', name: 'Bus Shelter', category: 'Structure', parts: treeParts },
      BUILTIN_ASSET_TYPES,
    )
    expect('error' in bad && bad.error).toMatch(/kebab-case/)
  })
})

describe('a defined kind behaves like a built-in one', () => {
  it('resolves through the ordinary catalogue lookup', () => {
    expect(allAssetTypes()).toContain('tree')
    expect(getAssetDefinition('tree').name).toBe('Oak Tree')
  })

  it('can be placed, and carries its measured size onto the object', () => {
    const object = createSceneObject('tree', { position: [2, 0, 3] })
    expect(object.type).toBe('tree')
    expect(object.dimensions).toEqual({ width: 2.8, height: 4.6, depth: 2.8 })
  })

  it('occupies real floor area, so collision checks can see it', () => {
    const footprint = footprintOf(createSceneObject('tree', { position: [0, 0, 0] }))
    expect(footprint.halfWidth * 2).toBeCloseTo(2.8, 3)
    expect(footprint.halfDepth * 2).toBeCloseTo(2.8, 3)
  })

  it('scales like any other object', () => {
    const object = createSceneObject('tree', { position: [0, 0, 0], scale: [2, 2, 2] })
    expect(footprintOf(object).halfWidth * 2).toBeCloseTo(5.6, 3)
  })

  it('falls back to a visible placeholder when its definition is missing', () => {
    // A world can reference a kind whose definition did not come with it.
    syncCustomAssets({ assetLibrary: [] })
    const definition = getAssetDefinition('tree')
    expect(definition.name).toMatch(/unknown/i)
    expect(definition.dimensions).toEqual({ width: 1, height: 1, depth: 1 })
  })
})

describe('the tools an agent uses to grow the catalogue', () => {
  const byName = (name: string) => SYNSPACE_TOOLS.find((tool) => tool.name === name)

  it('exposes define, list and remove', () => {
    expect(byName('define_asset')).toBeDefined()
    expect(byName('list_asset_types')).toBeDefined()
    expect(byName('remove_asset_type')).toBeDefined()
  })

  it('tells the agent to define a kind rather than approximate with the wrong one', () => {
    expect(byName('define_asset')!.description).toMatch(/without any code change/i)
    expect(byName('list_asset_types')!.description).toMatch(/defined with define_asset/i)
  })

  it('does not freeze the asset list into a schema enum', () => {
    // An enum captured at registration would reject every kind defined later.
    const spawn = byName('spawn_3d_asset')!
    const modelType = (spawn.inputSchema.properties as Record<string, { enum?: unknown }>).model_type
    expect(modelType.enum).toBeUndefined()
    expect(JSON.stringify(spawn.inputSchema)).toMatch(/define_asset/)
  })
})
