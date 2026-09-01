import { PALETTE, SURFACE } from '../materials'
import type { AssetProps } from './types'

/** Generic shelving cabinet — the utility storage the kit was missing. */
export function StorageUnit({ color }: AssetProps) {
  const shelves = [0.42, 0.82, 1.22, 1.62]

  return (
    <group>
      {/* Carcass */}
      <mesh position={[0, 0.9, -0.19]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 1.8, 0.06]} />
        <meshStandardMaterial color={color} {...SURFACE.matte} />
      </mesh>
      {[-0.47, 0.47].map((x) => (
        <mesh key={x} position={[x, 0.9, 0]} castShadow>
          <boxGeometry args={[0.06, 1.8, 0.45]} />
          <meshStandardMaterial color={color} {...SURFACE.matte} />
        </mesh>
      ))}

      {/* Shelves */}
      {shelves.map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow>
          <boxGeometry args={[0.94, 0.04, 0.44]} />
          <meshStandardMaterial color={PALETTE.trim} {...SURFACE.matte} />
        </mesh>
      ))}

      {/* Top and plinth */}
      <mesh position={[0, 1.79, 0]} castShadow>
        <boxGeometry args={[1.04, 0.05, 0.48]} />
        <meshStandardMaterial color={PALETTE.darkMetal} {...SURFACE.satin} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[1.0, 0.1, 0.44]} />
        <meshStandardMaterial color={PALETTE.darkMetal} {...SURFACE.satin} />
      </mesh>

      {/* A couple of stored boxes, so it reads as storage rather than a slab */}
      {[
        [-0.24, 0.55],
        [0.22, 0.95],
      ].map((entry, index) => (
        <mesh key={index} position={[entry[0], entry[1], 0.02]} castShadow>
          <boxGeometry args={[0.36, 0.22, 0.3]} />
          <meshStandardMaterial color={PALETTE.woodDark} {...SURFACE.soft} />
        </mesh>
      ))}
    </group>
  )
}
