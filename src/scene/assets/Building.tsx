import { PALETTE, SURFACE } from '../materials'
import type { AssetProps } from './types'

const WIDTH = 6
const HEIGHT = 8
const DEPTH = 6

/** Urban-scale block. Windows read as floors, which gives the mass a sense of size. */
export function Building({ color }: AssetProps) {
  const floors = [1.6, 3.2, 4.8, 6.4]
  const columns = [-1.8, -0.6, 0.6, 1.8]

  return (
    <group>
      {/* Mass */}
      <mesh position={[0, HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[WIDTH, HEIGHT, DEPTH]} />
        <meshStandardMaterial color={color} {...SURFACE.matte} />
      </mesh>

      {/* Parapet */}
      <mesh position={[0, HEIGHT + 0.15, 0]} castShadow>
        <boxGeometry args={[WIDTH + 0.24, 0.3, DEPTH + 0.24]} />
        <meshStandardMaterial color={PALETTE.darkMetal} {...SURFACE.satin} />
      </mesh>

      {/* Windows on the two faces a viewer usually sees */}
      {floors.map((y) =>
        columns.map((x) => (
          <group key={String(y) + ':' + String(x)}>
            <mesh position={[x, y, DEPTH / 2 + 0.01]}>
              <planeGeometry args={[0.8, 0.9]} />
              <meshStandardMaterial
                color={PALETTE.screen}
                emissive={PALETTE.glass}
                emissiveIntensity={0.18}
                {...SURFACE.satin}
              />
            </mesh>
            <mesh position={[WIDTH / 2 + 0.01, y, x]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[0.8, 0.9]} />
              <meshStandardMaterial
                color={PALETTE.screen}
                emissive={PALETTE.glass}
                emissiveIntensity={0.14}
                {...SURFACE.satin}
              />
            </mesh>
          </group>
        )),
      )}

      {/* Ground-floor entrance */}
      <mesh position={[0, 0.5, DEPTH / 2 + 0.02]}>
        <planeGeometry args={[1.6, 1.0]} />
        <meshStandardMaterial color={PALETTE.plastic} {...SURFACE.satin} />
      </mesh>
    </group>
  )
}
