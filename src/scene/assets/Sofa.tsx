import { PALETTE, SURFACE } from '../materials'
import type { AssetProps } from './types'

/** Three-seat breakout sofa. */
export function Sofa({ color }: AssetProps) {
  return (
    <group>
      {/* Seat base */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.1, 0.3, 0.92]} />
        <meshStandardMaterial color={color} {...SURFACE.soft} />
      </mesh>

      {/* Cushions */}
      {[-0.65, 0, 0.65].map((x) => (
        <mesh key={x} position={[x, 0.5, 0.04]} castShadow>
          <boxGeometry args={[0.62, 0.13, 0.78]} />
          <meshStandardMaterial color={color} {...SURFACE.soft} />
        </mesh>
      ))}

      {/* Backrest */}
      <mesh position={[0, 0.6, -0.36]} rotation={[0.08, 0, 0]} castShadow>
        <boxGeometry args={[2.1, 0.52, 0.2]} />
        <meshStandardMaterial color={color} {...SURFACE.soft} />
      </mesh>

      {/* Arms */}
      {[-0.98, 0.98].map((x) => (
        <mesh key={x} position={[x, 0.53, 0]} castShadow>
          <boxGeometry args={[0.16, 0.26, 0.92]} />
          <meshStandardMaterial color={color} {...SURFACE.soft} />
        </mesh>
      ))}

      {/* Feet */}
      {[
        [-0.9, 0.36],
        [0.9, 0.36],
        [-0.9, -0.36],
        [0.9, -0.36],
      ].map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, 0.08, z]}>
          <cylinderGeometry args={[0.04, 0.03, 0.16, 8]} />
          <meshStandardMaterial color={PALETTE.woodDark} {...SURFACE.matte} />
        </mesh>
      ))}
    </group>
  )
}
