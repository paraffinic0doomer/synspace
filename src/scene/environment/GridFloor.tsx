import { Grid } from '@react-three/drei'
import { useSceneSurfaces } from '../sceneTheme'
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
  const surfaces = useSceneSurfaces()
  const span = Math.max(room.width, room.depth)

  // Half-metre cells read as texture in a room, but as noise across a city
  // block. The grid is there to give a sense of scale, so it steps up with the
  // room rather than drawing tens of thousands of lines.
  const cellSize = span <= 30 ? 0.5 : span <= 80 ? 2 : 5
  const sectionSize = cellSize * 4

  return (
    <group>
      {/* Floor slab (receives the key light's shadows) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[room.width, room.depth]} />
        <meshStandardMaterial color={surfaces.floor} roughness={0.92} metalness={0.04} />
      </mesh>

      {/* Surrounding apron so the room does not float in the void */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[span * 4, span * 4]} />
        <meshStandardMaterial color={surfaces.apron} roughness={1} metalness={0} />
      </mesh>

      {showGrid && (
        <Grid
          position={[0, 0.008, 0]}
          args={[room.width, room.depth]}
          cellSize={cellSize}
          cellThickness={0.6}
          cellColor={surfaces.gridCell}
          sectionSize={sectionSize}
          sectionThickness={1.1}
          sectionColor={surfaces.gridSection}
          fadeDistance={span * 2.2}
          fadeStrength={1.2}
          infiniteGrid
          followCamera={false}
        />
      )}
    </group>
  )
}
