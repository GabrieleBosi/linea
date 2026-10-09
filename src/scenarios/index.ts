export { scenarioA } from './a'
export { scenarioB } from './b'
export { createScenarioContext } from './context'
export * from './types'
export type { FieldComparison } from './ai'

import { scenarioA } from './a'
import { scenarioB } from './b'
import type { Scenario } from './types'

export const SCENARIOS: readonly Scenario[] = [scenarioA, scenarioB]
