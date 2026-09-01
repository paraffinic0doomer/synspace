import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type {
  ConstraintViolation,
  EnvironmentSettings,
  HistoryEntry,
  ObjectStatus,
  SceneObject,
  SpatialConstraint,
  World,
  WorldMetadata,
  Zone,
} from '@/types'
import { useSceneStore } from './sceneStore'
import {
  getConstraintReport,
  getEgressRoutes,
  listZoneSummaries,
  type RouteSummary,
  type ZoneSummary,
} from './worldApi'

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export const useScene = (): World => useSceneStore((state) => state.scene)
/** The world document, under the Phase 4 name. */
export const useWorld = (): World => useSceneStore((state) => state.scene)
export const useZones = (): Zone[] => useSceneStore((state) => state.scene.zones)
export const useWorldMetadata = (): WorldMetadata =>
  useSceneStore((state) => state.scene.metadata)
export const useSceneObjects = (): SceneObject[] => useSceneStore((state) => state.scene.objects)
export const useSceneName = (): string => useSceneStore((state) => state.scene.name)
export const useEnvironment = (): EnvironmentSettings =>
  useSceneStore((state) => state.scene.environment)
export const useConstraints = (): SpatialConstraint[] =>
  useSceneStore((state) => state.scene.constraints)

/** The currently selected object, or null. Referentially stable. */
export function useSelectedObject(): SceneObject | null {
  return useSceneStore((state) =>
    state.selectedId
      ? (state.scene.objects.find((o) => o.id === state.selectedId) ?? null)
      : null,
  )
}

export function useObject(id: string): SceneObject | undefined {
  return useSceneStore((state) => state.scene.objects.find((o) => o.id === id))
}

/** Ids only — lets consumers re-render without depending on transforms. */
export function useObjectIds(): string[] {
  return useSceneStore(useShallow((state) => state.scene.objects.map((o) => o.id)))
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export const useCanUndo = (): boolean => useSceneStore((state) => state.history.past.length > 0)
export const useCanRedo = (): boolean => useSceneStore((state) => state.history.future.length > 0)

/** Undo stack, newest first, for the History console tab. */
export function useHistoryEntries(): HistoryEntry[] {
  const past = useSceneStore((state) => state.history.past)
  return useMemo(() => [...past].reverse(), [past])
}

export const useNextUndoLabel = (): string | null =>
  useSceneStore((state) => state.history.past.at(-1)?.label ?? null)
export const useNextRedoLabel = (): string | null =>
  useSceneStore((state) => state.history.future[0]?.label ?? null)

// ---------------------------------------------------------------------------
// World analysis
// ---------------------------------------------------------------------------

/**
 * Constraint findings for the current world.
 *
 * Evaluation walks an occupancy grid, so it is memoised on the world document:
 * it only recomputes when the world actually changes, not on every render.
 */
export function useConstraintViolations(): ConstraintViolation[] {
  const world = useWorld()
  return useMemo(() => getConstraintReport(world).violations, [world])
}

/** Violations naming a specific object. */
export function useViolationsFor(id: string | null): ConstraintViolation[] {
  const violations = useConstraintViolations()
  return useMemo(
    () => (id ? violations.filter((violation) => violation.objectIds.includes(id)) : []),
    [violations, id],
  )
}

export function useZoneSummaries(): ZoneSummary[] {
  const world = useWorld()
  return useMemo(() => listZoneSummaries(world), [world])
}

export function useEgressRoutes(): RouteSummary[] {
  const world = useWorld()
  return useMemo(() => getEgressRoutes(world), [world])
}

// ---------------------------------------------------------------------------
// Derived
// ---------------------------------------------------------------------------

/** Coarse status shown in the inspector. Pure — safe to call anywhere. */
export function getObjectStatus(object: SceneObject): ObjectStatus {
  if (object.locked) return 'locked'
  if (!object.visible) return 'hidden'
  return 'ready'
}

export interface SceneStats {
  total: number
  byType: Record<string, number>
  floorArea: number
  occupiedArea: number
}

/**
 * Aggregate counts for the header and inspector summaries.
 *
 * Derived with `useMemo` over raw store slices rather than inside the selector:
 * the result contains a nested object, which a selector would rebuild on every
 * snapshot read and send React into an update loop.
 */
export function useSceneStats(): SceneStats {
  const objects = useSceneObjects()
  const room = useSceneStore((state) => state.scene.environment.room)

  return useMemo(() => {
    const byType: Record<string, number> = {}
    let occupiedArea = 0

    for (const object of objects) {
      byType[object.type] = (byType[object.type] ?? 0) + 1
      occupiedArea +=
        object.dimensions.width * object.scale[0] * object.dimensions.depth * object.scale[2]
    }

    return {
      total: objects.length,
      byType,
      floorArea: Math.round(room.width * room.depth * 100) / 100,
      occupiedArea: Math.round(occupiedArea * 100) / 100,
    }
  }, [objects, room])
}
