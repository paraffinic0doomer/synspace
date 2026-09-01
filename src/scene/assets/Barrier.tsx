import { PALETTE, SURFACE } from '../materials'
import type { AssetProps } from './types'

/** Safety or queue barrier. Blocks a route without being a wall. */
export function Barrier({ color }: AssetProps) {
  const stripes = [-0.6, -0.3, 0, 0.3, 0.6]

  return (
    <group>
      {/* Rails */}
      {[0.55, 0.9].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow>
          <boxGeometry args={[1.6, 0.12, 0.06]} />
          <meshStandardMaterial color={color} {...SURFACE.matte} />
        </mesh>
      ))}

      {/* Hazard stripes on the lower rail */}
      {stripes.map((x) => (
        <mesh key={x} position={[x, 0.55, 0.035]} rotation={[0, 0, 0.5]}>
          <boxGeometry args={[0.09, 0.13, 0.01]} />
          <meshStandardMaterial color={PALETTE.plastic} {...SURFACE.matte} />
        </mesh>
      ))}

      {/* Uprights and feet */}
      {[-0.72, 0.72].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.5, 0]} castShadow>
            <boxGeometry args={[0.07, 1.0, 0.07]} />
            <meshStandardMaterial color={PALETTE.metal} {...SURFACE.metallic} />
          </mesh>
          <mesh position={[x, 0.04, 0]} castShadow>
            <boxGeometry args={[0.2, 0.08, 0.34]} />
            <meshStandardMaterial color={PALETTE.darkMetal} {...SURFACE.satin} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
