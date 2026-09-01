import { PALETTE, SURFACE } from '../materials'
import type { AssetProps } from './types'

/** Service or reception counter — retail, cafes, front desks. */
export function Counter({ color }: AssetProps) {
  return (
    <group>
      {/* Body */}
      <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 1.0, 0.62]} />
        <meshStandardMaterial color={color} {...SURFACE.matte} />
      </mesh>

      {/* Overhanging worktop */}
      <mesh position={[0, 1.05, 0.02]} castShadow>
        <boxGeometry args={[2.5, 0.07, 0.72]} />
        <meshStandardMaterial color={PALETTE.trim} {...SURFACE.satin} />
      </mesh>

      {/* Kick plate */}
      <mesh position={[0, 0.05, 0.02]}>
        <boxGeometry args={[2.36, 0.1, 0.58]} />
        <meshStandardMaterial color={PALETTE.darkMetal} {...SURFACE.satin} />
      </mesh>

      {/* Front panel detail */}
      <mesh position={[0, 0.58, 0.315]}>
        <boxGeometry args={[2.16, 0.62, 0.02]} />
        <meshStandardMaterial color={PALETTE.woodDark} {...SURFACE.matte} />
      </mesh>

      {/* Terminal on top, so it reads as a service point */}
      <mesh position={[0.75, 1.16, -0.04]} rotation={[-0.25, 0, 0]} castShadow>
        <boxGeometry args={[0.3, 0.2, 0.02]} />
        <meshStandardMaterial
          color={PALETTE.screen}
          emissive={PALETTE.glass}
          emissiveIntensity={0.3}
          {...SURFACE.satin}
        />
      </mesh>
    </group>
  )
}
