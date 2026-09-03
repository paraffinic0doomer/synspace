import { useEffect, useRef } from 'react'
import { Environment, Lightformer } from '@react-three/drei'
import type { DirectionalLight } from 'three'
import { useSceneObjects } from '@/state'
import type { EnvironmentSettings } from '@/types'
import { ambientFor, type SceneSurfaces } from '../sceneTheme'

interface LightingProps {
  environment: EnvironmentSettings
  surfaces: SceneSurfaces
}

/**
 * Three-point-ish studio rig plus a procedurally generated environment map.
 *
 * The env map is built from `Lightformer` children rather than a downloaded
 * HDRI, so the app has no network dependency and still gets soft reflections.
 * Only the key light casts shadows — that keeps the shadow cost to one map.
 */
export function Lighting({ environment, surfaces }: LightingProps) {
  const {
    room,
    ambientColor,
    keyLightIntensity,
    keyLightColor,
    shadowsEnabled,
  } = environment
  const ambientIntensity = ambientFor(environment, surfaces)
  const span = Math.max(room.width, room.depth)
  const shadowExtent = span * 0.75

  /**
   * The shadow map is re-rendered only when the world actually changes.
   *
   * By default three re-renders the depth pass every frame, which for a room
   * that is usually standing still is a whole extra 2048x2048 pass of pure
   * waste. `objects` changes identity on every store write — including the
   * live writes during a drag — so shadows stay correct while something is
   * moving and cost nothing while it is not.
   */
  const keyLight = useRef<DirectionalLight>(null)
  const objects = useSceneObjects()

  useEffect(() => {
    const light = keyLight.current
    if (!light) return
    light.shadow.autoUpdate = false
    light.shadow.needsUpdate = true
  }, [])

  useEffect(() => {
    const light = keyLight.current
    if (light) light.shadow.needsUpdate = true
  }, [objects, room, shadowsEnabled, keyLightIntensity, keyLightColor])

  return (
    <>
      <ambientLight intensity={ambientIntensity} color={ambientColor} />
      <hemisphereLight args={[ambientColor, '#2a2f3d', ambientIntensity]} />

      {/* Key light — the only shadow caster */}
      <directionalLight
        ref={keyLight}
        position={[span * 0.5, span * 0.85, span * 0.35]}
        intensity={keyLightIntensity}
        color={keyLightColor}
        castShadow={shadowsEnabled}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
        shadow-camera-near={0.5}
        shadow-camera-far={span * 2.5}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
      />

      {/* Cool fill from the opposite side, no shadow map */}
      <directionalLight
        position={[-span * 0.6, span * 0.4, -span * 0.5]}
        intensity={0.45}
        color={ambientColor}
      />

      {/* Warm bounce near the lounge end */}
      <pointLight
        position={[2.5, 2.4, 3.5]}
        intensity={12}
        distance={12}
        decay={2}
        color={keyLightColor}
      />

      <Environment resolution={256}>
        <Lightformer
          intensity={2.2}
          color={keyLightColor}
          position={[0, 5, 0]}
          scale={[10, 10, 1]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <Lightformer
          intensity={0.9}
          color={ambientColor}
          position={[-6, 3, 2]}
          scale={[6, 6, 1]}
          rotation={[0, Math.PI / 2, 0]}
        />
        <Lightformer
          intensity={0.7}
          color={keyLightColor}
          position={[6, 2, -3]}
          scale={[6, 6, 1]}
          rotation={[0, -Math.PI / 2, 0]}
        />
      </Environment>
    </>
  )
}
