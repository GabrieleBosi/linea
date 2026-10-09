import { describe, it } from 'vitest'
import { createMemoryRepo, type MemoryRepo } from '@/repo/memoryRepo'
import { createScenarioContext, type Scenario, type ScenarioContext } from '@/scenarios'
import { CUSTOMERS, generateLegacyQuotes } from '../../scripts/generate-legacy'

export const TODAY = '2026-09-22'

export function seededRepo(): { repo: MemoryRepo; now: () => string } {
  let tick = 0
  // Each write gets a later timestamp, so the timeline order is the write order.
  const now = () => new Date(Date.parse(`${TODAY}T09:00:00Z`) + tick++ * 1000).toISOString()
  const repo = createMemoryRepo({
    customers: CUSTOMERS.map((c) => ({ name: c.name, segment: c.segment, country: c.country })),
    legacyQuotes: generateLegacyQuotes(),
    now,
  })
  return { repo, now }
}

/** One `it` per step, in order. A failing step fails the rest, which is the intent. Returns the shared context. */
export function describeScenario(scenario: Scenario): ScenarioContext {
  const { repo, now } = seededRepo()
  const ctx = createScenarioContext(repo, { clock: { today: () => TODAY, now }, ai: 'scripted' })
  describe(scenario.title, () => {
    for (const step of scenario.steps) {
      it(`${step.id}: ${step.title}`, async () => {
        await step.run(ctx)
        await step.expect(ctx)
      })
    }
  })
  return ctx
}
