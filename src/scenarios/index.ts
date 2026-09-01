export {
  cloneWorld,
  createScenarioDocument,
  applyScenarioOperation,
  calculateWorldMetrics,
  analyzeScenarioWorld,
  compareScenarioWorld,
} from './engine'
export type { ScenarioResult } from './engine'

export {
  WHAT_IF_QUESTIONS,
  availableWhatIfQuestions,
  getWhatIfQuestion,
} from './whatIf'
export type { WhatIfQuestion } from './whatIf'
