export {
  footprintOf,
  corners,
  bounds,
  polygonsOverlap,
  footprintGap,
  overlapDepth,
  direction,
  pointInPolygon,
  clearanceZone,
  pointSegmentDistance,
} from './geometry'
export type { Point2, Footprint } from './geometry'

export {
  DEFAULT_CELL_SIZE,
  buildOccupancyGrid,
  cellToWorld,
  worldToCell,
  inBounds,
  widthAt,
  widestPath,
  freeRegions,
} from './occupancy'
export type { OccupancyGrid, BottleneckResult, Region } from './occupancy'

export { evaluateConstraints, isSurfaceType } from './constraints'
export type { ConstraintReport } from './constraints'

export {
  NEAR_RADIUS,
  ADJACENT_GAP,
  worldBounds,
  rectContainsPoint,
  rectContainsRect,
  rectsOverlap,
  rectCentre,
  objectBounds,
  boundaryStatusOf,
  boundaryViolations,
  isWithinWorld,
  zoneOf,
  objectsInZone,
  zoneIntrusions,
  distanceBetween,
  centreDistance,
  boundingBoxOverlap,
  footprintsOverlap,
  nearestObjects,
  objectsWithinRadius,
  pathClearance,
  entrances,
  emergencyExits,
  describeRelationships,
} from './queries'
export type { NeighbourResult, PathClearance } from './queries'

export { OPTIMIZE_STRATEGIES, planOptimization } from './optimize'
export type { OptimizeStrategy, LayoutChange, LayoutPlan, OptimizeOptions } from './optimize'
