import { OPTIMIZE_STRATEGIES } from '@/spatial'
import {
  ASSET_CATEGORY_ORDER,
  BUILTIN_ASSET_TYPES,
  LAYOUTS,
  LAYOUT_IDS,
  MAX_PARTS,
  PART_FINISHES,
  PART_SHAPES,
  allAssetDefinitions,
  buildCustomAsset,
  getLayout,
  scaleForSize,
  sizeOf,
} from '@/tools'
import { useProposalStore, useSceneStore } from '@/state'
import { toProposalView } from '@/proposals'
import type { AssetCategory, Proposal, ProposalView, ScenarioOperation, Vec3 } from '@/types'
import { agentActor } from '@/types'
import { roundTo } from '@/utils'
import type { SynSpaceTool, ToolOutcome } from './tools'
import {
  asRecord,
  requireObject,
  requirePosition,
  requireSize,
  requireStrategy,
  requireString,
  type Validated,
} from './validation'

/**
 * Collaboration tools.
 *
 * These are how an agent participates without taking the world over: it can
 * propose, explain and recalculate freely, but applying is gated on an explicit
 * human approval and on the proposal still matching the current world revision.
 */

const PROPOSAL_AGENT = agentActor('Agent')

const fail = (error: string): ToolOutcome => ({ ok: false, error })
const done = (data: Record<string, unknown>): ToolOutcome => ({ ok: true, data })
const proposals = () => useProposalStore.getState()
const world = () => useSceneStore.getState().scene

function check<T>(result: Validated<T>): { ok: true; value: T } | { ok: false; outcome: ToolOutcome } {
  return result.ok ? { ok: true, value: result.value } : { ok: false, outcome: fail(result.error) }
}

function serializeProposal(proposal: Proposal): Record<string, unknown> {
  const view: ProposalView = toProposalView(proposal, world())
  return {
    proposal_id: view.id,
    title: view.title,
    summary: view.summary,
    explanation: view.explanation,
    status: view.status,
    stale: view.stale,
    can_apply: view.canApply,
    requires_human_approval: view.status === 'pending',
    base_world_revision: view.baseWorldRevision,
    current_world_revision: view.currentWorldRevision,
    operation_count: view.operations.length,
    affected_object_ids: view.affectedObjectIds,
    preserved_object_ids: view.preservedObjectIds,
    expected_benefits: view.expectedBenefits.map((benefit) => ({
      label: benefit.label,
      before: benefit.before,
      after: benefit.after,
      unit: benefit.unit,
      improved: benefit.improved,
    })),
    constraint_changes: {
      before: view.constraintChanges.before,
      after: view.constraintChanges.after,
      resolved: view.constraintChanges.resolved,
      introduced: view.constraintChanges.introduced,
    },
  }
}

/** Parses the `operations` array a proposal is built from. */
function parseOperations(raw: unknown): Validated<ScenarioOperation[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: '"operations" must be a non-empty array.' }
  }
  if (raw.length > 50) {
    return { ok: false, error: 'A proposal may contain at most 50 operations.' }
  }

  const operations: ScenarioOperation[] = []
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: `operations[${index}] must be an object.` }
    }
    const record = entry as Record<string, unknown>
    const kind = record.kind

    if (kind === 'move_object') {
      const target = requireObject(world().objects, record, 'object_id')
      if (!target.ok) return { ok: false, error: `operations[${index}]: ${target.error}` }
      const position = requirePosition(record)
      if (!position.ok) return { ok: false, error: `operations[${index}]: ${position.error}` }
      operations.push({
        kind: 'move_object',
        objectId: target.value.id,
        position: position.value as Vec3,
      })
      continue
    }

    if (kind === 'remove_object') {
      const target = requireObject(world().objects, record, 'object_id')
      if (!target.ok) return { ok: false, error: `operations[${index}]: ${target.error}` }
      operations.push({ kind: 'remove_object', objectId: target.value.id })
      continue
    }

    return {
      ok: false,
      error: `operations[${index}]: "kind" must be "move_object" or "remove_object".`,
    }
  }

  return { ok: true, value: operations }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const createProposal: SynSpaceTool = {
  name: 'create_proposal',
  description:
    'Propose a set of changes for the human to review. Nothing is applied: the proposal is simulated, compared against the live world, and returned with its expected benefits. Objects the human has fixed are rejected rather than silently moved.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short name for the proposal.' },
      summary: {
        type: 'string',
        description: 'One sentence a person can act on. Omit to generate one from the measured effect.',
      },
      operations: {
        type: 'array',
        description: 'The changes to simulate.',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['move_object', 'remove_object'] },
            object_id: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          required: ['kind', 'object_id'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'operations'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const title = check(requireString(args.value, 'title'))
    if (!title.ok) return title.outcome
    const summary = check(requireString(args.value, 'summary', { optional: true }))
    if (!summary.ok) return summary.outcome
    const operations = check(parseOperations(args.value.operations))
    if (!operations.ok) return operations.outcome

    const result = proposals().createProposal(
      { title: title.value as string, summary: summary.value, operations: operations.value },
      PROPOSAL_AGENT,
    )
    if (!result.ok) return fail(result.error)

    return done({
      ...serializeProposal(result.data),
      status_note:
        'Awaiting human approval. Call apply_proposal only after the human has approved it.',
    })
  },
}

const proposeLayoutFix: SynSpaceTool = {
  name: 'propose_layout_fix',
  description:
    'Work out a deterministic layout fix and return it as a proposal for the human to review. Fixed objects are never moved. Use after check_constraints reports a problem.',
  inputSchema: {
    type: 'object',
    properties: {
      strategy: { type: 'string', enum: [...OPTIMIZE_STRATEGIES] },
      title: { type: 'string', description: 'Optional proposal title.' },
    },
    required: ['strategy'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const strategy = check(requireStrategy(args.value))
    if (!strategy.ok) return strategy.outcome
    const title = check(requireString(args.value, 'title', { optional: true }))
    if (!title.ok) return title.outcome

    const result = proposals().createLayoutFixProposal(
      strategy.value,
      PROPOSAL_AGENT,
      title.value,
    )
    if (!result.ok) return fail(result.error)

    return done({
      ...serializeProposal(result.data),
      status_note:
        'Awaiting human approval. Call apply_proposal only after the human has approved it.',
    })
  },
}

const listProposals: SynSpaceTool = {
  name: 'list_proposals',
  description:
    'List every proposal with its status and whether it is still valid against the current world revision.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['pending', 'approved', 'rejected', 'applied', 'superseded'],
        description: 'Optional filter.',
      },
    },
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const status = args.value.status
    if (status !== undefined && typeof status !== 'string') {
      return fail('"status" must be a string.')
    }

    const all = proposals().proposals
    const filtered = status ? all.filter((proposal) => proposal.status === status) : all

    return done({
      current_world_revision: world().metadata.revision,
      proposal_count: filtered.length,
      proposals: filtered.map(serializeProposal),
    })
  },
}

const recalculateProposal: SynSpaceTool = {
  name: 'recalculate_proposal',
  description:
    'Rebuild a stale proposal against the current world. Use this when the human has changed the world since the proposal was created — the old proposal is superseded, never applied over newer work.',
  inputSchema: {
    type: 'object',
    properties: { proposal_id: { type: 'string' } },
    required: ['proposal_id'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const id = check(requireString(args.value, 'proposal_id'))
    if (!id.ok) return id.outcome

    const result = proposals().recalculateProposal(id.value as string, PROPOSAL_AGENT)
    if (!result.ok) return fail(result.error)

    return done({
      ...serializeProposal(result.data),
      recalculated_from: result.data.recalculatedFromId,
      status_note: 'Recalculated against the current world. Still awaiting human approval.',
    })
  },
}

const applyProposal: SynSpaceTool = {
  name: 'apply_proposal',
  description:
    'Apply a proposal the human has already approved. Fails if it has not been approved, or if the world has changed since it was computed. Applying is a single undoable step.',
  inputSchema: {
    type: 'object',
    properties: { proposal_id: { type: 'string' } },
    required: ['proposal_id'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const id = check(requireString(args.value, 'proposal_id'))
    if (!id.ok) return id.outcome

    const result = proposals().applyProposal(id.value as string, PROPOSAL_AGENT)
    if (!result.ok) return fail(result.error)

    return done({
      ...serializeProposal(result.data),
      status_note: 'Applied. The human can undo this in one step.',
    })
  },
}

const setObjectFixed: SynSpaceTool = {
  name: 'set_object_fixed',
  description:
    'Mark an object as fixed, or release it. A fixed object is never moved by optimisation or by any proposal. Use this to honour an instruction such as "keep this desk exactly where it is".',
  inputSchema: {
    type: 'object',
    properties: {
      object_id: { type: 'string' },
      fixed: { type: 'boolean', description: 'true to fix in place, false to release.' },
    },
    required: ['object_id', 'fixed'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const target = check(requireObject(world().objects, args.value))
    if (!target.ok) return target.outcome

    const fixed = args.value.fixed
    if (typeof fixed !== 'boolean') return fail('"fixed" must be a boolean.')

    if (target.value.locked === fixed) {
      return done({
        object_id: target.value.id,
        label: target.value.label,
        fixed,
        status: 'unchanged',
      })
    }

    const updated = useSceneStore
      .getState()
      .updateObject(target.value.id, { locked: fixed }, PROPOSAL_AGENT)
    if (!updated) return fail(`Could not update "${target.value.id}".`)

    return done({
      object_id: target.value.id,
      label: target.value.label,
      fixed,
      status: fixed ? 'fixed' : 'released',
      note: fixed
        ? 'This object will be preserved by every future proposal and optimisation.'
        : 'This object may now be moved by proposals and optimisation.',
    })
  },
}


const generateLayout: SynSpaceTool = {
  name: 'generate_layout',
  description:
    'Rebuild the world as a named kind of space — an office, classroom, cafe, clinic waiting room, data hall, retail floor or city district. Replaces the objects and zones in one undoable step and resizes the room to suit the layout, so a city district gets city-sized ground and a classroom does not. Use this when asked to build or change what kind of space this is, rather than placing objects one at a time. Call list_layouts first if you are unsure which one fits the request.',
  inputSchema: {
    type: 'object',
    properties: {
      layout: {
        type: 'string',
        enum: LAYOUT_IDS,
        description: 'Which arrangement to build.',
      },
    },
    required: ['layout'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const raw = args.value.layout
    if (typeof raw !== 'string') {
      return fail('"layout" must be one of: ' + LAYOUT_IDS.join(', ') + '.')
    }
    const definition = getLayout(raw.trim().toLowerCase())
    if (!definition) {
      return fail(
        'Unknown layout "' + raw + '". Available layouts: ' +
          LAYOUTS.map((l) => l.id + ' (' + l.matches.slice(0, 3).join(', ') + ')').join('; ') +
          '.',
      )
    }

    const before = useSceneStore.getState().scene
    const applied = useSceneStore.getState().generateLayout(definition.id, PROPOSAL_AGENT)
    if (!applied) return fail('Could not generate the ' + definition.name + ' layout.')

    const after = useSceneStore.getState().scene
    return done({
      layout: definition.id,
      name: definition.name,
      summary: definition.summary,
      objects_before: before.objects.length,
      objects_after: after.objects.length,
      zones: after.zones.map((z) => ({ id: z.id, name: z.name, kind: z.kind })),
      room: { width_m: after.environment.room.width, depth_m: after.environment.room.depth },
      world_revision: after.metadata.revision,
      status: 'generated',
      note: 'Run check_constraints next — a generated layout is a starting point, not a guarantee.',
    })
  },
}

const listLayouts: SynSpaceTool = {
  name: 'list_layouts',
  description:
    'List the arrangements generate_layout can build, with the kinds of request each one answers.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  run: () =>
    done({
      layouts: LAYOUTS.map((layout) => ({
        id: layout.id,
        name: layout.name,
        summary: layout.summary,
        matches: layout.matches,
        builds_room_of:
          layout.room === undefined
            ? 'keeps the current room'
            : `${layout.room.width}×${layout.room.depth} m`,
      })),
    }),
}

const resizeWorld: SynSpaceTool = {
  name: 'resize_world',
  description:
    'Change the size of the world itself — its floor width, depth and wall height, in metres. Use this when the scene you are asked for does not fit the current room: a classroom needs about 10×8 m, an open-plan office 18×14 m, a warehouse 40×30 m, and a city district 100×80 m or more. Enlarging is safe. Shrinking pulls any object that would end up outside back to the nearest legal spot, which can crowd them together, so run check_constraints afterwards. Range: 4–240 m per side, walls 2–40 m.',
  inputSchema: {
    type: 'object',
    properties: {
      width_m: {
        type: 'number',
        description: 'Floor width along X, in metres (4–240). Omit to leave unchanged.',
      },
      depth_m: {
        type: 'number',
        description: 'Floor depth along Z, in metres (4–240). Omit to leave unchanged.',
      },
      wall_height_m: {
        type: 'number',
        description: 'Wall height, in metres (2–40). Omit to leave unchanged.',
      },
      reason: { type: 'string', description: 'Why this size suits the world being built.' },
    },
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const scene = useSceneStore.getState()
    const current = scene.scene.environment.room

    const width = check(requireSize(args.value, 'width_m'))
    if (!width.ok) return width.outcome
    const depth = check(requireSize(args.value, 'depth_m'))
    if (!depth.ok) return depth.outcome
    const wallHeight = check(requireSize(args.value, 'wall_height_m'))
    if (!wallHeight.ok) return wallHeight.outcome
    const reason = check(requireString(args.value, 'reason', { optional: true }))
    if (!reason.ok) return reason.outcome

    if (width.value === undefined && depth.value === undefined && wallHeight.value === undefined) {
      return fail('Give at least one of width_m, depth_m or wall_height_m.')
    }

    const positionBefore = new Map(
      scene.scene.objects.map((object) => [object.id, object.position] as const),
    )

    // sanitizeEnvironmentPatch clamps to the supported range, so an
    // out-of-range request is corrected rather than rejected — and the result
    // reports what was actually applied.
    scene.updateEnvironment(
      {
        room: {
          width: width.value ?? current.width,
          depth: depth.value ?? current.depth,
          wallHeight: wallHeight.value ?? current.wallHeight,
        },
      },
      PROPOSAL_AGENT,
    )

    const after = useSceneStore.getState().scene
    const room = after.environment.room

    // Shrinking never leaves objects stranded outside the walls — the store
    // pulls them to the nearest legal spot in the same change. That is the
    // consequence worth reporting, because it can crowd things together.
    const moved = after.objects.filter((object) => {
      const was = positionBefore.get(object.id)
      return (
        was !== undefined &&
        (Math.abs(was[0] - object.position[0]) > 0.001 ||
          Math.abs(was[2] - object.position[2]) > 0.001)
      )
    })

    return done({
      room: { width_m: room.width, depth_m: room.depth, wall_height_m: room.wallHeight },
      floor_area_m2: roundTo(room.width * room.depth, 1),
      previous_room: {
        width_m: current.width,
        depth_m: current.depth,
        wall_height_m: current.wallHeight,
      },
      reason: reason.value,
      objects_moved_to_fit: moved.map((object) => ({
        object_id: object.id,
        label: object.label,
        moved_to: { x: roundTo(object.position[0], 3), z: roundTo(object.position[2], 3) },
      })),
      world_revision: after.metadata.revision,
      status: 'resized',
      note:
        moved.length > 0
          ? `${moved.length} object(s) no longer fitted and were pulled back inside the new boundary. Run check_constraints — they may now overlap.`
          : 'Nothing had to move.',
    })
  },
}

const resizeAsset: SynSpaceTool = {
  name: 'resize_3d_asset',
  description:
    'Resize an existing object to real-world metres. The asset kit is fixed and small on purpose — scaling instances is how one "building" model becomes a corner shop, a warehouse or a tower block, so reach for this instead of expecting a new asset type. Axes you omit are left alone.',
  inputSchema: {
    type: 'object',
    properties: {
      object_id: { type: 'string', description: 'Id of the object to resize.' },
      width_m: { type: 'number', description: 'Target width in metres (0.1–60).' },
      height_m: { type: 'number', description: 'Target height in metres (0.1–60).' },
      depth_m: { type: 'number', description: 'Target depth in metres (0.1–60).' },
    },
    required: ['object_id'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const id = check(requireString(args.value, 'object_id'))
    if (!id.ok) return id.outcome
    const width = check(requireSize(args.value, 'width_m'))
    if (!width.ok) return width.outcome
    const height = check(requireSize(args.value, 'height_m'))
    if (!height.ok) return height.outcome
    const depth = check(requireSize(args.value, 'depth_m'))
    if (!depth.ok) return depth.outcome

    if (width.value === undefined && height.value === undefined && depth.value === undefined) {
      return fail('Give at least one of width_m, height_m or depth_m.')
    }

    const scene = useSceneStore.getState()
    const target = scene.scene.objects.find((object) => object.id === id.value)
    if (!target) return fail(`No object with id "${String(id.value)}".`)
    if (target.locked) {
      return fail(`"${target.label}" is locked. Ask a human to unlock it, or propose the change.`)
    }

    const before = sizeOf(target)
    const changed = scene.scaleObject(
      target.id,
      scaleForSize(
        target.type,
        { width: width.value, height: height.value, depth: depth.value },
        target.scale,
      ),
      PROPOSAL_AGENT,
    )
    if (!changed) return fail(`"${target.label}" could not be resized.`)

    const after = useSceneStore.getState().scene
    const resized = after.objects.find((object) => object.id === target.id)
    if (!resized) return fail('The object disappeared while being resized.')

    return done({
      object_id: resized.id,
      label: resized.label,
      type: resized.type,
      size_m: sizeOf(resized),
      previous_size_m: before,
      scale: resized.scale,
      world_revision: after.metadata.revision,
      status: 'resized',
      note: 'Sizing does not move anything — run check_constraints if the object grew into its neighbours.',
    })
  },
}

const defineAsset: SynSpaceTool = {
  name: 'define_asset',
  description:
    'Create a new kind of asset from primitive solids, without any code change. Use this when the world needs something the built-in kit does not cover — a tree, a fountain, a bus shelter, a market stall, a wind turbine. Build it from boxes, cylinders, spheres and cones positioned in metres from the asset origin, which sits on the floor at the centre of the object (y is height above the floor). The overall footprint is measured from the parts you give, so the new kind takes part in collision, spacing and clearance checks exactly like a built-in one. Once defined it can be placed with spawn_3d_asset by its type name, as many times as you like — define once, place many. Defining the same type again replaces its shape for future placements.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description:
          'Type name in lowercase kebab-case, e.g. "tree" or "bus-shelter". This is what spawn_3d_asset takes as model_type. Cannot be a built-in kind.',
      },
      name: { type: 'string', description: 'Display name shown to people, e.g. "Oak Tree".' },
      category: {
        type: 'string',
        enum: ASSET_CATEGORY_ORDER,
        description: 'Which section of the asset library it belongs in.',
      },
      description: { type: 'string', description: 'One line on what it is and where it belongs.' },
      color: {
        type: 'string',
        description: 'Default 6-digit hex accent colour. Parts that set no colour of their own use it.',
      },
      clearance: {
        type: 'number',
        description: 'Optional clear space to keep around it, in metres. Derived from its size if omitted.',
      },
      signage_height_m: {
        type: 'number',
        description:
          'Optional. When set, the placed object’s label is painted onto the front face at this height in metres — good for anything that should read as a named place.',
      },
      parts: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_PARTS,
        description:
          'The solids it is built from. Sizes and positions are metres; the origin is on the floor at the object centre, so a 2 m post is size [0.2, 2, 0.2] at position [0, 1, 0].',
        items: {
          type: 'object',
          properties: {
            shape: { type: 'string', enum: PART_SHAPES, description: 'Which primitive solid.' },
            size: {
              type: 'array',
              items: { type: 'number' },
              minItems: 3,
              maxItems: 3,
              description:
                '[width, height, depth] in metres. For a cylinder or cone, width and depth are the diameters.',
            },
            position: {
              type: 'array',
              items: { type: 'number' },
              minItems: 3,
              maxItems: 3,
              description: '[x, y, z] offset of the part centre from the asset origin, in metres.',
            },
            rotation: {
              type: 'array',
              items: { type: 'number' },
              minItems: 3,
              maxItems: 3,
              description: 'Optional [x, y, z] rotation in radians.',
            },
            color: {
              type: 'string',
              description: 'Optional 6-digit hex. Omit to take the placed object’s accent colour.',
            },
            finish: {
              type: 'string',
              enum: PART_FINISHES,
              description: 'Optional surface treatment. Defaults to matte.',
            },
          },
          required: ['shape', 'size', 'position'],
          additionalProperties: false,
        },
      },
    },
    required: ['type', 'name', 'category', 'parts'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome

    const category = args.value.category
    if (typeof category !== 'string' || !ASSET_CATEGORY_ORDER.includes(category as AssetCategory)) {
      return fail(`"category" must be one of: ${ASSET_CATEGORY_ORDER.join(', ')}.`)
    }

    const built = buildCustomAsset(
      {
        type: String(args.value.type ?? ''),
        name: String(args.value.name ?? ''),
        category: category as AssetCategory,
        description: args.value.description as string | undefined,
        color: args.value.color as string | undefined,
        clearance: args.value.clearance as number | undefined,
        signageHeight: args.value.signage_height_m as number | undefined,
        parts: args.value.parts,
        definedBy: PROPOSAL_AGENT,
      },
      BUILTIN_ASSET_TYPES,
    )
    if ('error' in built) return fail(built.error)

    const scene = useSceneStore.getState()
    const replaced = (scene.scene.assetLibrary ?? []).some(
      (entry) => entry.type === built.definition.type,
    )
    if (!scene.defineAsset(built.definition, PROPOSAL_AGENT)) {
      return fail('The asset could not be defined.')
    }

    const after = useSceneStore.getState().scene
    return done({
      type: built.definition.type,
      name: built.definition.name,
      category: built.definition.category,
      // Measured from the parts, not taken on trust — this is the footprint
      // every constraint check will use.
      dimensions_m: built.definition.dimensions,
      clearance_m: built.definition.clearance,
      part_count: built.definition.parts.length,
      status: replaced ? 'redefined' : 'defined',
      world_revision: after.metadata.revision,
      note: replaced
        ? `Future placements use the new shape. The ${after.objects.filter((o) => o.type === built.definition.type).length} already placed keep their current size.`
        : `Place it with spawn_3d_asset using model_type "${built.definition.type}".`,
    })
  },
}

const listAssetTypes: SynSpaceTool = {
  name: 'list_asset_types',
  description:
    'List every asset kind that can be placed right now — the built-in kit plus anything defined with define_asset in this world — with its size, category and clearance. Call this before spawn_3d_asset when you are unsure whether a suitable kind already exists.',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ASSET_CATEGORY_ORDER,
        description: 'Optional filter — only kinds in this category.',
      },
    },
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome
    const filter = typeof args.value.category === 'string' ? args.value.category : null

    const world = useSceneStore.getState().scene
    const custom = new Set((world.assetLibrary ?? []).map((entry) => entry.type))
    const rows = allAssetDefinitions()
      .filter((definition) => !filter || definition.category === filter)
      .map((definition) => ({
        type: definition.type,
        name: definition.name,
        category: definition.category,
        description: definition.description,
        dimensions_m: definition.dimensions,
        clearance_m: definition.clearance,
        origin: custom.has(definition.type) ? 'defined_in_this_world' : 'built_in',
        placed_count: world.objects.filter((object) => object.type === definition.type).length,
      }))

    return done({
      asset_types: rows,
      built_in_count: rows.filter((row) => row.origin === 'built_in').length,
      defined_here_count: rows.filter((row) => row.origin === 'defined_in_this_world').length,
      note: 'If nothing here fits what you need, use define_asset to compose a new kind from primitives rather than approximating with the wrong one.',
    })
  },
}

const removeAssetType: SynSpaceTool = {
  name: 'remove_asset_type',
  description:
    'Remove a kind that was defined with define_asset. Refuses while any object of that kind is still placed, so the world can never reference a kind it no longer has — delete those objects first.',
  inputSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', description: 'The runtime-defined type to remove.' },
    },
    required: ['type'],
    additionalProperties: false,
  },
  run: (input) => {
    const args = check(asRecord(input))
    if (!args.ok) return args.outcome
    const type = check(requireString(args.value, 'type'))
    if (!type.ok) return type.outcome

    const name = String(type.value)
    if (BUILTIN_ASSET_TYPES.includes(name)) {
      return fail(`"${name}" is a built-in kind and cannot be removed.`)
    }

    const result = useSceneStore.getState().removeAssetType(name, PROPOSAL_AGENT)
    if (!result.ok && result.inUse > 0) {
      return fail(
        `${result.inUse} object(s) of kind "${name}" are still placed. Delete them first, then remove the kind.`,
      )
    }
    if (!result.ok) return fail(`No runtime-defined asset kind named "${name}".`)

    return done({
      type: name,
      status: 'removed',
      world_revision: useSceneStore.getState().scene.metadata.revision,
    })
  },
}

export const PROPOSAL_TOOLS: SynSpaceTool[] = [
  generateLayout,
  listLayouts,
  createProposal,
  proposeLayoutFix,
  listProposals,
  recalculateProposal,
  applyProposal,
  setObjectFixed,
  resizeWorld,
  resizeAsset,
  defineAsset,
  listAssetTypes,
  removeAssetType,
]
