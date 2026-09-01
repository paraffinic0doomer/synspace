import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { DoubleSide } from 'three'
import type { ProposalView, SceneObject, Vec3 } from '@/types'

/**
 * Non-destructive preview of a pending proposal.
 *
 * Rather than swapping the rendered world, this draws the *delta*: a ghost box
 * where each object would end up, a line from its current position, and a ring
 * on every object the human has fixed. The live world stays untouched and on
 * screen, so a person can see exactly what would change before approving.
 */

const ignoreRaycast = () => null

const GHOST_COLOR = '#4f8cff'
const FIXED_COLOR = '#f0b429'

interface ProposalPreviewProps {
  proposal: ProposalView
  objects: SceneObject[]
  /**
   * Which side the viewport is drawing solid. The overlay always ghosts the
   * other one, so the difference reads the same way in both directions.
   */
  worldView: 'current' | 'proposed'
}

interface GhostTarget {
  id: string
  from: Vec3
  to: Vec3
  width: number
  height: number
  depth: number
  rotationY: number
}

export function ProposalPreview({ proposal, objects, worldView }: ProposalPreviewProps) {
  const byId = useMemo(
    () => new Map(objects.map((object) => [object.id, object])),
    [objects],
  )

  const ghosts = useMemo<GhostTarget[]>(() => {
    const targets: GhostTarget[] = []
    for (const operation of proposal.operations) {
      if (operation.kind !== 'move_object') continue
      const object = byId.get(operation.objectId)
      if (!object) continue
      // In the proposed view the solid object already sits at the target, so
      // the ghost belongs at where it is now.
      const [from, to] =
        worldView === 'proposed'
          ? [[...operation.position] as Vec3, [...object.position] as Vec3]
          : [[...object.position] as Vec3, [...operation.position] as Vec3]
      targets.push({
        id: object.id,
        from,
        to,
        width: object.dimensions.width * object.scale[0],
        height: object.dimensions.height * object.scale[1],
        depth: object.dimensions.depth * object.scale[2],
        rotationY: object.rotation[1],
      })
    }
    return targets
  }, [proposal.operations, byId, worldView])

  const removals = useMemo(
    () =>
      proposal.operations
        .filter((operation) => operation.kind === 'remove_object')
        .map((operation) => byId.get((operation as { objectId: string }).objectId))
        .filter((object): object is SceneObject => Boolean(object)),
    [proposal.operations, byId],
  )

  const fixed = useMemo(
    () =>
      proposal.preservedObjectIds
        .map((id) => byId.get(id))
        .filter((object): object is SceneObject => Boolean(object)),
    [proposal.preservedObjectIds, byId],
  )

  return (
    <group name="proposal-preview">
      {ghosts.map((ghost) => (
        <group key={ghost.id}>
          {/* Where it would end up */}
          <mesh
            position={[ghost.to[0], ghost.height / 2, ghost.to[2]]}
            rotation={[0, ghost.rotationY, 0]}
            raycast={ignoreRaycast}
          >
            <boxGeometry args={[ghost.width, ghost.height, ghost.depth]} />
            <meshBasicMaterial
              color={GHOST_COLOR}
              transparent
              opacity={0.16}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>

          {/* Footprint on the floor */}
          <mesh
            position={[ghost.to[0], 0.055, ghost.to[2]]}
            rotation={[-Math.PI / 2, 0, ghost.rotationY]}
            raycast={ignoreRaycast}
          >
            <planeGeometry args={[ghost.width, ghost.depth]} />
            <meshBasicMaterial
              color={GHOST_COLOR}
              transparent
              opacity={0.3}
              depthWrite={false}
            />
          </mesh>

          {/* Travel line from current to proposed */}
          <Line
            points={[
              [ghost.from[0], 0.06, ghost.from[2]],
              [ghost.to[0], 0.06, ghost.to[2]],
            ]}
            color={GHOST_COLOR}
            lineWidth={2}
            dashed
            dashSize={0.22}
            gapSize={0.16}
            raycast={ignoreRaycast}
          />
        </group>
      ))}

      {/* Objects the proposal would remove */}
      {removals.map((object) => (
        <mesh
          key={object.id}
          position={[object.position[0], 0.06, object.position[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={ignoreRaycast}
        >
          <ringGeometry args={[0.38, 0.5, 24]} />
          <meshBasicMaterial color="#f2617a" transparent opacity={0.85} depthWrite={false} />
        </mesh>
      ))}

      {/* Objects the human fixed, which the proposal left alone */}
      {fixed.map((object) => (
        <mesh
          key={object.id}
          position={[object.position[0], 0.05, object.position[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={ignoreRaycast}
        >
          <ringGeometry args={[0.3, 0.38, 20]} />
          <meshBasicMaterial color={FIXED_COLOR} transparent opacity={0.75} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}
