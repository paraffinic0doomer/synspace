import { PALETTE, SURFACE } from '../materials'
import type { AssetProps } from './types'

/** Small round two-seat table — cafes, breakout corners, waiting areas. */
export function CafeTable({ color }: AssetProps) {
  return (
    <group>
      {/* Top */}
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.4, 0.4, 0.05, 16]} />
        <meshStandardMaterial color={color} {...SURFACE.matte} />
      </mesh>
      <mesh position={[0, 0.685, 0]}>
        <cylinderGeometry args={[0.38, 0.36, 0.03, 16]} />
        <meshStandardMaterial color={PALETTE.woodDark} {...SURFACE.matte} />
      </mesh>

      {/* Pedestal */}
      <mesh position={[0, 0.36, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 0.66, 10]} />
        <meshStandardMaterial color={PALETTE.metal} {...SURFACE.metallic} />
      </mesh>

      {/* Cross base */}
      {[0, Math.PI / 2].map((angle) => (
        <mesh key={angle} position={[0, 0.03, 0]} rotation={[0, angle, 0]} castShadow>
          <boxGeometry args={[0.62, 0.05, 0.08]} />
          <meshStandardMaterial color={PALETTE.darkMetal} {...SURFACE.satin} />
        </mesh>
      ))}
    </group>
  )
}
