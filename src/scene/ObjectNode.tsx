import { forwardRef, useCallback } from 'react'
import type { Group, Object3D } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { Edges, Html } from '@react-three/drei'
import type { SceneObject } from '@/types'
import { ASSET_COMPONENTS } from './assets'

interface ObjectNodeProps {
  object: SceneObject
  selected: boolean
  hovered: boolean
  showLabel: boolean
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}

const SELECT_COLOR = '#4f8cff'
const HOVER_COLOR = '#8ab4ff'
const LOCK_COLOR = '#f0b429'

/**
 * Renders a single scene object.
 *
 * The node owns no data: transforms, colour and visibility all arrive as
 * props from the store. It forwards its group ref upward so the transform
 * gizmo can attach to the exact Object3D it is editing.
 */
export const ObjectNode = forwardRef<Group, ObjectNodeProps>(function ObjectNode(
  { object, selected, hovered, showLabel, onSelect, onHover },
  ref,
) {
  const Asset = ASSET_COMPONENTS[object.type]
  const { width, height, depth } = object.dimensions

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation()
      onSelect(object.id)
    },
    [object.id, onSelect],
  )

  const handlePointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation()
      onHover(object.id)
      document.body.style.cursor = 'pointer'
    },
    [object.id, onHover],
  )

  const handlePointerOut = useCallback(() => {
    onHover(null)
    document.body.style.cursor = 'auto'
  }, [onHover])

  if (!object.visible) return null

  const outlineColor = object.locked ? LOCK_COLOR : selected ? SELECT_COLOR : HOVER_COLOR
  const showOutline = selected || hovered

  return (
    <group
      ref={ref}
      name={object.id}
      position={object.position}
      rotation={object.rotation}
      scale={object.scale}
      onPointerDown={handlePointerDown}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <Asset color={object.color} />

      {/* Selection / hover cage — never intercepts picking */}
      {showOutline && (
        <mesh
          position={[0, height / 2, 0]}
          raycast={ignoreRaycast}
          renderOrder={2}
        >
          <boxGeometry args={[width * 1.04, height * 1.04, depth * 1.04]} />
          <meshBasicMaterial
            color={outlineColor}
            transparent
            opacity={selected ? 0.07 : 0.03}
            depthWrite={false}
          />
          <Edges color={outlineColor} lineWidth={selected ? 2 : 1.25} />
        </mesh>
      )}

      {/* Footprint marker on the floor for the selected object */}
      {selected && (
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast}>
          <ringGeometry args={[Math.max(width, depth) * 0.58, Math.max(width, depth) * 0.64, 40]} />
          <meshBasicMaterial color={outlineColor} transparent opacity={0.75} depthWrite={false} />
        </mesh>
      )}

      {(showLabel || selected) && (
        <Html
          position={[0, height + 0.28, 0]}
          center
          distanceFactor={14}
          zIndexRange={[20, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="synspace-label" data-selected={selected ? 'true' : 'false'}>
            {object.label}
          </div>
        </Html>
      )}
    </group>
  )
})

/** Keeps helper geometry out of the picking pass. */
function ignoreRaycast(this: Object3D) {
  return null
}
