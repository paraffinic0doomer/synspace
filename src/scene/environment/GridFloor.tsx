import { Grid } from '@react-three/drei'
import type { RoomConfig } from '@/types'

interface GridFloorProps {
  room: RoomConfig
  showGrid: boolean
}

/**
 * Shadow-catching floor slab plus a fading construction grid.
 * The slab is one plane, so shadow receiving stays cheap.
 */
export function GridFloor({ room, showGrid }: GridFloorProps) {
  const span = Math.max(room.width, room.depth)

  return (
    <group>
      {/* Floor slab (receives the key light's shadows) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[room.width, room.depth]} />
        <meshStandardMaterial color="#20242f" roughness={0.92} metalness={0.04} />
      </mesh>

      {/* Surrounding apron so the room does not float in the void */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[span * 4, span * 4]} />
        <meshStandardMaterial color="#12151d" roughness={1} metalness={0} />
      </mesh>

      {showGrid && (
        <Grid
          position={[0, 0.008, 0]}
          args={[room.width, room.depth]}
          cellSize={0.5}
          cellThickness={0.6}
          cellColor="#39445c"
          sectionSize={2}
          sectionThickness={1.1}
          sectionColor="#4f8cff"
          fadeDistance={span * 2.2}
          fadeStrength={1.2}
          infiniteGrid
          followCamera={false}
        />
      )}
    </group>
  )
}
