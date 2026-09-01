import { BackSide } from 'three'
import type { RoomConfig } from '@/types'

interface RoomShellProps {
  room: RoomConfig
}

/**
 * Room boundary.
 *
 * Rendered as a single inverted box: with `BackSide` only the far interior
 * faces draw, so walls between the camera and the room are culled and the
 * floor stays readable from any orbit angle — no per-wall visibility logic.
 */
export function RoomShell({ room }: RoomShellProps) {
  const { width, depth, wallHeight } = room
  const halfW = width / 2
  const halfD = depth / 2

  const baseboards: Array<{ key: string; position: [number, number, number]; size: [number, number, number] }> = [
    { key: 'north', position: [0, 0.06, -halfD + 0.03], size: [width, 0.12, 0.06] },
    { key: 'south', position: [0, 0.06, halfD - 0.03], size: [width, 0.12, 0.06] },
    { key: 'west', position: [-halfW + 0.03, 0.06, 0], size: [0.06, 0.12, depth] },
    { key: 'east', position: [halfW - 0.03, 0.06, 0], size: [0.06, 0.12, depth] },
  ]

  return (
    <group>
      {/* Inverted shell */}
      <mesh position={[0, wallHeight / 2, 0]} receiveShadow>
        <boxGeometry args={[width, wallHeight, depth]} />
        <meshStandardMaterial color="#2c3242" side={BackSide} roughness={0.95} metalness={0.02} />
      </mesh>

      {/* Baseboard trim */}
      {baseboards.map(({ key, position, size }) => (
        <mesh key={key} position={position}>
          <boxGeometry args={size} />
          <meshStandardMaterial color="#3d4560" roughness={0.7} metalness={0.1} />
        </mesh>
      ))}

      {/* Accent light strip running the north wall */}
      <mesh position={[0, wallHeight - 0.35, -halfD + 0.05]}>
        <boxGeometry args={[width * 0.72, 0.04, 0.02]} />
        <meshStandardMaterial
          color="#4f8cff"
          emissive="#4f8cff"
          emissiveIntensity={2.2}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
