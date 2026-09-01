import { PALETTE, SURFACE } from '../materials'
import type { AssetProps } from './types'

/**
 * A length of roadway.
 *
 * A surface rather than an obstacle: it lies flat, casts no shadow, and the
 * occupancy grid ignores it so routes run along it instead of around it.
 */
export function Road({ color }: AssetProps) {
  const dashes = [-4.5, -2.7, -0.9, 0.9, 2.7, 4.5]

  return (
    <group>
      {/* Carriageway */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[4, 12]} />
        <meshStandardMaterial color={color} roughness={0.95} metalness={0.02} />
      </mesh>

      {/* Centre line */}
      {dashes.map((z) => (
        <mesh key={z} position={[0, 0.016, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.14, 1.0]} />
          <meshStandardMaterial color={PALETTE.trim} {...SURFACE.matte} />
        </mesh>
      ))}

      {/* Kerbs */}
      {[-1.98, 1.98].map((x) => (
        <mesh key={x} position={[x, 0.05, 0]}>
          <boxGeometry args={[0.14, 0.08, 12]} />
          <meshStandardMaterial color={PALETTE.trim} {...SURFACE.matte} />
        </mesh>
      ))}
    </group>
  )
}
