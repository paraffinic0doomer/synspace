import { PALETTE, SURFACE } from '../materials'
import type { AssetProps } from './types'

/** A length of interior wall, for subdividing a floor into rooms. */
export function WallSegment({ color }: AssetProps) {
  return (
    <group>
      <mesh position={[0, 1.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.0, 2.6, 0.18]} />
        <meshStandardMaterial color={color} {...SURFACE.matte} />
      </mesh>
      {/* Skirting and head trim, which give the slab a sense of scale */}
      <mesh position={[0, 0.07, 0]}>
        <boxGeometry args={[2.02, 0.14, 0.22]} />
        <meshStandardMaterial color={PALETTE.darkMetal} {...SURFACE.satin} />
      </mesh>
      <mesh position={[0, 2.57, 0]}>
        <boxGeometry args={[2.02, 0.06, 0.22]} />
        <meshStandardMaterial color={PALETTE.trim} {...SURFACE.matte} />
      </mesh>
    </group>
  )
}
