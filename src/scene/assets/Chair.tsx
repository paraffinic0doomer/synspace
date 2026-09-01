import { PALETTE, SURFACE } from '../materials'
import type { AssetProps } from './types'

/** Five-star castor base task chair. */
export function Chair({ color }: AssetProps) {
  const starAngles = [0, 1, 2, 3, 4].map((i) => (i / 5) * Math.PI * 2)

  return (
    <group>
      {/* Castor arms */}
      {starAngles.map((angle) => (
        <group key={angle} rotation={[0, angle, 0]}>
          <mesh position={[0, 0.06, 0.14]} castShadow>
            <boxGeometry args={[0.05, 0.04, 0.28]} />
            <meshStandardMaterial color={PALETTE.plastic} {...SURFACE.matte} />
          </mesh>
          <mesh position={[0, 0.03, 0.27]}>
            <sphereGeometry args={[0.035, 8, 6]} />
            <meshStandardMaterial color={PALETTE.darkMetal} {...SURFACE.satin} />
          </mesh>
        </group>
      ))}

      {/* Gas lift */}
      <mesh position={[0, 0.26, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.045, 0.36, 10]} />
        <meshStandardMaterial color={PALETTE.metal} {...SURFACE.metallic} />
      </mesh>

      {/* Seat pan */}
      <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.09, 0.5]} />
        <meshStandardMaterial color={color} {...SURFACE.soft} />
      </mesh>

      {/* Backrest */}
      <mesh position={[0, 0.78, -0.2]} rotation={[0.14, 0, 0]} castShadow>
        <boxGeometry args={[0.46, 0.52, 0.07]} />
        <meshStandardMaterial color={color} {...SURFACE.soft} />
      </mesh>

      {/* Back support spine */}
      <mesh position={[0, 0.58, -0.19]}>
        <boxGeometry args={[0.07, 0.2, 0.05]} />
        <meshStandardMaterial color={PALETTE.plastic} {...SURFACE.matte} />
      </mesh>

      {/* Armrests */}
      {[-0.27, 0.27].map((x) => (
        <mesh key={x} position={[x, 0.63, -0.02]} castShadow>
          <boxGeometry args={[0.05, 0.22, 0.3]} />
          <meshStandardMaterial color={PALETTE.plastic} {...SURFACE.matte} />
        </mesh>
      ))}
    </group>
  )
}
