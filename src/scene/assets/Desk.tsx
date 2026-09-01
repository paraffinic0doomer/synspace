import { PALETTE, SURFACE } from '../materials'
import type { AssetProps } from './types'

/**
 * Sit-stand workstation. Local origin sits on the floor, centred on the
 * footprint — the same convention every asset in the kit follows.
 */
export function Desk({ color }: AssetProps) {
  return (
    <group>
      {/* Worktop */}
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.05, 0.8]} />
        <meshStandardMaterial color={color} {...SURFACE.matte} />
      </mesh>

      {/* Side panels */}
      {[-0.75, 0.75].map((x) => (
        <mesh key={x} position={[x, 0.35, 0]} castShadow>
          <boxGeometry args={[0.06, 0.7, 0.74]} />
          <meshStandardMaterial color={PALETTE.darkMetal} {...SURFACE.satin} />
        </mesh>
      ))}

      {/* Modesty panel */}
      <mesh position={[0, 0.5, -0.34]}>
        <boxGeometry args={[1.44, 0.34, 0.03]} />
        <meshStandardMaterial color={PALETTE.fabric} {...SURFACE.soft} />
      </mesh>

      {/* Cable tray */}
      <mesh position={[0, 0.6, -0.2]}>
        <boxGeometry args={[1.0, 0.05, 0.18]} />
        <meshStandardMaterial color={PALETTE.plastic} {...SURFACE.matte} />
      </mesh>

      {/* Monitor arm + panel */}
      <mesh position={[0, 0.82, -0.28]}>
        <cylinderGeometry args={[0.03, 0.03, 0.16, 8]} />
        <meshStandardMaterial color={PALETTE.darkMetal} {...SURFACE.metallic} />
      </mesh>
      <mesh position={[0, 1.06, -0.26]} rotation={[-0.12, 0, 0]} castShadow>
        <boxGeometry args={[0.62, 0.36, 0.03]} />
        <meshStandardMaterial color={PALETTE.plastic} {...SURFACE.satin} />
      </mesh>
      <mesh position={[0, 1.06, -0.243]} rotation={[-0.12, 0, 0]}>
        <boxGeometry args={[0.58, 0.32, 0.01]} />
        <meshStandardMaterial
          color={PALETTE.screen}
          emissive={PALETTE.glass}
          emissiveIntensity={0.35}
          {...SURFACE.satin}
        />
      </mesh>
    </group>
  )
}
