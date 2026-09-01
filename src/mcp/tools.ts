import { useSceneStore, worldApi } from '@/state'
import {
  ENVIRONMENT_PRESET_NAMES,
  getAssetDefinition,
  scaleForSize,
  sizeOf,
} from '@/tools'
import { OPTIMIZE_STRATEGIES, evaluateConstraints, planOptimization } from '@/spatial'
import { agentActor, type SceneObject, type Vec3 } from '@/types'
import { roundTo, toDegrees } from '@/utils'
import {
  asRecord,
  optionalIdList,
  requireAssetType,
  requireColor,
  requireObject,
  requirePosition,
  requirePreset,
  assetKindDescription,
  requireRotation,
  requireSize,
  requireStrategy,
  requireString,
  type Validated,
} from './validation'
import { SCENARIO_TOOLS } from './scenarioTools'
import { PROPOSAL_TOOLS } from './proposalTools'

/**
 * The SynSpace tool surface.
 *
 * Every tool is a thin, validated shell over a centralized state action — no
 * tool reaches into the renderer, and none of them hold state of their own. The
 * scene remains the single source of truth, so a human dragging an object and
 * an agent calling `move_3d_asset` are the same operation from the store's
 * point of view.
 */

export type ToolOutcome =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string }

export interface SynSpaceTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  run: (input: unknown) => ToolOutcome
}

/** All agent-driven changes are attributed to this actor. */
export const AGENT_ACTOR = agentActor('Agent')

const store = () => useSceneStore.getState()
const fail = (error: string): ToolOutcome => ({ ok: false, error })
const done = (data: Record<string, unknown>): ToolOutcome => ({ ok: true, data })

/** Unwraps a validator, short-circuiting into a tool error. */
function check<T>(result: Validated<T>): { ok: true; value: T } | { ok: false; outcome: ToolOutcome } {
  return result.ok ? { ok: true, value: result.value } : { ok: false, outcome: fail(result.error) }
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

const positionOf = (object: SceneObject) => ({
  x: roundTo(object.position[0], 3),
  y: roundTo(object.position[1], 3),
  z: roundTo(object.position[2], 3),
})

// ---------------------------------------------------------------------------
// Shared schema fragments
// ---------------------------------------------------------------------------

const NUMBER = { type: 'number' } as const
const OBJECT_ID = {
  type: 'string',
  description: 'Id of an existing object, as returned by read_scene_graph.',
} as const
const ROTATION = {
  description:
    'Rotation in DEGREES. Either a single number for yaw, or [x, y, z]. 0 faces +Z.',
  anyOf: [
    { type: 'number' },
    { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
  ],
} as const

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const spawnAsset: SynSpaceTool = {
  name: 'spawn_3d_asset',
  description:
    'Place a new object into the world at a floor position. Optionally size it in metres (width_m/height_m/depth_m) and give it a label, which buildings and hospitals show as signage. Returns the created object id.',
  inputSchema: {
    type: 'object',
    properties: {
      model_type: { type: 'string', description: assetKindDescription('Kind of asset to place.') },
      x: { ...NUMBER, description: 'Metres along X from the room centre.' },
      y: { ...NUMBER, description: 'Height in metres. Use 0 to stand on the floor.' },
      z: { ...NUMBER, description: 'Metres along Z from the room centre.' },
      rotation: ROTATION,
      color: { type: 'string', description: 'Optional 6-digit hex accent colour, e.g. "#4f8cff".' },
      label: {
        type: 'string',
        description:
          'Optional display name. Buildings and hospitals render this as signage on the front of the model, so a name like "City Hospital" or "Riverside Tower" is visible in the 3D world.',
      },
      width_m: {
        ...NUMBER,
        description:
          'Optional real-world width in metres. The asset kit is fixed; sizing an instance is how you get a tower rather than a shop from the same building model.',
      },
      height_m: { ...NUMBER, description: 'Optional real-world height in metres.' },
      depth_m: { ...NUMBER, description: 'Optional real-world depth in metres.' },
    },
    required: ['model_type', 'x', 'z'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const type = check(requireAssetType(args.value))
    if (!type.ok) return type.outcome
    const position = check(requirePosition(args.value))
    if (!position.ok) return position.outcome
    const rotation = check(requireRotation(args.value, 'rotation', { optional: true }))
    if (!rotation.ok) return rotation.outcome
    const color = check(requireColor(args.value))
    if (!color.ok) return color.outcome
    const label = check(requireString(args.value, 'label', { optional: true }))
    if (!label.ok) return label.outcome
    const width = check(requireSize(args.value, 'width_m'))
    if (!width.ok) return width.outcome
    const height = check(requireSize(args.value, 'height_m'))
    if (!height.ok) return height.outcome
    const depth = check(requireSize(args.value, 'depth_m'))
    if (!depth.ok) return depth.outcome

    const sized =
      width.value !== undefined || height.value !== undefined || depth.value !== undefined

    const id = store().addObject(
      type.value,
      {
        position: position.value as Vec3,
        rotation: rotation.value,
        color: color.value,
        label: label.value,
        scale: sized
          ? scaleForSize(type.value, {
              width: width.value,
              height: height.value,
              depth: depth.value,
            })
          : undefined,
      },
      AGENT_ACTOR,
    )

    const created = store().scene.objects.find((object) => object.id === id)
    if (!created) return fail('The object could not be created.')

    const definition = getAssetDefinition(created.type)
    const requested = position.value as Vec3
    const clamped =
      Math.abs(requested[0] - created.position[0]) > 0.001 ||
      Math.abs(requested[2] - created.position[2]) > 0.001

    return done({
      object_id: created.id,
      type: created.type,
      label: created.label,
      position: positionOf(created),
      rotation_degrees: roundTo(toDegrees(created.rotation[1]), 1),
      dimensions_m: sizeOf(created),
      catalogue_dimensions_m: definition.dimensions,
      status: clamped ? 'created_clamped_to_room' : 'created',
      note: clamped
        ? 'The requested position fell outside the room, so it was clamped to the nearest valid spot.'
        : undefined,
    })
  },
}

const readSceneGraph: SynSpaceTool = {
  name: 'read_scene_graph',
  description:
    'Read the complete current state of the spatial world: coordinate system, room boundary, every object with its position, rotation, size, category and zone, the named zones, the active spatial constraints, and the environment. Always reflects the latest human edits.',
  inputSchema: {
    type: 'object',
    properties: {
      model_type: {
        type: 'string',
        description: assetKindDescription('Optional filter — return only objects of this type.'),
      },
      zone_id: {
        type: 'string',
        description: 'Optional filter — return only objects inside this zone.',
      },
      object_id: {
        type: 'string',
        description:
          'Optional — when given, also return the spatial relationships and nearest neighbours for that object.',
      },
    },
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const world = worldApi.getWorld()
    const snapshot = worldApi.getWorldSnapshot(world)
    let views = worldApi.listObjectViews(world)

    if (args.value.model_type !== undefined) {
      const type = check(requireAssetType(args.value))
      if (!type.ok) return type.outcome
      views = views.filter((view) => view.type === type.value)
    }

    if (args.value.zone_id !== undefined) {
      const zoneId = check(requireString(args.value, 'zone_id'))
      if (!zoneId.ok) return zoneId.outcome
      if (!world.zones.some((zone) => zone.id === zoneId.value)) {
        return fail(
          `No zone with id "${zoneId.value}". Known zones: ${world.zones.map((z) => z.id).join(', ')}.`,
        )
      }
      views = views.filter((view) => view.zoneId === zoneId.value)
    }

    const counts: Record<string, number> = {}
    for (const object of world.objects) counts[object.type] = (counts[object.type] ?? 0) + 1

    const { environment } = world
    const boundary = worldApi.getBoundaryViolations(world)

    const payload: Record<string, unknown> = {
      world_id: snapshot.id,
      world_name: snapshot.name,
      metadata: {
        description: snapshot.metadata.description,
        tags: snapshot.metadata.tags,
        units: snapshot.metadata.units,
        revision: snapshot.metadata.revision,
        updated_at: snapshot.metadata.updatedAt,
      },
      coordinate_system: snapshot.coordinateSystem,
      room: {
        width_m: snapshot.bounds.width,
        depth_m: snapshot.bounds.depth,
        wall_height_m: snapshot.bounds.wallHeight,
        floor_area_sqm: roundTo(snapshot.bounds.width * snapshot.bounds.depth, 2),
        bounds: {
          x: [snapshot.bounds.outer.minX, snapshot.bounds.outer.maxX],
          z: [snapshot.bounds.outer.minZ, snapshot.bounds.outer.maxZ],
        },
      },
      boundary_violations: boundary.map((check_) => ({
        object_id: check_.objectId,
        label: check_.label,
        status: check_.status,
        overshoot_m: check_.overshoot,
      })),
      entrances: snapshot.entrances,
      emergency_exits: snapshot.emergencyExits,
      object_count: views.length,
      counts_by_type: counts,
      objects: views.map((view) => ({
        id: view.id,
        type: view.type,
        label: view.label,
        category: view.category,
        zone_id: view.zoneId,
        zone_name: view.zoneName,
        position: {
          x: roundTo(view.position[0], 3),
          y: roundTo(view.position[1], 3),
          z: roundTo(view.position[2], 3),
        },
        rotation_degrees: {
          x: roundTo(toDegrees(view.rotation[0]), 1),
          y: roundTo(toDegrees(view.rotation[1]), 1),
          z: roundTo(toDegrees(view.rotation[2]), 1),
        },
        scale: { x: view.scale[0], y: view.scale[1], z: view.scale[2] },
        dimensions_m: {
          width: view.footprint.width,
          height: roundTo(view.dimensions.height * view.scale[1], 3),
          depth: view.footprint.depth,
        },
        footprint_sqm: view.footprint.areaSqm,
        bounds: view.bounds,
        properties: view.properties,
        tags: view.tags,
        boundary: view.boundary,
        locked: view.locked,
        visible: view.visible,
        /** Provenance: lets an agent tell its own edits from the human's. */
        last_modified_by: view.lastModifiedBy.kind,
        last_modified_by_name: view.lastModifiedBy.name,
        created_by: view.createdBy.kind,
        revision: view.revision,
      })),
      zones: worldApi.listZoneSummaries(world).map((zone) => ({
        id: zone.id,
        name: zone.name,
        kind: zone.kind,
        description: zone.description,
        bounds: zone.bounds,
        centre: zone.centre,
        area_sqm: zone.areaSqm,
        object_count: zone.objectCount,
        object_ids: zone.objectIds,
        disallowed_types: zone.disallowedTypes,
        capacity: zone.capacity,
        intrusion_ids: zone.intrusionIds,
      })),
      constraints: world.constraints.map((constraint) => ({
        id: constraint.id,
        kind: constraint.kind,
        label: constraint.label,
        description: constraint.description,
        value: constraint.value,
        unit: constraint.unit,
        severity: constraint.severity,
        enabled: constraint.enabled,
        applies_to: constraint.appliesTo,
      })),
      environment: {
        preset: environment.preset,
        background_color: environment.backgroundColor,
        ambient_intensity: environment.ambientIntensity,
        ambient_color: environment.ambientColor,
        key_light_intensity: environment.keyLightIntensity,
        key_light_color: environment.keyLightColor,
        shadows_enabled: environment.shadowsEnabled,
        show_grid: environment.showGrid,
        show_room: environment.showRoom,
        show_labels: environment.showLabels,
        show_zones: environment.showZones,
        show_boundary: environment.showBoundary,
        show_warnings: environment.showWarnings,
        show_paths: environment.showPaths,
      },
      selected_object_id: store().selectedId,
    }

    // Relationship detail is opt-in: computing it for every object would bloat
    // the payload for the common "what is in the room" question.
    if (args.value.object_id !== undefined) {
      const focusId = check(requireString(args.value, 'object_id'))
      if (!focusId.ok) return focusId.outcome
      const focus = worldApi.getObjectView(focusId.value as string, world)
      if (!focus) return fail(`No object with id "${focusId.value}".`)

      payload.focus = {
        object_id: focus.id,
        label: focus.label,
        zone_id: focus.zoneId,
        relationships: worldApi.getRelationships(focus.id, world).map((relation) => ({
          kind: relation.kind,
          target_kind: relation.targetKind,
          target_id: relation.objectId,
          label: relation.label,
          distance_m: relation.distance,
        })),
        nearest: worldApi.getNeighbours(focus.id, 5, world).map((neighbour) => ({
          object_id: neighbour.object.id,
          label: neighbour.object.label,
          gap_m: neighbour.gap,
          centre_distance_m: neighbour.centreDistance,
        })),
      }
    }

    return done(payload)
  },
}

const moveAsset: SynSpaceTool = {
  name: 'move_3d_asset',
  description:
    'Move an existing object to an absolute floor position, in metres from the room centre.',
  inputSchema: {
    type: 'object',
    properties: {
      object_id: OBJECT_ID,
      x: { ...NUMBER, description: 'Target X in metres.' },
      y: { ...NUMBER, description: 'Target height in metres. Usually 0.' },
      z: { ...NUMBER, description: 'Target Z in metres.' },
    },
    required: ['object_id', 'x', 'z'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const object = check(requireObject(store().scene.objects, args.value))
    if (!object.ok) return object.outcome
    const position = check(requirePosition(args.value))
    if (!position.ok) return position.outcome

    if (object.value.locked) {
      return fail(`"${object.value.label}" is locked and cannot be moved.`)
    }

    const from = positionOf(object.value)
    const moved = store().moveObject(object.value.id, position.value as Vec3, AGENT_ACTOR)
    if (!moved) return fail(`Could not move "${object.value.id}".`)

    const after = store().scene.objects.find((o) => o.id === object.value.id)!
    const requested = position.value as Vec3
    const clamped =
      Math.abs(requested[0] - after.position[0]) > 0.001 ||
      Math.abs(requested[2] - after.position[2]) > 0.001

    return done({
      object_id: after.id,
      label: after.label,
      from,
      to: positionOf(after),
      status: clamped ? 'moved_clamped_to_room' : 'moved',
    })
  },
}

const rotateAsset: SynSpaceTool = {
  name: 'rotate_3d_asset',
  description: 'Rotate an existing object. Rotation is absolute, in degrees.',
  inputSchema: {
    type: 'object',
    properties: { object_id: OBJECT_ID, rotation: ROTATION },
    required: ['object_id', 'rotation'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const object = check(requireObject(store().scene.objects, args.value))
    if (!object.ok) return object.outcome
    const rotation = check(requireRotation(args.value))
    if (!rotation.ok) return rotation.outcome

    if (object.value.locked) {
      return fail(`"${object.value.label}" is locked and cannot be rotated.`)
    }

    const before = roundTo(toDegrees(object.value.rotation[1]), 1)
    const rotated = store().rotateObject(object.value.id, rotation.value as Vec3, AGENT_ACTOR)
    if (!rotated) return fail(`Could not rotate "${object.value.id}".`)

    const after = store().scene.objects.find((o) => o.id === object.value.id)!
    return done({
      object_id: after.id,
      label: after.label,
      from_degrees: before,
      to_degrees: roundTo(toDegrees(after.rotation[1]), 1),
      status: 'rotated',
    })
  },
}

const deleteAsset: SynSpaceTool = {
  name: 'delete_3d_asset',
  description: 'Permanently remove an object from the workspace. Undoable by the human.',
  inputSchema: {
    type: 'object',
    properties: { object_id: OBJECT_ID },
    required: ['object_id'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const object = check(requireObject(store().scene.objects, args.value))
    if (!object.ok) return object.outcome

    const { id, label, type } = object.value
    const removed = store().deleteObject(id, AGENT_ACTOR)
    if (!removed) return fail(`Could not delete "${id}".`)

    return done({
      object_id: id,
      label,
      type,
      status: 'deleted',
      remaining_objects: store().scene.objects.length,
    })
  },
}

const checkConstraints: SynSpaceTool = {
  name: 'check_constraints',
  description:
    'Analyse the current layout against the active spatial rules: object collisions, walkway width, entrance clearance, emergency egress, object spacing and alignment. Returns structured violations.',
  inputSchema: {
    type: 'object',
    properties: {
      kinds: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'collision',
            'walkway-width',
            'entrance-clearance',
            'exit-clearance',
            'object-spacing',
            'alignment',
          ],
        },
        description: 'Optional filter — only report these constraint kinds.',
      },
    },
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    let kinds: string[] | undefined
    if (args.value.kinds !== undefined) {
      const list = check(optionalIdList(args.value, 'kinds'))
      if (!list.ok) return list.outcome
      kinds = list.value
    }

    const report = evaluateConstraints(store().scene)
    const violations = kinds
      ? report.violations.filter((violation) => kinds.includes(violation.kind))
      : report.violations

    return done({
      compliant: violations.length === 0,
      constraints_checked: report.checked,
      violation_count: violations.length,
      summary: report.summary,
      violations: violations.map((violation) => ({
        constraint_id: violation.constraintId,
        kind: violation.kind,
        severity: violation.severity,
        message: violation.message,
        object_ids: violation.objectIds,
        measured: violation.measured,
        required: violation.required,
        at: violation.at ? { x: violation.at[0], z: violation.at[1] } : undefined,
      })),
    })
  },
}

const optimizeLayout: SynSpaceTool = {
  name: 'optimize_layout',
  description:
    'Improve the layout with a deterministic strategy. grid_align squares everything to a 0.5 m grid; clear_walkways opens circulation and doorways; improve_spacing separates crowded objects; circle_cluster arranges seating in a ring. Applies as a single undoable change.',
  inputSchema: {
    type: 'object',
    properties: {
      strategy: { type: 'string', enum: [...OPTIMIZE_STRATEGIES] },
      object_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional — restrict the strategy to these objects.',
      },
      model_type: {
        type: 'string',
        description: assetKindDescription('Optional — restrict the strategy to one asset type.'),
      },
    },
    required: ['strategy'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const strategy = check(requireStrategy(args.value))
    if (!strategy.ok) return strategy.outcome
    const ids = check(optionalIdList(args.value))
    if (!ids.ok) return ids.outcome

    let modelType
    if (args.value.model_type !== undefined) {
      const type = check(requireAssetType(args.value))
      if (!type.ok) return type.outcome
      modelType = type.value
    }

    if (ids.value) {
      const known = new Set(store().scene.objects.map((object) => object.id))
      const unknown = ids.value.filter((id) => !known.has(id))
      if (unknown.length > 0) return fail(`Unknown object ids: ${unknown.join(', ')}.`)
    }

    const sceneBefore = store().scene
    const before = evaluateConstraints(sceneBefore)
    const plan = planOptimization(sceneBefore, strategy.value, {
      objectIds: ids.value,
      modelType,
    })

    if (plan.changes.length === 0) {
      return done({
        strategy: strategy.value,
        changes_made: 0,
        objects_affected: [],
        skipped: plan.skipped,
        constraints_improved: { before: before.summary, after: before.summary, resolved: [] },
        status: 'no_changes_needed',
      })
    }

    const applied = store().applyLayout(
      plan.changes.map((change) => ({
        id: change.id,
        position: change.to.position,
        rotation: change.to.rotation,
      })),
      `Optimised layout (${strategy.value})`,
      AGENT_ACTOR,
    )

    const after = evaluateConstraints(store().scene)
    const beforeKeys = new Set(
      before.violations.map((v) => `${v.kind}:${[...v.objectIds].sort().join('+')}`),
    )
    const afterKeys = new Set(
      after.violations.map((v) => `${v.kind}:${[...v.objectIds].sort().join('+')}`),
    )
    const resolved = before.violations.filter(
      (v) => !afterKeys.has(`${v.kind}:${[...v.objectIds].sort().join('+')}`),
    )
    const introduced = after.violations.filter(
      (v) => !beforeKeys.has(`${v.kind}:${[...v.objectIds].sort().join('+')}`),
    )

    return done({
      strategy: strategy.value,
      changes_made: applied,
      objects_affected: plan.changes.map((change) => ({
        object_id: change.id,
        label: change.label,
        from: { x: roundTo(change.from.position[0], 3), z: roundTo(change.from.position[2], 3) },
        to: { x: roundTo(change.to.position[0], 3), z: roundTo(change.to.position[2], 3) },
        rotation_degrees: roundTo(toDegrees(change.to.rotation[1]), 1),
        reason: change.reason,
      })),
      skipped: plan.skipped,
      constraints_improved: {
        before: before.summary,
        after: after.summary,
        resolved_count: resolved.length,
        resolved: resolved.slice(0, 20).map((v) => ({ kind: v.kind, message: v.message })),
        introduced_count: introduced.length,
        introduced: introduced.slice(0, 20).map((v) => ({ kind: v.kind, message: v.message })),
      },
      status: 'applied',
    })
  },
}

const changeEnvironment: SynSpaceTool = {
  name: 'change_environment_variables',
  description:
    'Switch the workspace lighting mood. daytime is bright and neutral, sunset is warm and low, cyberpunk is dark with magenta and violet light.',
  inputSchema: {
    type: 'object',
    properties: {
      preset: { type: 'string', enum: ENVIRONMENT_PRESET_NAMES },
      shadows_enabled: { type: 'boolean', description: 'Optional shadow toggle.' },
    },
    required: ['preset'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const preset = check(requirePreset(args.value))
    if (!preset.ok) return preset.outcome

    const shadows = args.value.shadows_enabled
    if (shadows !== undefined && typeof shadows !== 'boolean') {
      return fail('"shadows_enabled" must be a boolean.')
    }

    const from = store().scene.environment.preset
    store().updateEnvironment(
      { preset: preset.value, ...(shadows === undefined ? {} : { shadowsEnabled: shadows }) },
      AGENT_ACTOR,
    )

    const environment = store().scene.environment
    return done({
      from_preset: from,
      preset: environment.preset,
      background_color: environment.backgroundColor,
      ambient_intensity: environment.ambientIntensity,
      ambient_color: environment.ambientColor,
      key_light_intensity: environment.keyLightIntensity,
      key_light_color: environment.keyLightColor,
      shadows_enabled: environment.shadowsEnabled,
      status: 'applied',
    })
  },
}

const clearCanvas: SynSpaceTool = {
  name: 'clear_canvas',
  description:
    'Remove every object from the workspace, leaving an empty room. Destructive — the human can undo it with one step. Requires confirm: true.',
  inputSchema: {
    type: 'object',
    properties: {
      confirm: {
        type: 'boolean',
        description: 'Must be true. Guards against clearing the room by accident.',
      },
    },
    required: ['confirm'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    if (args.value.confirm !== true) {
      return fail(
        'clear_canvas removes every object. Call again with confirm: true if that is intended.',
      )
    }

    const removed = store().scene.objects.length
    if (removed === 0) {
      return done({ removed_count: 0, status: 'already_empty' })
    }

    store().clearScene(AGENT_ACTOR)
    return done({
      removed_count: removed,
      remaining_objects: store().scene.objects.length,
      status: 'cleared',
      note: 'The human can restore this with a single undo.',
    })
  },
}

export const SYNSPACE_TOOLS: SynSpaceTool[] = [
  spawnAsset,
  readSceneGraph,
  moveAsset,
  rotateAsset,
  deleteAsset,
  checkConstraints,
  optimizeLayout,
  changeEnvironment,
  clearCanvas,
  ...SCENARIO_TOOLS,
  ...PROPOSAL_TOOLS,
]

export const TOOL_NAMES = SYNSPACE_TOOLS.map((tool) => tool.name)
