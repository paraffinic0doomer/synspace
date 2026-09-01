import type { SpatialConstraint } from '@/types'

/**
 * The deterministic spatial rules a layout is expected to satisfy.
 *
 * Phase 2 stores these on the scene so they are versioned and undoable along
 * with everything else. The evaluator that turns a rule plus a layout into a
 * list of violations is the next phase's work — nothing here checks anything
 * yet, and no part of the app currently reports compliance.
 */
export const DEFAULT_CONSTRAINTS: SpatialConstraint[] = [
  {
    id: 'walkway-primary',
    kind: 'walkway-width',
    label: 'Primary walkway width',
    description: 'Circulation routes through the floor must stay at least this wide.',
    value: 1.2,
    unit: 'm',
    severity: 'error',
    enabled: true,
    appliesTo: [],
  },
  {
    id: 'spacing-desks',
    kind: 'object-spacing',
    label: 'Workstation spacing',
    description: 'Minimum clear gap between adjacent desks.',
    value: 0.8,
    unit: 'm',
    severity: 'warning',
    enabled: true,
    appliesTo: ['desk'],
  },
  {
    id: 'clearance-entrance',
    kind: 'entrance-clearance',
    label: 'Entrance clearance',
    description: 'Keep the swing and approach of every doorway clear.',
    value: 1.5,
    unit: 'm',
    severity: 'error',
    enabled: true,
    appliesTo: ['door'],
  },
  {
    id: 'clearance-exit',
    kind: 'exit-clearance',
    label: 'Emergency exit route',
    description: 'Unobstructed width along the path to an exit.',
    value: 1.1,
    unit: 'm',
    severity: 'error',
    enabled: true,
    appliesTo: [],
  },
  {
    id: 'collision-any',
    kind: 'collision',
    label: 'Object overlap',
    description: 'Object footprints must not intersect.',
    value: 0,
    unit: 'm',
    severity: 'error',
    enabled: true,
    appliesTo: [],
  },
  {
    id: 'boundary-containment',
    kind: 'boundary',
    label: 'World boundary',
    description: 'Every object must sit entirely inside the room.',
    value: 0,
    unit: 'm',
    severity: 'error',
    enabled: true,
    appliesTo: [],
  },
  {
    id: 'zone-restriction',
    kind: 'zone-restriction',
    label: 'Zone restrictions',
    description: 'Zones may forbid asset types that would obstruct their purpose.',
    value: 0,
    unit: 'm',
    severity: 'warning',
    enabled: true,
    appliesTo: [],
  },
  {
    id: 'alignment-grid',
    kind: 'alignment',
    label: 'Rotation alignment',
    description: 'Furniture should sit within this tolerance of a right angle.',
    value: 5,
    unit: 'deg',
    severity: 'info',
    enabled: true,
    appliesTo: [],
  },
]

export const getConstraint = (
  constraints: SpatialConstraint[],
  id: string,
): SpatialConstraint | undefined => constraints.find((constraint) => constraint.id === id)
