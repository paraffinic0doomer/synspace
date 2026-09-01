import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Box3, Sphere, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useSceneStore } from '@/state'
import { onFocusRequest, onResetViewRequest } from '@/tools/viewportEvents'

export const DEFAULT_CAMERA_POSITION: [number, number, number] = [11.5, 8.5, 13]
export const DEFAULT_CAMERA_TARGET: [number, number, number] = [0, 0.9, 0]

/**
 * Default framing for a given room.
 *
 * A fixed camera position only ever suits one room size — it opens an 18 x 14 m
 * floor nicely and puts a 60 x 44 m district inside a wall. Scaling the same
 * viewing angle by the room's diagonal frames any world the presets define.
 */
export function defaultViewFor(room: { width: number; depth: number }): {
  position: [number, number, number]
  target: [number, number, number]
} {
  const reference = Math.hypot(18, 14)
  const scale = Math.max(Math.hypot(room.width, room.depth) / reference, 1)
  return {
    position: [
      DEFAULT_CAMERA_POSITION[0] * scale,
      DEFAULT_CAMERA_POSITION[1] * scale,
      DEFAULT_CAMERA_POSITION[2] * scale,
    ],
    target: [0, DEFAULT_CAMERA_TARGET[1], 0],
  }
}

const box = new Box3()
const sphere = new Sphere()

/**
 * Smoothly drives the camera toward requested framings.
 *
 * Only runs its easing loop while a move is pending, so an idle viewport costs
 * nothing beyond OrbitControls' own damping.
 */
export function CameraRig() {
  const { camera, scene, controls } = useThree()
  const desiredPosition = useRef(new Vector3())
  const desiredTarget = useRef(new Vector3())
  const animating = useRef(false)

  useEffect(() => {
    const stopFocus = onFocusRequest(({ id }) => {
      const node = scene.getObjectByName(id)
      if (!node) return

      box.setFromObject(node)
      if (box.isEmpty()) return
      box.getBoundingSphere(sphere)

      const distance = Math.max(sphere.radius * 3.2, 2.6)
      const direction = new Vector3()
        .subVectors(camera.position, sphere.center)
        .normalize()
      if (direction.lengthSq() === 0) direction.set(1, 0.8, 1).normalize()
      if (direction.y < 0.25) direction.setY(0.25).normalize()

      desiredTarget.current.copy(sphere.center)
      desiredPosition.current.copy(sphere.center).addScaledVector(direction, distance)
      animating.current = true
    })

    const stopReset = onResetViewRequest(() => {
      const view = defaultViewFor(useSceneStore.getState().scene.environment.room)
      desiredPosition.current.set(...view.position)
      desiredTarget.current.set(...view.target)
      animating.current = true
    })

    return () => {
      stopFocus()
      stopReset()
    }
  }, [camera, scene])

  // Re-frame whenever the world's room changes — loading a district-sized
  // preset should not leave the camera inside a building.
  const room = useSceneStore((state) => state.scene.environment.room)
  useEffect(() => {
    const view = defaultViewFor(room)
    desiredPosition.current.set(...view.position)
    desiredTarget.current.set(...view.target)
    animating.current = true
  }, [room])

  useFrame((_, delta) => {
    if (!animating.current) return
    const orbit = controls as OrbitControlsImpl | null
    const ease = 1 - Math.pow(0.0012, delta)

    camera.position.lerp(desiredPosition.current, ease)
    if (orbit?.target) {
      orbit.target.lerp(desiredTarget.current, ease)
      orbit.update()
    }

    if (camera.position.distanceTo(desiredPosition.current) < 0.02) {
      camera.position.copy(desiredPosition.current)
      if (orbit?.target) {
        orbit.target.copy(desiredTarget.current)
        orbit.update()
      }
      animating.current = false
    }
  })

  return null
}

/** Deselects when a click lands on empty space. */
export function useBackgroundDeselect() {
  const selectObject = useSceneStore((state) => state.selectObject)
  return (event: MouseEvent) => {
    if (event.type === 'click') selectObject(null)
  }
}
