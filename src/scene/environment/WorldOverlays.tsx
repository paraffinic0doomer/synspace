import { useMemo } from 'react'
import { Html, Line } from '@react-three/drei'
import { DoubleSide } from 'three'
import type { ConstraintViolation, EnvironmentSettings, Rect2, Zone } from '@/types'
import type { RouteSummary } from '@/state'
import { rectCentre } from '@/spatial'
import { ZONE_KIND_LABELS } from '@/tools/zones'

/**
 * Lightweight world-analysis overlays.
 *
 * All of these draw flat on the floor and never intercept picking, so the room
 * stays readable and clicking still selects the object underneath. Each is
 * independently toggleable — the default view shows only warnings.
 */

const ignoreRaycast = () => null

interface ZoneOverlayProps {
  zones: Zone[]
  showLabels: boolean
}

/** Translucent floor tint plus an outline per zone. */
export function ZoneOverlay({ zones, showLabels }: ZoneOverlayProps) {
  return (
    <group name="zone-overlay">
      {zones.map((zone, index) => {
        const width = zone.bounds.maxX - zone.bounds.minX
        const depth = zone.bounds.maxZ - zone.bounds.minZ
        const centre = rectCentre(zone.bounds)
        // Stagger heights so overlapping zones do not z-fight.
        const y = 0.015 + index * 0.002

        return (
          <group key={zone.id}>
            <mesh
              position={[centre.x, y, centre.z]}
              rotation={[-Math.PI / 2, 0, 0]}
              raycast={ignoreRaycast}
            >
              <planeGeometry args={[width, depth]} />
              <meshBasicMaterial
                color={zone.color}
                transparent
                opacity={0.09}
                depthWrite={false}
                side={DoubleSide}
              />
            </mesh>

            <Line
              points={rectOutline(zone.bounds, y + 0.001)}
              color={zone.color}
              lineWidth={1.4}
              transparent
              opacity={0.55}
              raycast={ignoreRaycast}
            />

            {showLabels && (
              <Html
                position={[zone.bounds.minX + 0.15, y + 0.02, zone.bounds.minZ + 0.15]}
                distanceFactor={18}
                zIndexRange={[10, 0]}
                style={{ pointerEvents: 'none' }}
              >
                <div className="synspace-zone-label" style={{ borderColor: zone.color }}>
                  <span style={{ color: zone.color }}>{ZONE_KIND_LABELS[zone.kind]}</span>
                  {zone.name}
                </div>
              </Html>
            )}
          </group>
        )
      })}
    </group>
  )
}

/** The legal placement area, drawn as a bright floor outline. */
export function BoundaryOverlay({ room }: { room: EnvironmentSettings['room'] }) {
  const rect: Rect2 = {
    minX: -room.width / 2,
    maxX: room.width / 2,
    minZ: -room.depth / 2,
    maxZ: room.depth / 2,
  }

  return (
    <group name="boundary-overlay">
      <Line
        points={rectOutline(rect, 0.03)}
        color="#4f8cff"
        lineWidth={2.5}
        dashed
        dashSize={0.4}
        gapSize={0.25}
        raycast={ignoreRaycast}
      />
      {/* Corner ticks, so the extent reads even when the outline is edge-on. */}
      {[
        [rect.minX, rect.minZ],
        [rect.maxX, rect.minZ],
        [rect.minX, rect.maxZ],
        [rect.maxX, rect.maxZ],
      ].map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast}>
          <circleGeometry args={[0.16, 12]} />
          <meshBasicMaterial color="#4f8cff" transparent opacity={0.8} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

interface WarningOverlayProps {
  violations: ConstraintViolation[]
}

/**
 * A marker at each finding's location.
 *
 * Errors read red, warnings amber; findings without a location are skipped
 * rather than guessed at.
 */
export function WarningOverlay({ violations }: WarningOverlayProps) {
  const markers = useMemo(
    () =>
      violations
        .filter((violation) => violation.at && violation.severity !== 'info')
        .map((violation, index) => ({
          key: `${violation.constraintId}-${violation.objectIds.join('-')}-${index}`,
          x: violation.at![0],
          z: violation.at![1],
          color: violation.severity === 'error' ? '#f2617a' : '#f0b429',
        })),
    [violations],
  )

  return (
    <group name="warning-overlay">
      {markers.map((marker) => (
        <group key={marker.key} position={[marker.x, 0, marker.z]}>
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast}>
            <ringGeometry args={[0.34, 0.44, 24]} />
            <meshBasicMaterial color={marker.color} transparent opacity={0.85} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0.9, 0]} raycast={ignoreRaycast}>
            <octahedronGeometry args={[0.14, 0]} />
            <meshBasicMaterial color={marker.color} transparent opacity={0.9} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

interface PathOverlayProps {
  routes: RouteSummary[]
}

/**
 * The egress routes the constraint checks actually measured.
 *
 * Drawing the same polyline the widest-path search returned means the picture
 * and the numbers can never disagree; the pinch point is marked where the route
 * is narrowest.
 */
export function PathOverlay({ routes }: PathOverlayProps) {
  return (
    <group name="path-overlay">
      {routes.map((route) => {
        if (!route.clearance.reachable || route.clearance.route.length < 2) return null
        const points = route.clearance.route.map(
          (point) => [point.x, 0.045, point.z] as [number, number, number],
        )
        const tight = route.clearance.width < 1.2

        return (
          <group key={route.fromId}>
            <Line
              points={points}
              color={tight ? '#f0b429' : '#22d3a7'}
              lineWidth={2.2}
              transparent
              opacity={0.85}
              raycast={ignoreRaycast}
            />
            {route.clearance.pinch && (
              <mesh
                position={[route.clearance.pinch.x, 0.05, route.clearance.pinch.z]}
                rotation={[-Math.PI / 2, 0, 0]}
                raycast={ignoreRaycast}
              >
                <ringGeometry args={[0.2, 0.3, 20]} />
                <meshBasicMaterial
                  color={tight ? '#f0b429' : '#22d3a7'}
                  transparent
                  opacity={0.9}
                  depthWrite={false}
                />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}

/** Closed rectangle outline at a given height. */
function rectOutline(rect: Rect2, y: number): [number, number, number][] {
  return [
    [rect.minX, y, rect.minZ],
    [rect.maxX, y, rect.minZ],
    [rect.maxX, y, rect.maxZ],
    [rect.minX, y, rect.maxZ],
    [rect.minX, y, rect.minZ],
  ]
}
