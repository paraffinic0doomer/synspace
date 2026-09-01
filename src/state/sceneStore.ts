import { create } from 'zustand'
import type {
  ActivityEntry,
  ActivityLevel,
  ActorRef,
  AgentDescriptor,
  AssetType,
  ChangeKind,
  EnvironmentSettings,
  HistoryEntry,
  McpState,
  Scene,
  SceneHistory,
  SceneObject,
  SpatialConstraint,
  ToolInvocationRecord,
  TransformMode,
  TransformPatch,
  Vec3,
  Zone,
} from '@/types'
import { HUMAN_ACTOR, SYSTEM_ACTOR } from '@/types'
import {
  createSceneObject,
  getAssetDefinition,
  touchMetadata,
  type CreateObjectOptions,
} from '@/tools/assetCatalog'
import { clampToRoom, findSpawnPosition } from '@/tools/placement'
import { mergeEnvironment, sanitizeEnvironmentPatch } from '@/tools/environment'
import { createEmptyWorld } from '@/tools/sceneTemplates'
import { clearPersistedWorld, loadPersistedWorld, watchWorld } from './persistence'
import { buildLayout, getLayout } from '@/tools/layouts'
import { createId, normalizeAngle, roundTo, roundVec3, toDegrees } from '@/utils'

const MAX_ACTIVITY_ENTRIES = 250
const HISTORY_LIMIT = 60

/** Fields of an object that can be patched directly (transforms have their own path). */
export type ObjectPatch = Partial<Omit<SceneObject, 'id' | 'type' | 'metadata'>>

/** Seed roster. Phase 2 ships the surface; live transport arrives with WebMCP. */
const INITIAL_AGENTS: AgentDescriptor[] = [
  {
    id: 'agent-planner',
    name: 'Planner',
    role: 'Space planning & layout',
    status: 'idle',
    capabilities: ['scene.read', 'object.place', 'layout.optimise'],
  },
  {
    id: 'agent-inspector',
    name: 'Inspector',
    role: 'Clearance & compliance checks',
    status: 'idle',
    capabilities: ['scene.read', 'object.measure'],
  },
  {
    id: 'agent-scribe',
    name: 'Scribe',
    role: 'Change log & narration',
    status: 'idle',
    capabilities: ['activity.read', 'activity.write'],
  },
]

interface LogInput {
  message: string
  actor?: ActorRef
  level?: ActivityLevel
  targetId?: string
  changeId?: string
  tool?: ToolInvocationRecord
}

/** A transform produced by a layout strategy, applied as one batch. */
export interface LayoutAssignment {
  id: string
  position?: Vec3
  rotation?: Vec3
}

const INITIAL_MCP: McpState = {
  status: 'checking',
  surface: null,
  toolNames: [],
  error: null,
  callCount: 0,
}

/** A change in progress: a gizmo drag, a numeric scrub, an open colour picker. */
interface PendingChange {
  before: Scene
  targetIds: string[]
}

export interface SceneState {
  // ---- the single source of truth ---------------------------------------
  scene: Scene

  // ---- editor state (not part of the document) --------------------------
  selectedId: string | null
  hoveredId: string | null
  transformMode: TransformMode
  pending: PendingChange | null

  // ---- history + timeline -----------------------------------------------
  history: SceneHistory
  activity: ActivityEntry[]
  agents: AgentDescriptor[]
  mcp: McpState

  // ---- atomic actions (the surface WebMCP tools will call) --------------
  addObject: (type: AssetType, options?: CreateObjectOptions, actor?: ActorRef) => string
  updateObject: (id: string, patch: ObjectPatch, actor?: ActorRef) => boolean
  moveObject: (id: string, position: Vec3, actor?: ActorRef) => boolean
  rotateObject: (id: string, rotation: Vec3, actor?: ActorRef) => boolean
  scaleObject: (id: string, scale: Vec3, actor?: ActorRef) => boolean
  deleteObject: (id: string, actor?: ActorRef) => boolean
  duplicateObject: (id: string, actor?: ActorRef) => string | null
  clearScene: (actor?: ActorRef) => void
  selectObject: (id: string | null) => void
  updateEnvironment: (patch: Partial<EnvironmentSettings>, actor?: ActorRef) => void
  updateConstraint: (id: string, patch: Partial<SpatialConstraint>, actor?: ActorRef) => boolean
  updateZone: (id: string, patch: Partial<Omit<Zone, 'id'>>, actor?: ActorRef) => boolean
  loadScene: (scene: Scene, actor?: ActorRef) => void
  resetScene: (actor?: ActorRef) => void
  /**
   * Empties the world and drops the locally saved copy, so a refresh opens on
   * an empty room rather than restoring what was here.
   */
  startFresh: (actor?: ActorRef) => void
  /** Refurnishes the current room with a named layout, keeping its size and rules. */
  generateLayout: (layoutId: string, actor?: ActorRef) => boolean
  /** Applies a whole layout plan as a single undoable change. */
  applyLayout: (assignments: LayoutAssignment[], label: string, actor?: ActorRef) => number

  // ---- interactive editing (live, then one history entry) ---------------
  previewTransform: (id: string, patch: TransformPatch) => void
  previewUpdate: (id: string, patch: ObjectPatch) => void
  commitPreview: (actor?: ActorRef) => void
  discardPreview: () => void

  // ---- history ----------------------------------------------------------
  undo: () => boolean
  redo: () => boolean
  canUndo: () => boolean
  canRedo: () => boolean

  // ---- ui-only ----------------------------------------------------------
  setHovered: (id: string | null) => void
  setTransformMode: (mode: TransformMode) => void
  log: (input: LogInput) => void
  clearActivity: () => void

  // ---- WebMCP transport --------------------------------------------------
  setMcpState: (patch: Partial<McpState>) => void
  recordToolCall: (record: ToolInvocationRecord, agentName: string) => void
}

// ---------------------------------------------------------------------------
// Activity helpers
// ---------------------------------------------------------------------------

function makeEntry(input: LogInput): ActivityEntry {
  const actor = input.actor ?? HUMAN_ACTOR
  return {
    id: createId('evt'),
    timestamp: Date.now(),
    actor: actor.name,
    actorKind: actor.kind,
    level: input.level ?? 'info',
    message: input.message,
    targetId: input.targetId,
    changeId: input.changeId,
    tool: input.tool,
  }
}

function appendEntry(activity: ActivityEntry[], input: LogInput): ActivityEntry[] {
  return [makeEntry(input), ...activity].slice(0, MAX_ACTIVITY_ENTRIES)
}

// ---------------------------------------------------------------------------
// Scene helpers (pure)
// ---------------------------------------------------------------------------

const findObject = (scene: Scene, id: string): SceneObject | undefined =>
  scene.objects.find((object) => object.id === id)

const withObjects = (scene: Scene, objects: SceneObject[]): Scene => ({ ...scene, objects })

/**
 * Stamps world-level provenance onto a committed document.
 *
 * The revision counts commits to the *live* document, so it is always derived
 * from what was there before — never from the incoming document's own counter.
 * That matters because whole worlds get installed here: a scenario world has
 * been edited independently and carries a revision of its own, and inheriting
 * it would make a single apply look like a dozen changes, or a reset look like
 * the world went backwards. Both would break staleness detection, which is the
 * one thing standing between an agent and overwriting newer human work.
 */
const touchWorld = (before: Scene, after: Scene): Scene => ({
  ...after,
  metadata: {
    ...after.metadata,
    updatedAt: Date.now(),
    revision: before.metadata.revision + 1,
  },
})

const replaceObject = (scene: Scene, next: SceneObject): Scene =>
  withObjects(
    scene,
    scene.objects.map((object) => (object.id === next.id ? next : object)),
  )

/** Applies a transform patch with room clamping and scale flooring. */
function applyTransformPatch(
  object: SceneObject,
  patch: TransformPatch,
  environment: EnvironmentSettings,
): SceneObject {
  const scale = patch.scale
    ? (patch.scale.map((v) => Math.max(roundTo(v, 3), 0.05)) as Vec3)
    : object.scale
  const rotation = patch.rotation
    ? (patch.rotation.map(normalizeAngle) as Vec3)
    : object.rotation
  const requestedPosition = patch.position ? roundVec3(patch.position) : object.position
  // Rotation and scale both change the floor footprint. Re-clamp on every
  // transform patch so an object cannot be made illegal without moving it.
  const position = clampToRoom(
    requestedPosition,
    object.dimensions,
    scale,
    environment.room,
    rotation,
  )

  return { ...object, position, rotation, scale }
}

const sameVec = (a: Vec3, b: Vec3) =>
  Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4 && Math.abs(a[2] - b[2]) < 1e-4

/** True when a committed preview would be a no-op (a stray click on the gizmo). */
function isNoopChange(before: Scene, after: Scene, ids: string[]): boolean {
  if (before === after) return true
  return ids.every((id) => {
    const a = findObject(before, id)
    const b = findObject(after, id)
    if (!a || !b) return false
    return (
      sameVec(a.position, b.position) &&
      sameVec(a.rotation, b.rotation) &&
      sameVec(a.scale, b.scale) &&
      a.label === b.label &&
      a.color === b.color &&
      a.locked === b.locked &&
      a.visible === b.visible
    )
  })
}

/**
 * Classifies a committed change by diffing the object, not by inspecting the
 * patch. The gizmo always writes position, rotation and scale together, so only
 * the diff can tell a translate drag from a rotate drag.
 */
function diffKind(before?: SceneObject, after?: SceneObject): ChangeKind {
  if (!before || !after) return 'update'
  const moved = !sameVec(before.position, after.position)
  const rotated = !sameVec(before.rotation, after.rotation)
  const scaled = !sameVec(before.scale, after.scale)
  if (Number(moved) + Number(rotated) + Number(scaled) !== 1) return 'update'
  return moved ? 'move' : rotated ? 'rotate' : 'scale'
}

export const useSceneStore = create<SceneState>()((set, get) => {
  /**
   * The one place a scene modification becomes durable.
   *
   * Everything funnels through here so that a change can never land without a
   * matching history entry and timeline row — which is what makes agent edits
   * as reviewable as human ones.
   */
  const record = (
    before: Scene,
    afterRaw: Scene,
    meta: { kind: ChangeKind; label: string; actor: ActorRef; targetIds: string[] },
    level: ActivityLevel = 'info',
  ) => {
    const after = touchWorld(before, afterRaw)
    const entry: HistoryEntry = {
      id: createId('chg'),
      timestamp: Date.now(),
      before,
      after,
      ...meta,
    }

    set((state) => ({
      scene: after,
      pending: null,
      history: {
        ...state.history,
        past: [...state.history.past, entry].slice(-state.history.limit),
        future: [],
      },
      activity: appendEntry(state.activity, {
        message: meta.label,
        actor: meta.actor,
        level,
        targetId: meta.targetIds[0],
        changeId: entry.id,
      }),
    }))

    return entry
  }

  /** Runs a pure scene transform and records it, or does nothing if it returns null. */
  const change = (
    produce: (scene: Scene) => { scene: Scene; label: string; targetIds: string[] } | null,
    kind: ChangeKind,
    actor: ActorRef,
    level: ActivityLevel = 'info',
  ): boolean => {
    const before = get().scene
    const result = produce(before)
    if (!result) return false
    record(before, result.scene, { kind, label: result.label, actor, targetIds: result.targetIds }, level)
    return true
  }

  /**
   * Starts or extends an in-progress interactive change.
   *
   * The first call snapshots the scene; subsequent calls for the same object
   * keep writing against that snapshot, so an entire drag or typed edit lands
   * as a single undo step rather than one per frame or keystroke.
   */
  const stagePreview = (
    id: string,
    mutate: (object: SceneObject, scene: Scene) => SceneObject,
  ) => {
    set((state) => {
      const object = findObject(state.scene, id)
      if (!object || object.locked) return {}

      const pending: PendingChange = state.pending?.targetIds.includes(id)
        ? state.pending
        : { before: state.scene, targetIds: [id] }

      return { scene: replaceObject(state.scene, mutate(object, state.scene)), pending }
    })
  }

  /** Restores a snapshot, dropping a selection that no longer exists in it. */
  const restore = (scene: Scene) => (state: SceneState) => ({
    scene,
    pending: null,
    selectedId:
      state.selectedId && scene.objects.some((o) => o.id === state.selectedId)
        ? state.selectedId
        : null,
    hoveredId: null,
  })

  return {
    // A refresh restores the world you were working on; a first visit, a
    // cleared store, or a world written by an older build all fall back to an
    // empty room.
    scene: loadPersistedWorld() ?? createEmptyWorld(),

    selectedId: null,
    hoveredId: null,
    transformMode: 'translate',
    pending: null,

    history: { past: [], future: [], limit: HISTORY_LIMIT },
    activity: [
      makeEntry({
        message: 'Workspace loaded — studio floor template restored.',
        actor: SYSTEM_ACTOR,
        level: 'success',
      }),
    ],
    agents: INITIAL_AGENTS,
    mcp: { ...INITIAL_MCP },

    // ---- atomic actions ---------------------------------------------------

    addObject: (type, options = {}, actor = HUMAN_ACTOR) => {
      const before = get().scene
      const definition = getAssetDefinition(type)
      const position =
        options.position ?? findSpawnPosition(before.objects, definition.dimensions, before.environment.room)
      const object = createSceneObject(
        type,
        {
          ...options,
          position: clampToRoom(
            position,
            definition.dimensions,
            options.scale ?? [1, 1, 1],
            before.environment.room,
            options.rotation ?? [0, 0, 0],
          ),
        },
        actor,
      )

      record(
        before,
        withObjects(before, [...before.objects, object]),
        { kind: 'add', label: `Placed ${object.label}`, actor, targetIds: [object.id] },
        'success',
      )
      set({ selectedId: object.id })
      return object.id
    },

    updateObject: (id, patch, actor = HUMAN_ACTOR) =>
      change(
        (scene) => {
          const object = findObject(scene, id)
          if (!object) return null
          const next: SceneObject = {
            ...object,
            ...patch,
            metadata: touchMetadata(object.metadata, actor),
          }
          return {
            scene: replaceObject(scene, next),
            label: describeUpdate(object, patch),
            targetIds: [id],
          }
        },
        'update',
        actor,
      ),

    moveObject: (id, position, actor = HUMAN_ACTOR) =>
      change(
        (scene) => {
          const object = findObject(scene, id)
          if (!object || object.locked) return null
          const next = applyTransformPatch(object, { position }, scene.environment)
          return {
            scene: replaceObject(scene, { ...next, metadata: touchMetadata(object.metadata, actor) }),
            label: `Moved ${object.label} → x ${next.position[0]}, z ${next.position[2]}`,
            targetIds: [id],
          }
        },
        'move',
        actor,
      ),

    rotateObject: (id, rotation, actor = HUMAN_ACTOR) =>
      change(
        (scene) => {
          const object = findObject(scene, id)
          if (!object || object.locked) return null
          const next = applyTransformPatch(object, { rotation }, scene.environment)
          return {
            scene: replaceObject(scene, { ...next, metadata: touchMetadata(object.metadata, actor) }),
            label: `Rotated ${object.label} → ${Math.round(toDegrees(next.rotation[1]))}° yaw`,
            targetIds: [id],
          }
        },
        'rotate',
        actor,
      ),

    scaleObject: (id, scale, actor = HUMAN_ACTOR) =>
      change(
        (scene) => {
          const object = findObject(scene, id)
          if (!object || object.locked) return null
          const next = applyTransformPatch(object, { scale }, scene.environment)
          return {
            scene: replaceObject(scene, { ...next, metadata: touchMetadata(object.metadata, actor) }),
            label: `Scaled ${object.label} → ${roundTo(next.scale[0], 2)}×`,
            targetIds: [id],
          }
        },
        'scale',
        actor,
      ),

    deleteObject: (id, actor = HUMAN_ACTOR) => {
      const removed = findObject(get().scene, id)
      const done = change(
        (scene) => {
          const object = findObject(scene, id)
          if (!object) return null
          return {
            scene: withObjects(
              scene,
              scene.objects.filter((candidate) => candidate.id !== id),
            ),
            label: `Deleted ${object.label}`,
            targetIds: [id],
          }
        },
        'delete',
        actor,
        'warn',
      )

      if (done && removed) {
        set((state) => ({
          selectedId: state.selectedId === id ? null : state.selectedId,
          hoveredId: state.hoveredId === id ? null : state.hoveredId,
        }))
      }
      return done
    },

    duplicateObject: (id, actor = HUMAN_ACTOR) => {
      const before = get().scene
      const source = findObject(before, id)
      if (!source) return null

      const clone: SceneObject = {
        ...source,
        id: createId(source.type),
        label: `${source.label} copy`,
        position: clampToRoom(
          [source.position[0] + 0.8, source.position[1], source.position[2] + 0.8],
          source.dimensions,
          source.scale,
          before.environment.room,
          source.rotation,
        ),
        metadata: {
          ...source.metadata,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: actor,
          lastModifiedBy: actor,
          revision: 1,
        },
      }

      record(
        before,
        withObjects(before, [...before.objects, clone]),
        { kind: 'add', label: `Duplicated ${source.label}`, actor, targetIds: [clone.id] },
        'success',
      )
      set({ selectedId: clone.id })
      return clone.id
    },

    clearScene: (actor = HUMAN_ACTOR) => {
      const before = get().scene
      if (before.objects.length === 0) return
      record(
        before,
        withObjects(before, []),
        {
          kind: 'clear',
          label: `Cleared all ${before.objects.length} objects from the scene`,
          actor,
          targetIds: [],
        },
        'warn',
      )
      set({ selectedId: null, hoveredId: null })
    },

    selectObject: (id) => {
      if (get().selectedId === id) return
      const object = id ? findObject(get().scene, id) : null
      set((state) => ({
        selectedId: id,
        activity: object
          ? appendEntry(state.activity, {
              message: `Selected ${object.label}`,
              targetId: object.id,
            })
          : state.activity,
      }))
    },

    updateEnvironment: (patch, actor = HUMAN_ACTOR) => {
      const safe = sanitizeEnvironmentPatch(patch)
      if (Object.keys(safe).length === 0) return
      change(
        (scene) => {
          const environment = mergeEnvironment(scene.environment, safe)
          // A room resize changes the legal placement area. Move existing
          // objects to the nearest valid position in the same atomic change.
          const objects = safe.room
            ? scene.objects.map((object) =>
                applyTransformPatch(object, { position: object.position }, environment),
              )
            : scene.objects
          return {
            scene: { ...scene, objects, environment },
            label: `Updated environment · ${Object.keys(safe).join(', ')}`,
            targetIds: [],
          }
        },
        'environment',
        actor,
      )
    },

    updateConstraint: (id, patch, actor = HUMAN_ACTOR) =>
      change(
        (scene) => {
          const constraint = scene.constraints.find((c) => c.id === id)
          if (!constraint) return null
          return {
            scene: {
              ...scene,
              constraints: scene.constraints.map((c) => (c.id === id ? { ...c, ...patch } : c)),
            },
            label: `Updated constraint "${constraint.label}"`,
            targetIds: [],
          }
        },
        'update',
        actor,
      ),

    updateZone: (id, patch, actor = HUMAN_ACTOR) =>
      change(
        (scene) => {
          const zone = scene.zones.find((candidate) => candidate.id === id)
          if (!zone) return null
          return {
            scene: {
              ...scene,
              zones: scene.zones.map((candidate) =>
                candidate.id === id
                  ? { ...candidate, ...patch, bounds: { ...candidate.bounds, ...patch.bounds } }
                  : candidate,
              ),
            },
            label: `Updated zone "${zone.name}"`,
            targetIds: [],
          }
        },
        'update',
        actor,
      ),

    loadScene: (scene, actor = SYSTEM_ACTOR) => {
      const before = get().scene
      record(
        before,
        scene,
        {
          kind: 'load',
          label: `Loaded "${scene.name}" · ${scene.objects.length} objects`,
          actor,
          targetIds: [],
        },
        'success',
      )
      set({ selectedId: null, hoveredId: null })
    },

    resetScene: (actor = HUMAN_ACTOR) => {
      const before = get().scene
      record(
        before,
        createEmptyWorld(),
        {
          kind: 'load',
          label: 'Reset to an empty room',
          actor,
          targetIds: [],
        },
        'warn',
      )
      set({ selectedId: null, hoveredId: null })
    },

    startFresh: (actor = HUMAN_ACTOR) => {
      const before = get().scene
      clearPersistedWorld()
      record(
        before,
        createEmptyWorld(),
        {
          kind: 'load',
          label: 'Started fresh — the room and the saved copy are both empty now',
          actor,
          targetIds: [],
        },
        'warn',
      )
      set({ selectedId: null, hoveredId: null })
    },

    /**
     * Replaces the arrangement without touching the room or its rules.
     *
     * One undoable change, so trying a layout and going back is a single step.
     */
    generateLayout: (layoutId, actor = HUMAN_ACTOR) => {
      const before = get().scene
      const definition = getLayout(layoutId)
      const built = buildLayout(layoutId, before.environment.room)
      if (!definition || !built) return false

      record(
        before,
        { ...before, objects: built.objects, zones: built.zones },
        {
          kind: 'load',
          label: `Generated the ${definition.name} layout · ${built.objects.length} objects`,
          actor,
          targetIds: [],
        },
        'success',
      )
      set({ selectedId: null, hoveredId: null })
      return true
    },

    /**
     * Applies a batch of transforms in one shot.
     *
     * A layout strategy can touch a dozen objects; folding them into a single
     * history entry means a person reviewing an agent's optimisation undoes it
     * with one Ctrl+Z rather than twelve.
     */
    applyLayout: (assignments, label, actor = HUMAN_ACTOR) => {
      const before = get().scene
      const wanted = new Map(assignments.map((assignment) => [assignment.id, assignment]))
      let applied = 0

      const objects = before.objects.map((object) => {
        const assignment = wanted.get(object.id)
        if (!assignment || object.locked) return object

        const next = applyTransformPatch(
          object,
          { position: assignment.position, rotation: assignment.rotation },
          before.environment,
        )
        if (
          sameVec(next.position, object.position) &&
          sameVec(next.rotation, object.rotation) &&
          sameVec(next.scale, object.scale)
        ) {
          return object
        }

        applied += 1
        return { ...next, metadata: touchMetadata(object.metadata, actor) }
      })

      if (applied === 0) return 0

      record(
        before,
        withObjects(before, objects),
        {
          kind: 'update',
          label: `${label} · ${applied} object${applied === 1 ? '' : 's'}`,
          actor,
          targetIds: assignments.map((assignment) => assignment.id),
        },
        'success',
      )
      return applied
    },

    // ---- interactive editing ---------------------------------------------

    previewTransform: (id, patch) => {
      stagePreview(id, (object, scene) => applyTransformPatch(object, patch, scene.environment))
    },

    previewUpdate: (id, patch) => {
      stagePreview(id, (object) => ({ ...object, ...patch }))
    },

    commitPreview: (actor = HUMAN_ACTOR) => {
      const { pending, scene } = get()
      if (!pending) return

      if (isNoopChange(pending.before, scene, pending.targetIds)) {
        set({ pending: null })
        return
      }

      const id = pending.targetIds[0]
      const object = id ? findObject(scene, id) : undefined
      const kind = diffKind(id ? findObject(pending.before, id) : undefined, object)
      const stamped = object
        ? replaceObject(scene, { ...object, metadata: touchMetadata(object.metadata, actor) })
        : scene

      record(pending.before, stamped, {
        kind,
        label: describeCommit(kind, object),
        actor,
        targetIds: pending.targetIds,
      })
    },

    discardPreview: () => {
      const { pending } = get()
      if (!pending) return
      set({ scene: pending.before, pending: null })
    },

    // ---- history ----------------------------------------------------------

    undo: () => {
      const { history } = get()
      const entry = history.past.at(-1)
      if (!entry) return false

      set((state) => ({
        ...restore(entry.before)(state),
        history: {
          ...state.history,
          past: state.history.past.slice(0, -1),
          future: [entry, ...state.history.future].slice(0, state.history.limit),
        },
        activity: appendEntry(state.activity, {
          message: `Undid: ${entry.label}`,
          level: 'warn',
          changeId: entry.id,
        }),
      }))
      return true
    },

    redo: () => {
      const { history } = get()
      const entry = history.future[0]
      if (!entry) return false

      set((state) => ({
        ...restore(entry.after)(state),
        history: {
          ...state.history,
          past: [...state.history.past, entry].slice(-state.history.limit),
          future: state.history.future.slice(1),
        },
        activity: appendEntry(state.activity, {
          message: `Redid: ${entry.label}`,
          level: 'success',
          changeId: entry.id,
        }),
      }))
      return true
    },

    canUndo: () => get().history.past.length > 0,
    canRedo: () => get().history.future.length > 0,

    // ---- ui-only ----------------------------------------------------------

    setHovered: (id) => {
      if (get().hoveredId === id) return
      set({ hoveredId: id })
    },

    setTransformMode: (mode) => {
      if (get().transformMode === mode) return
      set({ transformMode: mode })
    },

    log: (input) => set((state) => ({ activity: appendEntry(state.activity, input) })),

    clearActivity: () =>
      set({
        activity: [
          makeEntry({ message: 'Activity console cleared.', actor: SYSTEM_ACTOR }),
        ],
      }),

    // ---- WebMCP transport --------------------------------------------------

    setMcpState: (patch) => set((state) => ({ mcp: { ...state.mcp, ...patch } })),

    /**
     * Records one tool invocation on the timeline.
     *
     * Called for every WebMCP call, successful or not — the console is the
     * human's window onto what an agent actually did, so a failed call has to
     * be as visible as a successful one.
     */
    recordToolCall: (toolRecord, agentName) =>
      set((state) => ({
        mcp: { ...state.mcp, callCount: state.mcp.callCount + 1 },
        activity: appendEntry(state.activity, {
          message: toolRecord.success
            ? `${toolRecord.tool} succeeded in ${toolRecord.durationMs} ms`
            : `${toolRecord.tool} failed: ${describeToolError(toolRecord.result)}`,
          actor: { kind: 'agent', name: agentName },
          level: toolRecord.success ? 'success' : 'error',
          tool: toolRecord,
        }),
      })),
  }
})

function describeToolError(result: unknown): string {
  if (result && typeof result === 'object' && 'error' in result) {
    const { error } = result as { error: unknown }
    if (typeof error === 'string') return error
  }
  return 'unknown error'
}

// ---------------------------------------------------------------------------
// Change descriptions
// ---------------------------------------------------------------------------

function describeUpdate(object: SceneObject, patch: ObjectPatch): string {
  if (patch.locked !== undefined) return `${patch.locked ? 'Locked' : 'Unlocked'} ${object.label}`
  if (patch.visible !== undefined) return `${patch.visible ? 'Showed' : 'Hid'} ${object.label}`
  if (patch.label !== undefined) return `Renamed ${object.label} → ${patch.label}`
  if (patch.color !== undefined) return `Recoloured ${object.label} → ${patch.color}`
  return `Updated ${object.label}`
}

function describeCommit(kind: ChangeKind, object?: SceneObject): string {
  if (!object) return 'Edited scene'
  switch (kind) {
    case 'move':
      return `Moved ${object.label} → x ${object.position[0]}, z ${object.position[2]}`
    case 'rotate':
      return `Rotated ${object.label} → ${Math.round(toDegrees(object.rotation[1]))}° yaw`
    case 'scale':
      return `Scaled ${object.label} → ${roundTo(object.scale[0], 2)}×`
    default:
      return `Edited ${object.label}`
  }
}

// Persist the world as it changes. Registered here so every path — human edits,
// agent tools, layout generation, undo — is covered by one subscription.
watchWorld((listener) =>
  useSceneStore.subscribe((state, previous) => {
    if (state.scene !== previous.scene) listener(state.scene)
  }),
)
