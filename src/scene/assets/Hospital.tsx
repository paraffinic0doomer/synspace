import { PALETTE, SURFACE } from '../materials'
import type { AssetProps } from './types'

const WIDTH = 8
const HEIGHT = 7
const DEPTH = 8

/**
 * Hospital block.
 *
 * Distinguished from a plain building on purpose: in an emergency-response
 * layout the question is usually "can an ambulance still reach *this* one",
 * so it has to be identifiable at a glance.
 */
export function Hospital({ color }: AssetProps) {
  const floors = [1.8, 3.6, 5.4]
  const columns = [-2.6, -1.3, 1.3, 2.6]

  return (
    <group>
      <mesh position={[0, HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[WIDTH, HEIGHT, DEPTH]} />
        <meshStandardMaterial color={color} {...SURFACE.matte} />
      </mesh>

      <mesh position={[0, HEIGHT + 0.15, 0]} castShadow>
        <boxGeometry args={[WIDTH + 0.3, 0.3, DEPTH + 0.3]} />
        <meshStandardMaterial color={PALETTE.trim} {...SURFACE.satin} />
      </mesh>

      {/* Windows */}
      {floors.map((y) =>
        columns.map((x) => (
          <mesh key={String(y) + ':' + String(x)} position={[x, y, DEPTH / 2 + 0.01]}>
            <planeGeometry args={[0.9, 1.0]} />
            <meshStandardMaterial
              color={PALETTE.screen}
              emissive={PALETTE.glass}
              emissiveIntensity={0.2}
              {...SURFACE.satin}
            />
          </mesh>
        )),
      )}

      {/* Ambulance canopy over the entrance */}
      <mesh position={[0, 2.5, DEPTH / 2 + 1.1]} castShadow>
        <boxGeometry args={[4.4, 0.18, 2.4]} />
        <meshStandardMaterial color={PALETTE.trim} {...SURFACE.satin} />
      </mesh>
      {[-1.9, 1.9].map((x) => (
        <mesh key={x} position={[x, 1.25, DEPTH / 2 + 2.1]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 2.5, 8]} />
          <meshStandardMaterial color={PALETTE.metal} {...SURFACE.metallic} />
        </mesh>
      ))}

      {/* Entrance doors */}
      <mesh position={[0, 0.9, DEPTH / 2 + 0.02]}>
        <planeGeometry args={[2.6, 1.8]} />
        <meshStandardMaterial
          color={PALETTE.glass}
          transparent
          opacity={0.55}
          {...SURFACE.satin}
        />
      </mesh>

      {/* The cross that makes it legible */}
      <mesh position={[0, 5.9, DEPTH / 2 + 0.03]}>
        <planeGeometry args={[1.5, 0.42]} />
        <meshStandardMaterial
          color="#f2617a"
          emissive="#f2617a"
          emissiveIntensity={1.6}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 5.9, DEPTH / 2 + 0.03]}>
        <planeGeometry args={[0.42, 1.5]} />
        <meshStandardMaterial
          color="#f2617a"
          emissive="#f2617a"
          emissiveIntensity={1.6}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
