import { BackSide } from 'three'
import { useSceneSurfaces } from '../sceneTheme'
import { useThemeStore } from '@/state'
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

  const surfaces = useSceneSurfaces()
  const light = useThemeStore((state) => state.resolved) === 'light'

  return (
    <group>
      {/* Inverted shell */}
      <mesh position={[0, wallHeight / 2, 0]} receiveShadow>
        <boxGeometry args={[width, wallHeight, depth]} />
        <meshStandardMaterial color={surfaces.wall} side={BackSide} roughness={0.95} metalness={0.02} />
      </mesh>

      {/* Baseboard trim */}
      {baseboards.map(({ key, position, size }) => (
        <mesh key={key} position={position}>
          <boxGeometry args={size} />
          <meshStandardMaterial color={surfaces.wallBase} roughness={0.7} metalness={0.1} />
        </mesh>
      ))}

      {/* Accent light strip running the north wall. An emissive line reads as
          light in a dark room and as a smudge on a pale one, so in the light
          theme it becomes a plain painted band instead. */}
      <mesh position={[0, wallHeight - 0.35, -halfD + 0.05]}>
        <boxGeometry args={[width * 0.72, 0.04, 0.02]} />
        <meshStandardMaterial
          color={surfaces.gridSection}
          emissive={surfaces.gridSection}
          emissiveIntensity={light ? 0 : 2.2}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
