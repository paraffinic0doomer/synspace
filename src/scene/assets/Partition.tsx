import { PALETTE, SURFACE } from '../materials'
import type { AssetProps } from './types'

/** Free-standing acoustic divider. */
export function Partition({ color }: AssetProps) {
  return (
    <group>
      {/* Acoustic panel */}
      <mesh position={[0, 0.8, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.56, 1.3, 0.06]} />
        <meshStandardMaterial color={color} {...SURFACE.soft} />
      </mesh>

      {/* Frame rails */}
      {[0.16, 1.46].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[1.6, 0.06, 0.09]} />
          <meshStandardMaterial color={PALETTE.metal} {...SURFACE.metallic} />
        </mesh>
      ))}

      {/* Uprights */}
      {[-0.78, 0.78].map((x) => (
        <mesh key={x} position={[x, 0.8, 0]} castShadow>
          <boxGeometry args={[0.05, 1.36, 0.09]} />
          <meshStandardMaterial color={PALETTE.metal} {...SURFACE.metallic} />
        </mesh>
      ))}

      {/* Feet */}
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} position={[x, 0.03, 0]} castShadow>
          <boxGeometry args={[0.1, 0.06, 0.46]} />
          <meshStandardMaterial color={PALETTE.darkMetal} {...SURFACE.satin} />
        </mesh>
      ))}
    </group>
  )
}
