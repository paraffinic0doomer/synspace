import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { MeshStandardMaterial } from 'three'
import { PALETTE, SURFACE } from '../materials'
import type { AssetProps } from './types'

const UNIT_COUNT = 7
const UNIT_HEIGHT = 0.22

/** 42U enclosure. Status LEDs pulse so infrastructure reads as "live". */
export function ServerRack({ color }: AssetProps) {
  const ledGroup = useRef<Group>(null)

  useFrame(({ clock }) => {
    const group = ledGroup.current
    if (!group) return
    const t = clock.getElapsedTime()
    group.children.forEach((child, index) => {
      const mesh = child as { material?: MeshStandardMaterial }
      if (mesh.material instanceof MeshStandardMaterial) {
        const phase = Math.sin(t * (1.4 + index * 0.35) + index) * 0.5 + 0.5
        mesh.material.emissiveIntensity = 0.35 + phase * 1.5
      }
    })
  })

  return (
    <group>
      {/* Cabinet shell */}
      <mesh position={[0, 1.0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.62, 2.0, 1.0]} />
        <meshStandardMaterial color={color} {...SURFACE.satin} />
      </mesh>

      {/* Plinth */}
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[0.66, 0.08, 1.04]} />
        <meshStandardMaterial color={PALETTE.darkMetal} {...SURFACE.metallic} />
      </mesh>

      {/* Vented top */}
      <mesh position={[0, 2.01, 0]}>
        <boxGeometry args={[0.6, 0.03, 0.98]} />
        <meshStandardMaterial color={PALETTE.darkMetal} {...SURFACE.metallic} />
      </mesh>

      {/* Rack units on the front face (+Z) */}
      {Array.from({ length: UNIT_COUNT }, (_, i) => {
        const y = 0.42 + i * (UNIT_HEIGHT + 0.05)
        return (
          <mesh key={i} position={[0, y, 0.505]}>
            <boxGeometry args={[0.54, UNIT_HEIGHT, 0.03]} />
            <meshStandardMaterial color={PALETTE.plastic} {...SURFACE.matte} />
          </mesh>
        )
      })}

      {/* Status LEDs */}
      <group ref={ledGroup}>
        {Array.from({ length: UNIT_COUNT }, (_, i) => {
          const y = 0.42 + i * (UNIT_HEIGHT + 0.05)
          return (
            <mesh key={i} position={[0.2, y, 0.525]}>
              <boxGeometry args={[0.07, 0.03, 0.01]} />
              <meshStandardMaterial
                color={i % 4 === 3 ? PALETTE.ledWarn : PALETTE.led}
                emissive={i % 4 === 3 ? PALETTE.ledWarn : PALETTE.led}
                emissiveIntensity={1}
                toneMapped={false}
              />
            </mesh>
          )
        })}
      </group>

      {/* Handle */}
      <mesh position={[-0.24, 1.1, 0.52]}>
        <boxGeometry args={[0.04, 0.34, 0.04]} />
        <meshStandardMaterial color={PALETTE.metal} {...SURFACE.metallic} />
      </mesh>
    </group>
  )
}
