import { CanvasTexture, LinearFilter, SRGBColorSpace, type Texture } from 'three'

/**
 * Text drawn to a canvas and used as a texture.
 *
 * Signage has to be readable at building scale, and a floating HTML pill is not
 * that — it does not sit on the wall and it disappears at a distance. Drawing
 * to a canvas keeps the app free of any font download, which matters because
 * everything else here works offline too.
 */

const cache = new Map<string, Texture>()
const WIDTH = 512
const HEIGHT = 128

export function labelTexture(text: string, color = '#0b0e15'): Texture | null {
  const label = text.trim().slice(0, 28).toUpperCase()
  if (label.length === 0) return null

  const key = label + '|' + color
  const cached = cache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const context = canvas.getContext('2d')
  if (!context) return null

  context.clearRect(0, 0, WIDTH, HEIGHT)
  context.fillStyle = color
  // Shrink to fit rather than clipping: a long name must still read.
  let size = 76
  do {
    context.font = `600 ${size}px ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif`
    size -= 4
  } while (context.measureText(label).width > WIDTH - 32 && size > 20)

  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(label, WIDTH / 2, HEIGHT / 2)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true

  // Bounded so a long session cannot grow this without limit.
  if (cache.size > 120) {
    const oldest = cache.keys().next().value
    if (oldest) {
      cache.get(oldest)?.dispose()
      cache.delete(oldest)
    }
  }
  cache.set(key, texture)
  return texture
}
