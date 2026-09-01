import { PALETTE, SURFACE } from '../materials'
import type { AssetProps } from './types'

/** Six-seat trestle table. */
export function MeetingTable({ color }: AssetProps) {
  return (
    <group>
      {/* Top */}
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 0.06, 1.2]} />
        <meshStandardMaterial color={color} {...SURFACE.matte} />
      </mesh>

      {/* Edge banding */}
      <mesh position={[0, 0.68, 0]}>
        <boxGeometry args={[2.54, 0.03, 1.14]} />
        <meshStandardMaterial color={PALETTE.woodDark} {...SURFACE.matte} />
      </mesh>

      {/* Trestle legs */}
      {[-0.92, 0.92].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.34, 0]} castShadow>
            <boxGeometry args={[0.09, 0.68, 0.09]} />
            <meshStandardMaterial color={PALETTE.darkMetal} {...SURFACE.metallic} />
          </mesh>
          <mesh position={[0, 0.03, 0]} castShadow>
            <boxGeometry args={[0.12, 0.06, 0.94]} />
            <meshStandardMaterial color={PALETTE.darkMetal} {...SURFACE.metallic} />
          </mesh>
          <mesh position={[0, 0.66, 0]}>
            <boxGeometry args={[0.12, 0.05, 0.8]} />
            <meshStandardMaterial color={PALETTE.darkMetal} {...SURFACE.metallic} />
          </mesh>
        </group>
      ))}

      {/* Stretcher */}
      <mesh position={[0, 0.24, 0]}>
        <boxGeometry args={[1.84, 0.07, 0.07]} />
        <meshStandardMaterial color={PALETTE.darkMetal} {...SURFACE.metallic} />
      </mesh>

      {/* Centre power grommet */}
      <mesh position={[0, 0.76, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.03, 12]} />
        <meshStandardMaterial color={PALETTE.plastic} {...SURFACE.satin} />
      </mesh>
    </group>
  )
}
