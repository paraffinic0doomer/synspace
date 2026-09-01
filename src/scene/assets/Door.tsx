import { PALETTE, SURFACE } from '../materials'
import type { AssetProps } from './types'

/** Framed single-leaf doorway, drawn slightly ajar to read as an entry. */
export function Door({ color }: AssetProps) {
  return (
    <group>
      {/* Jambs */}
      {[-0.47, 0.47].map((x) => (
        <mesh key={x} position={[x, 1.05, 0]} castShadow>
          <boxGeometry args={[0.08, 2.1, 0.14]} />
          <meshStandardMaterial color={color} {...SURFACE.matte} />
        </mesh>
      ))}

      {/* Header */}
      <mesh position={[0, 2.06, 0]} castShadow>
        <boxGeometry args={[1.02, 0.1, 0.14]} />
        <meshStandardMaterial color={color} {...SURFACE.matte} />
      </mesh>

      {/* Threshold */}
      <mesh position={[0, 0.01, 0]} receiveShadow>
        <boxGeometry args={[1.02, 0.02, 0.16]} />
        <meshStandardMaterial color={PALETTE.metal} {...SURFACE.metallic} />
      </mesh>

      {/* Leaf, hinged open around the left jamb */}
      <group position={[-0.43, 0, 0]} rotation={[0, -0.55, 0]}>
        <mesh position={[0.42, 1.0, 0]} castShadow>
          <boxGeometry args={[0.84, 1.98, 0.05]} />
          <meshStandardMaterial color={PALETTE.trim} {...SURFACE.matte} />
        </mesh>
        {/* Vision panel */}
        <mesh position={[0.42, 1.42, 0.028]}>
          <boxGeometry args={[0.34, 0.7, 0.01]} />
          <meshStandardMaterial
            color={PALETTE.glass}
            transparent
            opacity={0.4}
            {...SURFACE.satin}
          />
        </mesh>
        {/* Lever handle */}
        <mesh position={[0.76, 1.03, 0.05]}>
          <boxGeometry args={[0.12, 0.03, 0.03]} />
          <meshStandardMaterial color={PALETTE.metal} {...SURFACE.metallic} />
        </mesh>
      </group>
    </group>
  )
}
