import { SURFACE } from '../materials'
import { labelTexture } from '../labelTexture'
import type { AssetPart, CustomAssetDefinition } from '@/types'
import type { AssetProps } from './types'

interface CompositeAssetProps extends AssetProps {
  definition: CustomAssetDefinition
}

/**
 * Renders an asset that was described as data rather than written as a component.
 *
 * Every hand-built asset in this folder is a group of positioned solids with a
 * colour and a finish, so that is exactly what this draws. It is the whole
 * reason the catalogue can grow without a rebuild: a new kind of object is a
 * list of parts, not a new file.
 */
export function CompositeAsset({ color, label, definition }: CompositeAssetProps) {
  const sign =
    definition.signageHeight !== undefined && label ? labelTexture(label, '#e6ecf7') : null

  return (
    <group>
      {definition.parts.map((part, index) => (
        <Part key={index} part={part} fallbackColor={color} />
      ))}

      {sign && (
        <group position={[0, definition.signageHeight!, definition.dimensions.depth / 2 + 0.03]}>
          <mesh>
            <planeGeometry args={[definition.dimensions.width * 0.8, 0.5]} />
            <meshStandardMaterial color="#0b0e15" {...SURFACE.matte} />
          </mesh>
          <mesh position={[0, 0, 0.01]}>
            <planeGeometry args={[definition.dimensions.width * 0.74, 0.42]} />
            <meshBasicMaterial map={sign} transparent toneMapped={false} />
          </mesh>
        </group>
      )}
    </group>
  )
}

function Part({ part, fallbackColor }: { part: AssetPart; fallbackColor: string }) {
  const [width, height, depth] = part.size
  const finish = SURFACE[part.finish ?? 'matte']

  // Round shapes are built on the X radius and squashed along Z, so a part
  // whose width and depth differ still fills exactly the box it declared —
  // which is what the derived footprint was measured from.
  const radial = part.shape !== 'box'
  const squash: [number, number, number] = radial ? [1, 1, depth / width] : [1, 1, 1]

  return (
    <mesh
      position={part.position}
      rotation={part.rotation ?? [0, 0, 0]}
      scale={squash}
      castShadow
      receiveShadow
    >
      {part.shape === 'box' && <boxGeometry args={[width, height, depth]} />}
      {part.shape === 'cylinder' && <cylinderGeometry args={[width / 2, width / 2, height, 20]} />}
      {part.shape === 'cone' && <coneGeometry args={[width / 2, height, 20]} />}
      {part.shape === 'sphere' && <sphereGeometry args={[width / 2, 20, 14]} />}
      <meshStandardMaterial color={part.color ?? fallbackColor} {...finish} />
    </mesh>
  )
}
