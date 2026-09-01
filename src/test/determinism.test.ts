import { describe, expect, it } from 'vitest'
import { WORLD_PRESETS, buildPresetWorld } from '@/tools'
import { createStarterScene } from '@/tools/sceneTemplates'

/**
 * The demo world must be reproducible.
 *
 * A judge watching a walkthrough should see the same room, the same object ids
 * and the same tool output every time — so nothing about a preset world may
 * depend on random generation.
 */
describe('deterministic demo worlds', () => {
  it('builds identical object ids on every load', () => {
    for (const preset of WORLD_PRESETS) {
      const a = buildPresetWorld(preset.id)
      const b = buildPresetWorld(preset.id)
      expect(a).not.toBeNull()
      expect(b).not.toBeNull()
      expect(b!.id).toBe(a!.id)
      expect(b!.objects.map((object) => object.id)).toEqual(
        a!.objects.map((object) => object.id),
      )
      expect(b!.objects.map((object) => object.position)).toEqual(
        a!.objects.map((object) => object.position),
      )
      expect(b!.zones.map((zone) => zone.id)).toEqual(a!.zones.map((zone) => zone.id))
    }
  })

  it('uses readable, stable ids rather than random suffixes', () => {
    const world = createStarterScene()
    const ids = world.objects.map((object) => object.id)
    expect(new Set(ids).size).toBe(ids.length)
    // A random suffix would look like `desk-9f3ac1`; these must not.
    expect(ids.every((id) => !/-[0-9a-f]{6}$/.test(id))).toBe(true)
    expect(ids).toContain('desk-manager')
    expect(ids).toContain('door-emergency-exit')
  })

  it('names the object the demo story is built around', () => {
    const world = createStarterScene()
    const manager = world.objects.find((object) => object.id === 'desk-manager')
    expect(manager?.label).toBe("Manager's Desk")
  })
})
