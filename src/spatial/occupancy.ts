import type { RoomConfig, SceneObject } from '@/types'
import { corners, footprintOf, pointInPolygon, type Point2 } from './geometry'

/**
 * Floor rasterisation and free-space analysis.
 *
 * Walkway and egress questions ("can a person get from the door to the middle
 * of the room without squeezing through a 0.6 m gap?") are not pairwise — they
 * are properties of the free space as a whole. So the floor is rasterised once,
 * a clearance field is computed, and both checks read from that.
 *
 * Everything is deterministic: same scene in, same grid and same answers out.
 */

export const DEFAULT_CELL_SIZE = 0.25

/** Roughly the cell budget that keeps a constraint pass under about a second. */
const CELL_BUDGET = 40_000

/**
 * Cell size for a room.
 *
 * A classroom wants 0.25 m resolution; a city district at the same resolution
 * is a quarter of a million cells and the route search crawls. Resolution
 * therefore scales with area, never finer than the default.
 */
export function cellSizeFor(room: { width: number; depth: number }): number {
  const ideal = Math.sqrt((room.width * room.depth) / CELL_BUDGET)
  return Math.max(DEFAULT_CELL_SIZE, Math.round(ideal * 20) / 20)
}

export interface OccupancyGrid {
  cols: number
  rows: number
  cellSize: number
  /** World coordinate of cell (0,0)'s centre. */
  originX: number
  originZ: number
  /** 1 = blocked by an object or outside the room. */
  blocked: Uint8Array
  /** Metres from each cell centre to the nearest blocked cell or wall. */
  clearance: Float32Array
}

const index = (grid: { cols: number }, col: number, row: number) => row * grid.cols + col

export const cellToWorld = (grid: OccupancyGrid, col: number, row: number): Point2 => ({
  x: grid.originX + col * grid.cellSize,
  z: grid.originZ + row * grid.cellSize,
})

export function worldToCell(grid: OccupancyGrid, point: Point2) {
  return {
    col: Math.round((point.x - grid.originX) / grid.cellSize),
    row: Math.round((point.z - grid.originZ) / grid.cellSize),
  }
}

export const inBounds = (grid: OccupancyGrid, col: number, row: number) =>
  col >= 0 && row >= 0 && col < grid.cols && row < grid.rows

/**
 * Rasterises the room floor.
 *
 * `ignoreTypes` lets callers exclude assets that are not real obstacles for the
 * question being asked — doors are openings rather than walls, and a road is a
 * surface people travel along rather than something they walk around.
 */
export function buildOccupancyGrid(
  objects: SceneObject[],
  room: RoomConfig,
  cellSize = cellSizeFor(room),
  ignoreTypes: ReadonlyArray<SceneObject['type']> = ['door', 'road'],
): OccupancyGrid {
  const cols = Math.max(1, Math.floor(room.width / cellSize) + 1)
  const rows = Math.max(1, Math.floor(room.depth / cellSize) + 1)
  const originX = -room.width / 2
  const originZ = -room.depth / 2

  const grid: OccupancyGrid = {
    cols,
    rows,
    cellSize,
    originX,
    originZ,
    blocked: new Uint8Array(cols * rows),
    clearance: new Float32Array(cols * rows),
  }

  const obstacles = objects
    .filter((object) => object.visible && !ignoreTypes.includes(object.type))
    .map((object) => corners(footprintOf(object)))

  for (const polygon of obstacles) {
    // Broad-phase: only visit cells inside the polygon's bounding box.
    const minX = Math.min(...polygon.map((p) => p.x))
    const maxX = Math.max(...polygon.map((p) => p.x))
    const minZ = Math.min(...polygon.map((p) => p.z))
    const maxZ = Math.max(...polygon.map((p) => p.z))

    const colStart = Math.max(0, Math.floor((minX - originX) / cellSize))
    const colEnd = Math.min(cols - 1, Math.ceil((maxX - originX) / cellSize))
    const rowStart = Math.max(0, Math.floor((minZ - originZ) / cellSize))
    const rowEnd = Math.min(rows - 1, Math.ceil((maxZ - originZ) / cellSize))

    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let col = colStart; col <= colEnd; col += 1) {
        if (grid.blocked[index(grid, col, row)]) continue
        if (pointInPolygon(cellToWorld(grid, col, row), polygon)) {
          grid.blocked[index(grid, col, row)] = 1
        }
      }
    }
  }

  computeClearance(grid)
  return grid
}

/**
 * Two-pass chamfer distance transform.
 *
 * Approximates Euclidean distance to the nearest blocked cell (or the room
 * boundary, which is treated as blocked) closely enough for width checks, in
 * two linear sweeps rather than a full Voronoi computation.
 */
function computeClearance(grid: OccupancyGrid) {
  const { cols, rows, cellSize, blocked, clearance } = grid
  const ORTHOGONAL = 1
  const DIAGONAL = Math.SQRT2
  const INF = cols + rows + 10

  for (let i = 0; i < clearance.length; i += 1) {
    clearance[i] = blocked[i] ? 0 : INF
  }

  const at = (col: number, row: number) =>
    col < 0 || row < 0 || col >= cols || row >= rows ? 0 : clearance[row * cols + col]

  // Forward pass.
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const i = row * cols + col
      if (blocked[i]) continue
      let best = clearance[i]
      best = Math.min(best, at(col - 1, row) + ORTHOGONAL)
      best = Math.min(best, at(col, row - 1) + ORTHOGONAL)
      best = Math.min(best, at(col - 1, row - 1) + DIAGONAL)
      best = Math.min(best, at(col + 1, row - 1) + DIAGONAL)
      clearance[i] = best
    }
  }

  // Backward pass.
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let col = cols - 1; col >= 0; col -= 1) {
      const i = row * cols + col
      if (blocked[i]) continue
      let best = clearance[i]
      best = Math.min(best, at(col + 1, row) + ORTHOGONAL)
      best = Math.min(best, at(col, row + 1) + ORTHOGONAL)
      best = Math.min(best, at(col + 1, row + 1) + DIAGONAL)
      best = Math.min(best, at(col - 1, row + 1) + DIAGONAL)
      clearance[i] = best
    }
  }

  for (let i = 0; i < clearance.length; i += 1) {
    clearance[i] *= cellSize
  }
}

/** Passable width at a cell: twice its clearance radius. */
export const widthAt = (grid: OccupancyGrid, col: number, row: number): number =>
  inBounds(grid, col, row) ? grid.clearance[index(grid, col, row)] * 2 : 0

export interface BottleneckResult {
  reachable: boolean
  /** Widest corridor width that gets you all the way through, in metres. */
  width: number
  /** Where the route is narrowest. */
  at: Point2 | null
  /** The route itself, start to goal, for drawing. Empty when unreachable. */
  route: Point2[]
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const

/**
 * Maximum-bottleneck path (a "widest path") between two cells.
 *
 * Answers "what is the widest corridor that connects these two points?" — the
 * route whose narrowest squeeze is as wide as possible. Greedy best-first with
 * a simple binary-heap-free scan: grids here are a few thousand cells, so an
 * O(n²) selection is still microseconds and keeps the code readable.
 */
export function widestPath(
  grid: OccupancyGrid,
  from: Point2,
  to: Point2,
): BottleneckResult {
  const start = worldToCell(grid, from)
  const goal = worldToCell(grid, to)
  if (!inBounds(grid, start.col, start.row) || !inBounds(grid, goal.col, goal.row)) {
    return { reachable: false, width: 0, at: null, route: [] }
  }

  const size = grid.cols * grid.rows
  const best = new Float32Array(size).fill(-1)
  const visited = new Uint8Array(size)
  const parent = new Int32Array(size).fill(-1)
  const startIndex = index(grid, start.col, start.row)
  const goalIndex = index(grid, goal.col, goal.row)

  best[startIndex] = widthAt(grid, start.col, start.row)
  const frontier = new Set<number>([startIndex])

  while (frontier.size > 0) {
    // Pick the frontier cell with the widest bottleneck so far.
    let current = -1
    let currentWidth = -1
    for (const candidate of frontier) {
      if (best[candidate] > currentWidth) {
        currentWidth = best[candidate]
        current = candidate
      }
    }
    frontier.delete(current)
    if (visited[current]) continue
    visited[current] = 1
    if (current === goalIndex) break

    const col = current % grid.cols
    const row = Math.floor(current / grid.cols)

    for (const [dc, dr] of NEIGHBOURS) {
      const nc = col + dc
      const nr = row + dr
      if (!inBounds(grid, nc, nr)) continue
      const ni = index(grid, nc, nr)
      if (visited[ni] || grid.blocked[ni]) continue

      const bottleneck = Math.min(currentWidth, widthAt(grid, nc, nr))
      if (bottleneck > best[ni]) {
        best[ni] = bottleneck
        parent[ni] = current
        frontier.add(ni)
      }
    }
  }

  if (best[goalIndex] < 0) return { reachable: false, width: 0, at: null, route: [] }

  // Walk the parent chain back from the goal to recover the actual route.
  const route: Point2[] = []
  for (let step = goalIndex; step !== -1; step = parent[step]) {
    route.push(cellToWorld(grid, step % grid.cols, Math.floor(step / grid.cols)))
    if (step === startIndex) break
  }
  route.reverse()

  // The pinch is the narrowest cell on that route.
  const width = best[goalIndex]
  let pinch: Point2 | null = null
  let narrowest = Infinity
  for (const point of route) {
    const { col, row } = worldToCell(grid, point)
    const cellWidth = widthAt(grid, col, row)
    if (cellWidth < narrowest) {
      narrowest = cellWidth
      pinch = point
    }
  }

  return { reachable: true, width, at: pinch, route }
}

export interface Region {
  cells: number[]
  areaSqm: number
  representative: Point2
}

/**
 * Connected free regions, walking only through cells at least `minWidth` wide.
 *
 * Used for egress: if a region of floor cannot reach any door at the required
 * width, people in it are trapped.
 */
export function freeRegions(grid: OccupancyGrid, minWidth: number): Region[] {
  const size = grid.cols * grid.rows
  const seen = new Uint8Array(size)
  const regions: Region[] = []
  const cellArea = grid.cellSize * grid.cellSize

  for (let seed = 0; seed < size; seed += 1) {
    if (seen[seed] || grid.blocked[seed]) continue
    const seedCol = seed % grid.cols
    const seedRow = Math.floor(seed / grid.cols)
    if (widthAt(grid, seedCol, seedRow) < minWidth) continue

    const cells: number[] = []
    const stack = [seed]
    seen[seed] = 1

    while (stack.length > 0) {
      const current = stack.pop()!
      cells.push(current)
      const col = current % grid.cols
      const row = Math.floor(current / grid.cols)

      for (const [dc, dr] of NEIGHBOURS) {
        const nc = col + dc
        const nr = row + dr
        if (!inBounds(grid, nc, nr)) continue
        const ni = index(grid, nc, nr)
        if (seen[ni] || grid.blocked[ni]) continue
        if (widthAt(grid, nc, nr) < minWidth) continue
        seen[ni] = 1
        stack.push(ni)
      }
    }

    const first = cells[0]
    regions.push({
      cells,
      areaSqm: Math.round(cells.length * cellArea * 100) / 100,
      representative: cellToWorld(grid, first % grid.cols, Math.floor(first / grid.cols)),
    })
  }

  return regions.sort((a, b) => b.areaSqm - a.areaSqm)
}
