import { create } from 'zustand'
import {
  analyzeScenarioWorld,
  applyScenarioOperation,
  cloneWorld,
  compareScenarioWorld,
  createScenarioDocument,
  type ScenarioResult,
} from '@/scenarios'
import type {
  ActorRef,
  Scenario,
  ScenarioAnalysis,
  ScenarioComparison,
  ScenarioOperation,
} from '@/types'
import { HUMAN_ACTOR } from '@/types'
import { useSceneStore } from './sceneStore'

export interface ScenarioState {
  scenarios: Scenario[]
  activeScenarioId: string | null
  createScenario: (name: string, actor?: ActorRef) => ScenarioResult<Scenario>
  modifyScenario: (
    id: string,
    operation: ScenarioOperation,
    actor?: ActorRef,
  ) => ScenarioResult<Scenario>
  analyzeScenario: (
    id: string,
    selectedObjectIds?: string[],
  ) => ScenarioResult<ScenarioAnalysis>
  compareScenario: (
    id: string,
    againstScenarioId?: string,
    selectedObjectIds?: string[],
  ) => ScenarioResult<ScenarioComparison>
  discardScenario: (id: string, actor?: ActorRef) => ScenarioResult<Scenario>
  applyScenario: (id: string, actor?: ActorRef) => ScenarioResult<Scenario>
  setActiveScenario: (id: string | null) => void
  clearScenarios: () => void
}

const findScenario = (scenarios: Scenario[], id: string) =>
  scenarios.find((scenario) => scenario.id === id)

const replaceScenario = (scenarios: Scenario[], next: Scenario) =>
  scenarios.map((scenario) => (scenario.id === next.id ? next : scenario))

const fail = <T = never>(error: string): ScenarioResult<T> => ({ ok: false, error })
const ok = <T>(data: T): ScenarioResult<T> => ({ ok: true, data })

export const useScenarioStore = create<ScenarioState>()((set, get) => ({
  scenarios: [],
  activeScenarioId: null,

  createScenario: (name, actor = HUMAN_ACTOR) => {
    const cleanName = name.trim()
    if (cleanName.length < 1 || cleanName.length > 100) {
      return fail('Scenario name must contain 1 to 100 characters.')
    }
    const scenario = createScenarioDocument(useSceneStore.getState().scene, cleanName)
    set((state) => ({
      scenarios: [...state.scenarios, scenario],
      activeScenarioId: scenario.id,
    }))
    useSceneStore.getState().log({
      message: `Created scenario "${scenario.name}" from world revision ${scenario.baseWorldRevision}`,
      actor,
      level: 'success',
    })
    return ok(scenario)
  },

  modifyScenario: (id, operation, actor = HUMAN_ACTOR) => {
    const scenario = findScenario(get().scenarios, id)
    if (!scenario) return fail(`No scenario with id "${id}".`)
    const result = applyScenarioOperation(scenario, operation, actor)
    if (!result.ok) return result
    set((state) => ({
      scenarios: replaceScenario(state.scenarios, result.data),
      activeScenarioId: id,
    }))
    const change = result.data.proposedChanges.at(-1)
    useSceneStore.getState().log({
      message: `Scenario "${scenario.name}": ${change?.summary ?? 'modified'}`,
      actor,
      level: 'info',
    })
    return result
  },

  analyzeScenario: (id, selectedObjectIds = []) => {
    const scenario = findScenario(get().scenarios, id)
    if (!scenario) return fail(`No scenario with id "${id}".`)
    if (scenario.status === 'discarded') return fail(`Scenario "${scenario.name}" was discarded.`)
    const analysis = analyzeScenarioWorld(scenario, selectedObjectIds)
    const next: Scenario = {
      ...scenario,
      analysis,
      status: scenario.status === 'applied' ? 'applied' : 'analyzed',
      updatedAt: Date.now(),
    }
    set((state) => ({
      scenarios: replaceScenario(state.scenarios, next),
      activeScenarioId: id,
    }))
    return ok(analysis)
  },

  compareScenario: (id, againstScenarioId, selectedObjectIds = []) => {
    const scenario = findScenario(get().scenarios, id)
    if (!scenario) return fail(`No scenario with id "${id}".`)
    if (scenario.status === 'discarded') return fail(`Scenario "${scenario.name}" was discarded.`)

    const against = againstScenarioId
      ? findScenario(get().scenarios, againstScenarioId)
      : undefined
    if (againstScenarioId && !against) {
      return fail(`No comparison scenario with id "${againstScenarioId}".`)
    }
    if (against?.status === 'discarded') {
      return fail(`Comparison scenario "${against.name}" was discarded.`)
    }

    const baseline = against?.world ?? useSceneStore.getState().scene
    const comparison = compareScenarioWorld(
      scenario,
      baseline,
      against?.id ?? baseline.id,
      selectedObjectIds,
    )
    const next = { ...scenario, comparison, updatedAt: Date.now() }
    set((state) => ({
      scenarios: replaceScenario(state.scenarios, next),
      activeScenarioId: id,
    }))
    return ok(comparison)
  },

  discardScenario: (id, actor = HUMAN_ACTOR) => {
    const scenario = findScenario(get().scenarios, id)
    if (!scenario) return fail(`No scenario with id "${id}".`)
    if (scenario.status === 'applied') return fail('An applied scenario cannot be discarded.')
    if (scenario.status === 'discarded') return ok(scenario)
    const next: Scenario = { ...scenario, status: 'discarded', updatedAt: Date.now() }
    set((state) => ({
      scenarios: replaceScenario(state.scenarios, next),
      activeScenarioId: state.activeScenarioId === id ? null : state.activeScenarioId,
    }))
    useSceneStore.getState().log({
      message: `Discarded scenario "${scenario.name}"; the current world was unchanged`,
      actor,
      level: 'warn',
    })
    return ok(next)
  },

  applyScenario: (id, actor = HUMAN_ACTOR) => {
    const scenario = findScenario(get().scenarios, id)
    if (!scenario) return fail(`No scenario with id "${id}".`)
    if (scenario.status === 'discarded') return fail(`Scenario "${scenario.name}" was discarded.`)
    if (scenario.status === 'applied') return fail(`Scenario "${scenario.name}" was already applied.`)

    const current = useSceneStore.getState().scene
    if (
      current.id !== scenario.baseWorldId ||
      current.metadata.revision !== scenario.baseWorldRevision
    ) {
      return fail(
        `Scenario base is stale (created from revision ${scenario.baseWorldRevision}, current revision ${current.metadata.revision}). Create a new scenario before applying.`,
      )
    }

    useSceneStore.getState().loadScene(cloneWorld(scenario.world), actor)
    const next: Scenario = { ...scenario, status: 'applied', updatedAt: Date.now() }
    set((state) => ({
      scenarios: replaceScenario(state.scenarios, next),
      activeScenarioId: id,
    }))
    useSceneStore.getState().log({
      message: `Applied scenario "${scenario.name}" with ${scenario.proposedChanges.length} proposed change${scenario.proposedChanges.length === 1 ? '' : 's'}`,
      actor,
      level: 'success',
    })
    return ok(next)
  },

  setActiveScenario: (id) => {
    if (id !== null && !findScenario(get().scenarios, id)) return
    set({ activeScenarioId: id })
  },

  clearScenarios: () => set({ scenarios: [], activeScenarioId: null }),
}))
