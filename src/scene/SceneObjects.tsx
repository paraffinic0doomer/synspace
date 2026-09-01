import { useCallback, useEffect, useRef, useState } from 'react'
import type { Group } from 'three'
import { TransformControls } from '@react-three/drei'
import { useDisplayedObjects, useEnvironment, useSceneStore } from '@/state'
import type { SceneObject, Vec3 } from '@/types'
import { ObjectNode } from './ObjectNode'

/**
 * Draws every object in the store and hosts the transform gizmo.
 *
 * Nothing here is hard coded — the list comes straight from scene state, and
 * the gizmo attaches to whichever Object3D matches the current selection.
 */
export function SceneObjects() {
  const { objects, showingProposed } = useDisplayedObjects()
  const environment = useEnvironment()
  const selectedId = useSceneStore((state) => state.selectedId)
  const hoveredId = useSceneStore((state) => state.hoveredId)
  const transformMode = useSceneStore((state) => state.transformMode)

  const selectObject = useSceneStore((state) => state.selectObject)
  const setHovered = useSceneStore((state) => state.setHovered)
  const previewTransform = useSceneStore((state) => state.previewTransform)
  const commitPreview = useSceneStore((state) => state.commitPreview)

  const nodes = useRef(new Map<string, Group>())
  const [target, setTarget] = useState<Group | null>(null)

  const selectedObject = selectedId
    ? (objects.find((object) => object.id === selectedId) ?? null)
    : null
  const { snapEnabled, translateSnap, rotateSnap, scaleSnap, showLabels } = environment

  // Re-resolve the gizmo target whenever the selection or the object list changes.
  useEffect(() => {
    setTarget(selectedId ? (nodes.current.get(selectedId) ?? null) : null)
  }, [selectedId, objects])

  const registerNode = useCallback((id: string, node: Group | null) => {
    if (node) nodes.current.set(id, node)
    else nodes.current.delete(id)
  }, [])

  // Live writes during the drag; the store keeps one "before" snapshot so the
  // whole gesture lands as a single undoable history entry on mouse-up.
  const handleObjectChange = useCallback(() => {
    if (!target || !selectedId) return
    previewTransform(selectedId, {
      position: target.position.toArray() as Vec3,
      rotation: [target.rotation.x, target.rotation.y, target.rotation.z],
      scale: target.scale.toArray() as Vec3,
    })
  }, [target, selectedId, previewTransform])

  const handleDragEnd = useCallback(() => commitPreview(), [commitPreview])

  return (
    <group name="scene-objects">
      {objects.map((object: SceneObject) => (
        <ObjectNode
          key={object.id}
          ref={(node) => registerNode(object.id, node)}
          object={object}
          selected={object.id === selectedId}
          hovered={object.id === hoveredId}
          showLabel={showLabels}
          onSelect={selectObject}
          onHover={setHovered}
        />
      ))}

      {/* The proposed world is a read-only preview: no gizmo, no edits. */}
      {target && selectedObject && !selectedObject.locked && !showingProposed && (
        <TransformControls
          object={target}
          mode={transformMode}
          size={0.9}
          space="world"
          translationSnap={snapEnabled ? translateSnap : null}
          rotationSnap={snapEnabled ? rotateSnap : null}
          scaleSnap={snapEnabled ? scaleSnap : null}
          showY={transformMode !== 'translate'}
          onObjectChange={handleObjectChange}
          onMouseUp={handleDragEnd}
        />
      )}
    </group>
  )
}
