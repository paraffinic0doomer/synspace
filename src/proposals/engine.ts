import {
  applyScenarioOperation,
  compareScenarioWorld,
  createScenarioDocument,
  type ScenarioResult,
} from '@/scenarios'
import { planOptimization, type OptimizeStrategy } from '@/spatial'
import { evaluateConstraints } from '@/spatial/constraints'
import type {
  ActorRef,
  Proposal,
  ProposalBenefit,
  ProposalConstraintChange,
  ProposalView,
  Scenario,
  ScenarioOperation,
  World,
} from '@/types'
import { createId, roundTo } from '@/utils'

/**
 * Proposal construction.
 *
 * Pure functions over a world — no store, no React, no renderer. A proposal is
 * built by simulating its operations in a scenario, comparing that scenario to
 * the live world, and turning the difference into benefits a person can read.
 *
 * Two rules hold throughout:
 *  - objects the human has fixed are never moved, and are reported as preserved;
 *  - a proposal records the world revision it was computed against, so it can
 *    be detected as stale rather than applied over newer human work.
 */

export interface ProposalInput {
  title: string
  summary?: string
  operations: ScenarioOperation[]
}

export interface BuiltProposal {
  proposal: Proposal
  scenario: Scenario
}

const fail = <T = never>(error: string): ScenarioResult<T> => ({ ok: false, error })
const ok = <T>(data: T): ScenarioResult<T> => ({ ok: true, data })

/** Objects the human has pinned. The agent must leave these alone. */
export const fixedObjectIds = (world: World): string[] =>
  world.objects
    .filter((object) => object.locked)
    .map((object) => object.id)
    .sort()

/** Object ids an operation would touch. */
function operationTargets(operation: ScenarioOperation): string[] {
  switch (operation.kind) {
    case 'move_object':
    case 'remove_object':
      return [operation.objectId]
    default:
      return []
  }
}

/**
 * Metrics worth reporting, and which direction counts as better.
 * `lowerIsBetter` keeps the benefit arrows honest without per-call thought.
 */
const BENEFIT_METRICS: {
  key: string
  label: string
  unit: ProposalBenefit['unit']
  lowerIsBetter: boolean
}[] = [
  { key: 'minimumWalkwayWidthM', label: 'Narrowest walkway', unit: 'm', lowerIsBetter: false },
  { key: 'collisionCount', label: 'Object collisions', unit: 'count', lowerIsBetter: true },
  { key: 'boundaryViolationCount', label: 'Outside boundary', unit: 'count', lowerIsBetter: true },
  {
    key: 'entranceClearanceViolationCount',
    label: 'Blocked entrances',
    unit: 'count',
    lowerIsBetter: true,
  },
  {
    key: 'emergencyExitViolationCount',
    label: 'Blocked emergency exits',
    unit: 'count',
    lowerIsBetter: true,
  },
  { key: 'spacingViolationCount', label: 'Spacing problems', unit: 'count', lowerIsBetter: true },
  { key: 'blockedPathCount', label: 'Unreachable routes', unit: 'count', lowerIsBetter: true },
  { key: 'freeAreaSqm', label: 'Free floor area', unit: 'm2', lowerIsBetter: false },
]

function deriveBenefits(comparison: Scenario['comparison']): ProposalBenefit[] {
  if (!comparison) return []
  const byKey = new Map(comparison.metrics.map((metric) => [String(metric.key), metric]))

  return BENEFIT_METRICS.flatMap((spec) => {
    const metric = byKey.get(spec.key)
    if (!metric) return []
    const { current, scenario } = metric
    if (current === null && scenario === null) return []
    if (current === scenario) return []

    // A null on either side means "not measurable there" — report it, but a
    // missing number is never claimed as an improvement.
    const improved =
      current === null || scenario === null
        ? false
        : spec.lowerIsBetter
          ? scenario < current
          : scenario > current

    return [
      {
        key: spec.key,
        label: spec.label,
        before: current === null ? null : roundTo(current, 2),
        after: scenario === null ? null : roundTo(scenario, 2),
        unit: spec.unit,
        improved,
      },
    ]
  })
}

function describeConstraintChange(scenario: Scenario, world: World): ProposalConstraintChange {
  const before = evaluateConstraints(world)
  const after = evaluateConstraints(scenario.world)
  const key = (message: string) => message
  const beforeMessages = new Set(before.violations.map((violation) => key(violation.message)))
  const afterMessages = new Set(after.violations.map((violation) => key(violation.message)))

  return {
    before: before.summary,
    after: after.summary,
    resolved: before.violations
      .filter((violation) => !afterMessages.has(key(violation.message)))
      .map((violation) => violation.message),
    introduced: after.violations
      .filter((violation) => !beforeMessages.has(key(violation.message)))
      .map((violation) => violation.message),
  }
}

/**
 * Concise, factual explanation lines.
 *
 * Deliberately statements of what changed and what it achieved — never the
 * reasoning that got there.
 */
function explain(
  operations: ScenarioOperation[],
  benefits: ProposalBenefit[],
  constraintChanges: ProposalConstraintChange,
  preserved: string[],
  world: World,
): string[] {
  const lines: string[] = []
  const moves = operations.filter((operation) => operation.kind === 'move_object').length
  const adds = operations.filter((operation) => operation.kind === 'add_object').length
  const removes = operations.filter((operation) => operation.kind === 'remove_object').length

  const parts: string[] = []
  if (moves > 0) parts.push(`move ${moves} object${moves === 1 ? '' : 's'}`)
  if (adds > 0) parts.push(`add ${adds}`)
  if (removes > 0) parts.push(`remove ${removes}`)
  if (parts.length > 0) lines.push(`Would ${parts.join(', ')}.`)

  if (preserved.length > 0) {
    const labels = preserved
      .map((id) => world.objects.find((object) => object.id === id)?.label ?? id)
      .slice(0, 3)
    lines.push(
      `Left ${preserved.length} fixed object${preserved.length === 1 ? '' : 's'} untouched (${labels.join(', ')}${preserved.length > labels.length ? ', …' : ''}).`,
    )
  }

  const walkway = benefits.find((benefit) => benefit.key === 'minimumWalkwayWidthM')
  if (walkway && walkway.before !== null && walkway.after !== null) {
    lines.push(
      `Narrowest walkway ${walkway.improved ? 'increases' : 'changes'} from ${walkway.before} m to ${walkway.after} m.`,
    )
  }

  if (constraintChanges.resolved.length > 0) {
    lines.push(`Resolves ${constraintChanges.resolved.length} constraint finding(s).`)
  }
  if (constraintChanges.introduced.length > 0) {
    lines.push(`Introduces ${constraintChanges.introduced.length} new finding(s) — review before applying.`)
  }
  if (lines.length === 0) lines.push('No measurable change to the current layout.')

  return lines
}

/**
 * Simulates a set of operations and packages them as a proposal.
 *
 * Rejects up front any operation aimed at a fixed object, so an agent cannot
 * quietly plan around a human's explicit instruction.
 */
export function buildProposal(
  world: World,
  input: ProposalInput,
  actor: ActorRef,
): ScenarioResult<BuiltProposal> {
  const title = input.title.trim()
  if (title.length < 1 || title.length > 120) {
    return fail('Proposal title must contain 1 to 120 characters.')
  }
  if (input.operations.length === 0) {
    return fail('A proposal needs at least one operation.')
  }
  if (input.operations.length > 50) {
    return fail('A proposal may contain at most 50 operations.')
  }

  const fixed = new Set(fixedObjectIds(world))
  const blocked = input.operations
    .flatMap(operationTargets)
    .filter((id) => fixed.has(id))
  if (blocked.length > 0) {
    const labels = [...new Set(blocked)].map(
      (id) => world.objects.find((object) => object.id === id)?.label ?? id,
    )
    return fail(
      `These objects are fixed by the human and cannot be changed: ${labels.join(', ')}. Remove them from the proposal or ask the human to unfix them.`,
    )
  }

  let scenario = createScenarioDocument(world, title)
  for (const operation of input.operations) {
    const result = applyScenarioOperation(scenario, operation, actor)
    if (!result.ok) return fail(result.error)
    scenario = result.data
  }

  const comparison = compareScenarioWorld(scenario, world, world.id)
  scenario = { ...scenario, comparison, status: 'analyzed', updatedAt: Date.now() }

  const benefits = deriveBenefits(comparison)
  const constraintChanges = describeConstraintChange(scenario, world)
  const preserved = fixedObjectIds(world)
  const affected = [
    ...new Set(scenario.proposedChanges.flatMap((change) => change.affectedObjectIds)),
  ].sort()

  const proposal: Proposal = {
    id: createId('prop'),
    title,
    summary:
      input.summary?.trim() ||
      defaultSummary(benefits, constraintChanges, input.operations.length),
    explanation: explain(input.operations, benefits, constraintChanges, preserved, world),
    operations: input.operations,
    affectedObjectIds: affected,
    preservedObjectIds: preserved,
    expectedBenefits: benefits,
    constraintChanges,
    baseWorldId: world.id,
    baseWorldRevision: world.metadata.revision,
    scenarioId: scenario.id,
    status: 'pending',
    actor,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  return ok({ proposal, scenario })
}

function defaultSummary(
  benefits: ProposalBenefit[],
  constraintChanges: ProposalConstraintChange,
  operationCount: number,
): string {
  const walkway = benefits.find((benefit) => benefit.key === 'minimumWalkwayWidthM')
  if (walkway?.improved && walkway.before !== null && walkway.after !== null) {
    return `${operationCount} change(s) widening the narrowest walkway from ${walkway.before} m to ${walkway.after} m.`
  }
  if (constraintChanges.resolved.length > 0) {
    return `${operationCount} change(s) resolving ${constraintChanges.resolved.length} constraint finding(s).`
  }
  return `${operationCount} proposed change(s) to the layout.`
}

/**
 * Builds a proposal from the deterministic layout planner.
 *
 * This is the "agent noticed a problem and worked out a fix" path: the planner
 * already skips fixed objects, so the result honours human overrides by
 * construction.
 */
export function buildLayoutFixProposal(
  world: World,
  strategy: OptimizeStrategy,
  actor: ActorRef,
  title?: string,
): ScenarioResult<BuiltProposal> {
  const plan = planOptimization(world, strategy)
  if (plan.changes.length === 0) {
    return fail(`Strategy "${strategy}" found nothing to change in the current layout.`)
  }

  const operations: ScenarioOperation[] = plan.changes.map((change) => ({
    kind: 'move_object',
    objectId: change.id,
    position: change.to.position,
  }))

  return buildProposal(
    world,
    { title: title?.trim() || `Layout fix: ${strategy.replace(/_/g, ' ')}`, operations },
    actor,
  )
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

/**
 * A proposal is stale once the world has moved on from the revision it was
 * computed against. Applying it then would overwrite newer human work.
 */
export const isProposalStale = (proposal: Proposal, world: World): boolean =>
  proposal.baseWorldId !== world.id || proposal.baseWorldRevision !== world.metadata.revision

export function toProposalView(proposal: Proposal, world: World): ProposalView {
  const stale = isProposalStale(proposal, world)
  return {
    ...proposal,
    stale,
    currentWorldRevision: world.metadata.revision,
    canApply: !stale && (proposal.status === 'pending' || proposal.status === 'approved'),
  }
}
