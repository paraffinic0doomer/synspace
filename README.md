# SynSpace

### One world. Two minds.

An agent-native spatial workspace where humans and AI agents can inspect,
simulate and shape the same world.

A human edits the room directly; a WebMCP agent reads the same scene, reasons
about it against spatial constraints, and changes it through structured tools.
Both write to one centralized state, and every change is attributed, logged and
undoable — so an agent's work is as reviewable as a person's.

## Stack

React 19 · Vite 7 · TypeScript 5.7 (strict) · Tailwind CSS 4 · Three.js r180 ·
React Three Fiber 9 · Drei 10 · Zustand 5

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # deterministic spatial + scenario verification
npm run typecheck
npm run build      # tsc -b && vite build
npm run preview
```

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Header — identity, scene stats, transform tools, view state  │
├──────────┬────────────────────────────────────┬──────────────┤
│ Assets / │                                    │  Inspector   │
│ Outliner │        3D viewport                 │  (selection  │
│          │                                    │   or scene)  │
├──────────┴────────────────────────────────────┴──────────────┤
│ Console — Activity + tool log · Undo history · Agent roster   │
└──────────────────────────────────────────────────────────────┘
```

## Architecture

```
src/
  types/       Scene, transform, constraint, environment, history + actor model
  state/       Zustand store (single source of truth), selectors, sceneApi
  spatial/     Deterministic reasoning: geometry, occupancy grid, constraint
               evaluation, layout strategies. No React, no Three.js, no store.
  scenarios/   Isolated world simulation, metrics, comparison + recommendation
  mcp/         WebMCP layer: host detection, strict validation, 17 tools
  scene/       R3F rendering: viewport, camera rig, object node, environment
    assets/    Eight low-poly primitives + the type -> component registry
  tools/       Asset catalogue, placement maths, environment + constraint
               defaults, camera intents, shortcuts
  components/  Application chrome (layout, panels, UI primitives)
  utils/       Ids, maths, formatting
```

The one-way dependency that matters:

```
mcp/  ->  state/  ->  types/
  |         ^
  v         |
spatial/ ---+          scene/ (R3F) reads state/, and nothing reads scene/
```

`mcp/` and `spatial/` import no React and no Three.js. Swapping the 3D renderer
would not change a single tool definition.

Four rules hold the design together:

1. **One document is the source of truth.** `state.scene` holds objects,
   environment and constraints together. Nothing is rendered that is not in it.
2. **No scene data lives in a rendering component.** `SceneObjects` maps over
   `useSceneObjects()`; the starter layout is data in `tools/sceneTemplates.ts`.
3. **An asset is declared in exactly two places** — its metadata in
   `tools/assetCatalog.ts` and its geometry in `scene/assets/`. A ninth asset
   touches no panel, no store action and no viewport code.
4. **The state layer knows nothing about React or Three.js.** `state/sceneApi.ts`
   is a plain, result-returning facade over the store — the seam WebMCP tools
   will register against, so `document.modelContext` never touches the renderer.

Every object carries a unique id, type, position, rotation (Euler radians),
scale, base dimensions in metres, label, accent colour, lock/visibility flags,
and a `metadata` block recording who created it, who changed it last, when, and
its revision number.

### Actions

Atomic (the surface WebMCP will call), each taking an optional `ActorRef`:
`addObject`, `updateObject`, `moveObject`, `rotateObject`, `scaleObject`,
`deleteObject`, `duplicateObject`, `clearScene`, `selectObject`,
`updateEnvironment`, `updateConstraint`, `loadScene`, `resetScene`.

Interactive (what the UI uses during a gesture): `previewTransform` /
`previewUpdate` write live without touching history, then `commitPreview` folds
the whole gesture into one undo step. `discardPreview` abandons it.

### History

Undo is snapshot-based: each entry holds the whole `Scene` before and after.
Because updates are immutable, unchanged objects are shared by reference between
snapshots, so a snapshot costs one array and a few pointers — far cheaper, and
far less bug-prone, than maintaining an inverse for every action. Entries are
capped at 60 and record the actor, so the History tab shows at a glance which
changes were a person's and which were an agent's.

A committed change is classified by *diffing* the object, not by inspecting the
patch: the gizmo always writes position, rotation and scale together, so only
the diff can tell a translate drag from a rotate drag.

## Interaction

| Action | How |
| --- | --- |
| Select | Click in the viewport, or a row in the outliner |
| Deselect | Click empty space, or `Esc` |
| Move / Rotate / Scale | Viewport gizmo, or the inspector's numeric fields (drag the axis tag to scrub) |
| Switch gizmo | `W` · `E` · `R` |
| Frame selection | `F`, or double-click an outliner row |
| Duplicate | `Ctrl/Cmd + D` |
| Delete | `Delete` / `Backspace`, or the row/inspector button |
| Undo / Redo | `Ctrl/Cmd + Z` / `Ctrl/Cmd + Shift + Z` |
| Toggle snapping | `X` (0.25 m / 15°) |
| Toggle labels | `L` |
| Reset view | `Home` |
| Orbit · Pan · Zoom | Drag · right-drag · scroll |

Objects are clamped inside the room bounds, and locked objects reject both gizmo
and inspector edits. A whole gizmo drag, numeric scrub or typed rename is a
single undo step, not one per frame or keystroke.

The bottom console has three tabs: **Activity** (the full narrative, including
selections and undos), **History** (the undo stack itself), and **Agents**.

## Scene

Perspective camera with damped OrbitControls, a fading construction grid, a
shadow-catching floor slab, and a room shell drawn as a single inverted box —
`BackSide` culls the walls between the camera and the room, so the floor stays
readable from any angle without per-wall visibility logic.

Lighting is one shadow-casting key light (a single 2048² map), a cool
directional fill, a warm point bounce, and an environment map generated locally
from Drei `Lightformer`s — no HDRI download, so the app runs fully offline.

## WebMCP

### Turning it on

No browser ships WebMCP enabled today. Chrome 152 does **not** expose it even
with `--enable-features=WebMCP` — the feature is not compiled into stable
builds, so the flag is a no-op. A plain load therefore shows
`webmcp: unavailable`, which is correct behaviour rather than a fault.

To exercise the tool surface locally:

```bash
npm run dev
# then open
http://localhost:5173/?webmcp=1
```

That loads `@mcp-b/global`, the W3C WebMCP polyfill, and SynSpace registers
against it with no code path changed. The status line reads
`document.modelContext (polyfill)` — it never claims native support. The
preference sticks; `?webmcp=0` clears it.

Guards keep it out of the product: it is a devDependency, imported dynamically,
behind `import.meta.env.DEV`, and inert unless explicitly requested. The
production bundle contains no trace of it.

Once a host is present, drive the tools from the page's own context:

```js
await document.modelContext.getTools()            // 23 tools
await navigator.modelContextTesting.executeTool(  // run one
  'read_scene_graph', '{}',
)
```

Other routes to a host: the MCP-B browser extension, or a Chromium build where
WebMCP is actually compiled in.

Tools are registered on `document.modelContext.registerTool` when the browser
exposes a host (`navigator.modelContext`, now deprecated in the spec, and
`window.modelContext` are also checked). Unregistration uses the `AbortSignal`
the standard passes to `registerTool` — `ModelContext` has no `unregisterTool`. SynSpace ships
no polyfill: with no host, detection reports `unavailable`, the header and
console say so, and the app behaves exactly as it did before.

| Tool | Purpose |
| --- | --- |
| `spawn_3d_asset` | Place an asset at a floor position; returns id, type, position, status |
| `read_scene_graph` | Room, every object, constraints and environment — always the live state |
| `move_3d_asset` | Absolute reposition |
| `rotate_3d_asset` | Absolute rotation |
| `delete_3d_asset` | Remove an object |
| `check_constraints` | Structured violations: collisions, walkways, entrances, egress, spacing, alignment |
| `optimize_layout` | `grid_align`, `clear_walkways`, `improve_spacing`, `circle_cluster` |
| `change_environment_variables` | `daytime`, `sunset`, `cyberpunk` (plus the `studio` default) |
| `clear_canvas` | Empty the room; requires `confirm: true` |
| `inspect_world` | Deterministic metrics for the current world or a scenario |
| `query_spatial_relationships` | Zone, boundary, relationship and neighbour query |
| `create_scenario` | Clone the current world without changing it |
| `modify_scenario` | One high-level add/remove/move/capacity/path/constraint operation |
| `analyze_scenario` | Metrics and structured constraint consequences |
| `compare_scenarios` | Current/scenario deltas, improved/worsened constraints, recommendation |
| `apply_scenario` | Explicitly apply a non-stale scenario as one undoable change |
| `discard_scenario` | Reject a scenario without touching the current world |

Rotations are accepted and reported in **degrees** — models get those right far
more often than radians.

**Safety.** Tool arguments come from a language model, so they are treated as
hostile. `mcp/validation.ts` checks every value — known asset types, existing
object ids, finite in-range coordinates, well-formed rotations and colours —
before anything reaches a state action. Nothing throws across the boundary;
failures return structured errors, so a malformed call cannot leave the scene
half-modified. Locked objects reject agent edits, `clear_canvas` needs explicit
confirmation, and a whole `optimize_layout` run is one undo step.
Scenario apply and discard also require `confirm: true`. Apply refuses a
scenario when the current world revision has changed since it was cloned, which
prevents a hypothetical snapshot from silently overwriting newer human work.

**Logging.** Every invocation writes an activity record — timestamp, tool name,
full input, full result, success flag, `source = agent`. Human actions write the
same records with `source = human`. Expand any tool row in the console with the
`i/o` button to audit exactly what an agent sent and received.

## Spatial reasoning

`spatial/` is deterministic by construction — the same scene always produces the
same findings, which is what makes `optimize_layout`'s before/after comparison
meaningful.

Objects become oriented rectangles on the floor. Collisions use a separating-axis
test; spacing uses exact polygon-to-polygon distance. Walkway and egress
questions are not pairwise, so the floor is rasterised into an occupancy grid
with a chamfer distance transform, and routes are evaluated with a
maximum-bottleneck ("widest path") search: *what is the widest corridor that
connects the door to the middle of the room?* Egress flood-fills the free space
at the required width and reports any pocket of floor that cannot reach a door.

Chairs tucked under desks are expected, not collisions, and doors are openings
rather than obstacles — the rules encode that.

## Spatial world model

The existing `state.scene` document remains the single source of truth and is
also exposed as a `World`. It owns world identity and metadata, room dimensions,
objects, named rectangular zones, environment settings and spatial constraints.
Object category, zone membership, bounds, neighbours and relationships are
derived on read so they cannot drift out of sync with transforms.

Logical measurements are metres in a right-handed coordinate system. The floor
centre is `(0, 0, 0)`, `+Y` is up, the room spans `-width/2 .. +width/2` on X and
`-depth/2 .. +depth/2` on Z, and yaw is stored in radians using Three.js Euler
XYZ conventions (`0` faces `+Z`). WebMCP accepts and reports rotations in
degrees. Object dimensions are width/height/depth along local X/Y/Z before scale.

Placement, movement, rotation, scaling and room resizing keep rotated object
footprints inside the room wherever a valid placement exists. Boundary queries
and constraints still report invalid imported or oversized objects explicitly.
The inspector exposes the world, zones, egress paths and constraint summary when
nothing is selected; for a selection it adds zone, neighbours, relationships,
boundary status and object-specific findings.

## What-if simulation

Scenarios live in a separate Zustand store and carry independent base and
hypothetical world snapshots. Creating or modifying one never writes to
`state.scene`; only `applyScenario` crosses that boundary, through the existing
`loadScene` action, so the whole application remains undoable in one step.
Scenarios become stale if the live world revision changes and cannot then be
applied. Discarded scenarios remain as audit records but cannot be modified.

Supported high-level operations are adding 1-50 objects in one request,
removing or moving an object, setting an explicit zone capacity, placing a
physical path-blocking obstacle, and changing a constraint. Object placement is
deterministic and subsequent analysis reuses the Phase 4 geometry, occupancy and
constraint engines.

Metrics are deliberately mechanical: object count; floor, occupied and free
area; minimum doorway-to-centre walkway width; blocked paths; collision,
boundary, entrance, exit and spacing finding counts; pairwise distance for an
explicit object selection; and explicit zone capacity. Occupied/free area uses
the same 0.25 m occupancy grid as path analysis, rather than claiming a more
precise interpretation than the engine can calculate.

Comparison reports every proposed change, current/scenario values and deltas,
zone capacity differences, resolved and introduced constraint signatures, and
a deterministic `apply`, `reject`, or `review` recommendation. It does not
pretend that the recommendation is a scientific optimization score.

## Persistence

The world is saved to `localStorage` as you work, so a refresh brings back what
you built — the exact objects, their positions and your edits, plus the zones
and rules. **Start fresh**, in the outliner footer, is the way back to an empty
room.

Only the world is kept. Undo history, scenarios and proposals are session work:
reviving an undo stack whose snapshots reference a page that no longer exists
would be worse than starting it clean.

Every read is defensive. Storage that is unavailable, full, holding a world from
an older build, or holding something unparseable all fall back to an empty room
rather than stopping the app from opening — each case has a test.

## Layouts

The app opens into an **empty room** the first time. What kind of space it becomes is a choice
— made by a person from the inspector, or by an agent from the same library.

| Layout | What it builds |
| --- | --- |
| Open-plan office | Desk bank behind dividers, review table, breakout seating |
| Classroom | Whiteboard and teaching desk at the front, seating in rows |
| Cafe | Service counter along one wall, two-seat tables across the floor |
| Clinic waiting room | Reception counter facing seat banks with an accessible aisle |
| Data hall | Two cabinet rows either side of a service aisle |
| Retail floor | Shelving gondolas in aisles with a till by the entrance |

Each generator is **deterministic and room-aware**: it reads the room's extent
and lays out relative to it, so the same request gives the same result and a
larger room simply gets more of it. Every layout also supplies its own zones and
an entrance and emergency exit, so a generated world is immediately checkable —
five of the six pass their own constraint check with zero findings.

A layout refurnishes the room in front of you. A **preset** replaces the whole
world, including its size and rules. `generate_layout` and `list_layouts` put
the same library in front of an agent, which is what "build me a classroom"
should reach for rather than placing thirty objects one at a time.

## The asset kit

Eighteen low-poly primitives. Each is declared in exactly two places — metadata
in `tools/assetCatalog.ts`, geometry in `scene/assets/` — so adding one touches
no panel, no store action and no viewport code.

| Category | Assets |
| --- | --- |
| Workstations | desk |
| Seating | chair, sofa |
| Collaboration | meeting table, whiteboard |
| Hospitality | cafe table, service counter |
| Storage | storage unit |
| Infrastructure | server rack |
| Structure | partition, wall segment, barrier, door |
| Urban | building, hospital, road, vehicle |
| Ambience | plant |

Every asset shares one convention: its local origin sits on the floor at the
centre of its footprint, and its front faces local +Z.

**Roads are surfaces, not obstacles.** The occupancy grid ignores them and the
collision and spacing rules exempt them, so a vehicle parked on a road is the
intended arrangement rather than an overlap, and routes run *along* a road
instead of around it.

## The experience

A clean session opens on a single statement — **Build a world. Ask your agent to
understand it.** — with the three-part model (you shape it, the agent reads it,
it proposes), a preset to start from and the questions you could actually ask.
It is shown once and never nags again.

From then on the product states itself in three places at all times:

- **World state**, top-right of the viewport: objects, zones, warnings, walkway,
  capacity. Five numbers, because those are the ones people ask about.
- **What if?**, in the inspector: the headline interaction. A question there
  clones the world, applies the change in the copy, analyses it and reports the
  difference. The live world is never touched.
- **Observe → Analyze → Propose → Apply**, across the top of the console, read
  back out of real tool calls and proposal status — including a standing
  **waiting for human approval** when that is where things are.

While a proposal is previewed the viewport offers **CURRENT WORLD / PROPOSED
WORLD**. Either way the live document is untouched, and the banner says so; the
side you are not looking at is drawn as ghosts, so the difference reads the same
in both directions.

### Presets

A preset is data, not a second application: the same engine, the same
constraint evaluator, the same tools. It supplies objects, zones, constraint
thresholds and labels, and nothing else.

- **Workspace** — desks, collaboration and circulation.
- **Server Room** — two cabinet rows either side of a cold aisle, with tighter
  aisle (1.5 m) and rack-spacing rules, and the aisle marked restricted.
- **Emergency Response** — a 60 x 44 m city district: residential blocks either
  side of a main route, a hospital to the east, and a collapsed section closing
  the western approach. Same engine, street numbers — the walkway rule becomes
  a 3.5 m vehicle-access rule, and it opens reporting exactly one error: the
  western route detours to 3 m.

Adding one means adding an entry to `WORLD_PRESETS`.

## The demo

Press **Demo** in the header. Seven scenes, each with what to say and a button
that runs it.

| Scene | Who | What runs |
| --- | --- | --- |
| 1 The world | setup | Loads the deterministic workspace |
| 2 A human changes the world | human | Drags the manager's desk in front of the emergency exit |
| 3 The agent observes | agent | `read_scene_graph`, `check_constraints` |
| 4 What if? | agent | `create_scenario`, `modify_scenario`, `analyze_scenario`, `compare_scenarios` |
| 5 The agent proposes | agent | `propose_layout_fix` |
| 6 The human decides | human | Approve, then `apply_proposal` |
| 7 Human override | human | `set_object_fixed`, then the agent re-reads |

The numbers it produces are real. Scene 3 reports *"Manager's Desk blocks the
1.5 m approach to Emergency Exit"*; Scene 5 proposes a fix that takes the
narrowest walkway from **1.0 m to 2.5 m**; Scene 4 leaves the live world on the
same revision it started on.

**What the walkthrough is, exactly.** Agent steps invoke the real tool handlers
through `mcp/execute.ts` — the same function the WebMCP host adapter calls — and
the activity timeline is written by that execution. There is no code path that
logs a tool record without a handler having run. What the script supplies is the
*arguments*: no model is in the loop, the panel says so, and those calls are
attributed to `Demo script` rather than `Agent` so the timeline never overstates
what happened.

### Determinism

Preset worlds carry explicit ids (`desk-manager`, `door-emergency-exit`,
`world-workspace`) instead of random suffixes, so the same room, the same object
ids and the same tool output come back on every load. A test asserts it.

### Judge questions

The Demo panel's second tab answers them in the product: why WebMCP, why 3D, why
human + agent, what is new, and what happens without WebMCP — alongside the live
list of registered tools.

## Collaboration

One world, two collaborators. The human edits directly; the agent reads the same
world, reasons about it, and *proposes*. Nothing an agent proposes reaches the
world until a person approves it.

```
Human edits            world v12 -> v13
Agent reads            read_scene_graph at v13
Agent detects          check_constraints
Agent proposes         propose_layout_fix        (world unchanged, still v13)
Human edits again      world v13 -> v14          -> proposal is now STALE
Agent recalculates     recalculate_proposal      (old one is superseded)
Human approves         Approve in the console
Agent applies          apply_proposal            world v14 -> v15
Human undoes           one step back to v14
```

### Proposals

A proposal carries a title, a one-line summary, concise explanation lines,
the operations it would run, the objects it affects, the objects it preserved,
measurable expected benefits (walkway width, collisions, blocked exits, free
area) and the constraint picture before and after. The console shows it with
**Preview**, **Approve** and **Reject**.

Preview is non-destructive: rather than swapping the rendered world, the
viewport draws the *delta* — a ghost box where each object would land, a dashed
line from where it is now, a red ring on anything the proposal would remove and
an amber ring on every object the human has fixed. The live world stays on
screen and untouched.

| Tool | Purpose |
| --- | --- |
| `create_proposal` | Propose explicit operations for human review |
| `propose_layout_fix` | Work out a deterministic fix and propose it |
| `list_proposals` | Status and freshness of every proposal |
| `recalculate_proposal` | Rebase a stale proposal onto the current world |
| `apply_proposal` | Apply — only if approved and not stale |
| `set_object_fixed` | Honour "keep this exactly where it is" |

### World versioning and conflicts

`world.metadata.revision` counts commits to the live document. Every commit
advances it by exactly one — including applying a whole multi-object proposal,
and including loading an entirely different document. That invariant is enforced
in one place (`touchWorld` in the scene store) and it is what the whole conflict
story rests on: a proposal records the revision it was computed against, and
`isProposalStale` is a comparison, never a stored flag.

A stale proposal cannot be approved and cannot be applied — by the human or the
agent. The console explains the conflict in the person's own terms ("You changed
the world since this was calculated") and offers Recalculate, which builds a
fresh proposal against the current world and marks the old one superseded.

### Human override

`locked` is the fix-in-place mechanism, and the agent respects it three ways:
the layout planner skips locked objects, `buildProposal` refuses outright any
operation aimed at one, and every proposal reports the objects it preserved so
the person can see their instruction was honoured.

The human always retains the last word: reject a proposal, edit the world
directly at any time, or undo an applied proposal in a single step.

### Explanations

Proposals and tool results state what changed and what it achieved — "Narrowest
walkway increases from 0.9 m to 1.5 m", "Left 1 fixed object untouched". No
chain-of-thought is produced or exposed.

## Verification

Run `npm test` for the deterministic suite, `npm run typecheck` for strict
TypeScript, and `npm run build` for the production bundle. The fixtures include
multiple zones, an entrance, an emergency exit and obstacles.

Tests cover spatial query stability, centralized human edits, boundary
enforcement, the Phase 3 tool surface, enriched `read_scene_graph`, every
scenario operation, current-world isolation, analysis/comparison, discard,
stale-base protection and the scenario WebMCP lifecycle — plus the full
collaboration loop end to end: human edit, agent read, detection, proposal,
a second human edit, staleness, recalculation, approval, apply and undo;
one-commit-per-revision versioning; human override in all three forms;
rejection leaving the world untouched; and per-object provenance separating
agent edits from human ones.

## Performance

The scene is deliberately cheap: low-poly primitives, one shadow-casting light,
a locally generated environment map and no post-processing. The shadow map is
static — it re-renders only when the world actually changes, rather than every
frame for a room that is usually standing still.

Measured in headless Chrome on SwiftShader (pure software rasterisation, no
GPU) the viewport runs ~3 fps at 1680x1020 and ~11 fps at 900x600. That scaling
with pixel count means it is fill-rate bound in the software rasteriser, which
any real GPU handles trivially; it is a floor, not a representative number.

## Not built yet

- **Preview/approval for the low-level Phase 3 mutation tools.** Proposals and
  scenarios are isolated until a human approves them, but `move_3d_asset` and
  friends still apply immediately (and remain undoable). An agent doing
  substantial work should propose rather than mutate.
- **Proposal operations are limited to move and remove.** The scenario engine
  supports more, but the proposal tool surface exposes only these two.
- **Agent-authored zones and room sizes.** The tools let an agent clear a room
  and furnish it, but zones, room dimensions and presets stay human-side. An
  agent asked to "build a classroom" re-furnishes the existing shell; it cannot
  redraw the regions or resize the floor.
