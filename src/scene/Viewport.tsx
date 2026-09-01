import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr, GizmoHelper, GizmoViewport, OrbitControls, Preload } from '@react-three/drei'
import { ACESFilmicToneMapping } from 'three'
import {
  useConstraintViolations,
  useEgressRoutes,
  useEnvironment,
  useSceneObjects,
  useSceneStore,
  useZones,
  usePreviewProposal,
  useProposalStore,
} from '@/state'
import {
  BoundaryOverlay,
  GridFloor,
  Lighting,
  PathOverlay,
  ProposalPreview,
  RoomShell,
  WarningOverlay,
  ZoneOverlay,
} from './environment'
import { SceneObjects } from './SceneObjects'
import { CameraRig, DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_TARGET } from './CameraRig'

/**
 * The 3D viewport.
 *
 * Owns the renderer, camera and orbit controls only. Everything drawn inside
 * is derived from the scene store.
 */
export function Viewport() {
  const environment = useEnvironment()
  const zones = useZones()
  const violations = useConstraintViolations()
  const routes = useEgressRoutes()
  const previewProposal = usePreviewProposal()
  const objects = useSceneObjects()
  const proposalWorldView = useProposalStore((state) => state.worldView)

  const selectObject = useSceneStore((state) => state.selectObject)
  const {
    room,
    showGrid,
    showRoom,
    shadowsEnabled,
    backgroundColor,
    showZones,
    showBoundary,
    showWarnings,
    showPaths,
    showLabels,
  } = environment

  return (
    <Canvas
      shadows={shadowsEnabled}
      dpr={[1, 2]}
      gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      camera={{ position: DEFAULT_CAMERA_POSITION, fov: 45, near: 0.1, far: 400 }}
      onPointerMissed={() => selectObject(null)}
      fallback={
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-400">
          WebGL is unavailable in this browser, so the 3D viewport cannot start.
        </div>
      }
    >
      <color attach="background" args={[backgroundColor]} />
      <fog attach="fog" args={[backgroundColor, 28, 78]} />

      <Suspense fallback={null}>
        <Lighting environment={environment} />
        <GridFloor room={room} showGrid={showGrid} />
        {showRoom && <RoomShell room={room} />}
        {showZones && <ZoneOverlay zones={zones} showLabels={showLabels} />}
        {showBoundary && <BoundaryOverlay room={room} />}
        {showWarnings && <WarningOverlay violations={violations} />}
        {showPaths && <PathOverlay routes={routes} />}
        {previewProposal && (
          <ProposalPreview
            proposal={previewProposal}
            objects={objects}
            worldView={proposalWorldView}
          />
        )}
        <SceneObjects />
        <Preload all />
      </Suspense>

      <CameraRig />

      <OrbitControls
        makeDefault
        target={DEFAULT_CAMERA_TARGET}
        enableDamping
        dampingFactor={0.08}
        minDistance={2}
        maxDistance={60}
        maxPolarAngle={Math.PI / 2.06}
        panSpeed={0.9}
        zoomSpeed={0.8}
      />

      <GizmoHelper alignment="bottom-right" margin={[76, 76]}>
        <GizmoViewport
          axisColors={['#f2617a', '#22d3a7', '#4f8cff']}
          labelColor="#e6ecf7"
          hideNegativeAxes
        />
      </GizmoHelper>

      <AdaptiveDpr pixelated />
    </Canvas>
  )
}
