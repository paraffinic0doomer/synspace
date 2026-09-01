import { PALETTE, SURFACE } from '../materials'
import type { AssetProps } from './types'

/** Potted floor plant with faceted low-poly foliage. */
export function Plant({ color }: AssetProps) {
  const clusters: Array<[number, number, number, number]> = [
    [0, 0.98, 0, 0.3],
    [0.16, 0.8, 0.1, 0.21],
    [-0.15, 0.86, -0.09, 0.18],
    [0.04, 1.2, -0.06, 0.16],
  ]

  return (
    <group>
      {/* Pot */}
      <mesh position={[0, 0.17, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.18, 0.34, 10]} />
        <meshStandardMaterial color={PALETTE.trim} {...SURFACE.matte} />
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.03, 10]} />
        <meshStandardMaterial color={PALETTE.metal} {...SURFACE.satin} />
      </mesh>

      {/* Soil */}
      <mesh position={[0, 0.355, 0]}>
        <cylinderGeometry args={[0.21, 0.21, 0.02, 10]} />
        <meshStandardMaterial color={PALETTE.soil} {...SURFACE.soft} />
      </mesh>

      {/* Stem */}
      <mesh position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.025, 0.035, 0.55, 6]} />
        <meshStandardMaterial color={PALETTE.soil} {...SURFACE.matte} />
      </mesh>

      {/* Foliage clusters */}
      {clusters.map(([x, y, z, radius], index) => (
        <mesh key={index} position={[x, y, z]} castShadow>
          <icosahedronGeometry args={[radius, 0]} />
          <meshStandardMaterial
            color={index % 2 === 0 ? color : PALETTE.foliageDeep}
            flatShading
            {...SURFACE.soft}
          />
        </mesh>
      ))}
    </group>
  )
}
