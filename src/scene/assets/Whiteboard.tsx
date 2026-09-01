import { PALETTE, SURFACE } from '../materials'
import type { AssetProps } from './types'

/** Mobile writing board — teaching spaces and stand-up areas. */
export function Whiteboard({ color }: AssetProps) {
  return (
    <group>
      {/* Board */}
      <mesh position={[0, 1.24, 0]} castShadow>
        <boxGeometry args={[1.76, 1.1, 0.05]} />
        <meshStandardMaterial color="#e9eef7" {...SURFACE.satin} />
      </mesh>
      {/* Frame */}
      <mesh position={[0, 1.24, -0.035]}>
        <boxGeometry args={[1.84, 1.18, 0.04]} />
        <meshStandardMaterial color={color} {...SURFACE.metallic} />
      </mesh>
      {/* Pen tray */}
      <mesh position={[0, 0.65, 0.06]} castShadow>
        <boxGeometry args={[1.7, 0.05, 0.12]} />
        <meshStandardMaterial color={color} {...SURFACE.metallic} />
      </mesh>

      {/* A-frame legs */}
      {[-0.72, 0.72].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.33, 0]} castShadow>
            <boxGeometry args={[0.06, 0.66, 0.06]} />
            <meshStandardMaterial color={PALETTE.metal} {...SURFACE.metallic} />
          </mesh>
          <mesh position={[x, 0.03, 0]} castShadow>
            <boxGeometry args={[0.1, 0.06, 0.46]} />
            <meshStandardMaterial color={PALETTE.darkMetal} {...SURFACE.satin} />
          </mesh>
          {[-0.2, 0.2].map((z) => (
            <mesh key={z} position={[x, 0.03, z]}>
              <sphereGeometry args={[0.035, 8, 6]} />
              <meshStandardMaterial color={PALETTE.plastic} {...SURFACE.matte} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}
