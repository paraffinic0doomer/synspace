import { PALETTE, SURFACE } from '../materials'
import type { AssetProps } from './types'

/** A van-sized vehicle. Front faces local +Z, matching every other asset. */
export function Vehicle({ color }: AssetProps) {
  const wheels = [
    [-0.86, 1.35],
    [0.86, 1.35],
    [-0.86, -1.35],
    [0.86, -1.35],
  ]

  return (
    <group>
      {/* Body */}
      <mesh position={[0, 0.78, -0.2]} castShadow receiveShadow>
        <boxGeometry args={[1.9, 1.1, 4.0]} />
        <meshStandardMaterial color={color} {...SURFACE.satin} />
      </mesh>

      {/* Cabin */}
      <mesh position={[0, 1.42, 0.75]} castShadow>
        <boxGeometry args={[1.78, 0.72, 1.9]} />
        <meshStandardMaterial color={color} {...SURFACE.satin} />
      </mesh>

      {/* Windscreen and side glass */}
      <mesh position={[0, 1.44, 1.71]}>
        <planeGeometry args={[1.5, 0.6]} />
        <meshStandardMaterial color={PALETTE.glass} transparent opacity={0.55} {...SURFACE.satin} />
      </mesh>
      {[-0.9, 0.9].map((x) => (
        <mesh key={x} position={[x, 1.44, 0.75]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[1.7, 0.55]} />
          <meshStandardMaterial color={PALETTE.glass} transparent opacity={0.45} {...SURFACE.satin} />
        </mesh>
      ))}

      {/* Wheels */}
      {wheels.map((entry, index) => (
        <mesh
          key={index}
          position={[entry[0], 0.34, entry[1]]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <cylinderGeometry args={[0.34, 0.34, 0.22, 12]} />
          <meshStandardMaterial color={PALETTE.plastic} {...SURFACE.matte} />
        </mesh>
      ))}

      {/* Lights */}
      {[-0.62, 0.62].map((x) => (
        <mesh key={x} position={[x, 0.82, 1.81]}>
          <boxGeometry args={[0.34, 0.16, 0.04]} />
          <meshStandardMaterial
            color={PALETTE.trim}
            emissive={PALETTE.trim}
            emissiveIntensity={0.7}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* Roof beacon, so an emergency vehicle reads as one */}
      <mesh position={[0, 1.82, 0.9]}>
        <boxGeometry args={[0.8, 0.14, 0.28]} />
        <meshStandardMaterial
          color="#f0b429"
          emissive="#f0b429"
          emissiveIntensity={1.4}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
