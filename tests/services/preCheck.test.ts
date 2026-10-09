// The saved pre-check counts history as the composer shows it: a request's own lines are not
// references for it. Scenario B after B7 leaves its superseded L1 (HEA 240 S460) as the only
// history for that configuration.

import { describe, expect, it } from 'vitest'
import { createScenarioContext, scenarioB } from '@/scenarios'
import { createContext } from '@/services/context'
import { addLineToRequest, createRequest } from '@/services/createRequest'
import { seededRepo, TODAY } from '../scenarios/harness'

const SALES = { role: 'sales', name: 'Marta Keller' } as const
// 12 m and 40 pieces: inside F1a and F4, so only the "new configuration" flag can ask for a check.
const HEA240_S460 = { family: 'HEA', size: 240, material: 'S460', length_mm: 12000, quantity: 40, notes: '' } as const

async function afterB7() {
  const { repo, now } = seededRepo()
  const scenario = createScenarioContext(repo, { clock: { today: () => TODAY, now }, ai: 'scripted' })
  for (const step of scenarioB.steps.slice(0, 7)) {
    await step.run(scenario)
    await step.expect(scenario)
  }
  return { repo, ctx: createContext(repo, SALES, { today: () => TODAY, now }), requestId: scenario.state.requestId as string }
}

describe('pre-check at save time', () => {
  it("does not count the request's own superseded line: a same-configuration line in that request gets a check", async () => {
    const { repo, ctx, requestId } = await afterB7()
    const line = await addLineToRequest(ctx, requestId, HEA240_S460)
    expect(line.technical_status).toBe('pending')
    const checks = await repo.listChecks({ line_id: line.id })
    expect(checks).toHaveLength(1)
    expect(checks[0]?.rule_hits).toEqual([])
  })

  it('counts it for another request: the same configuration there needs no check', async () => {
    const { repo, ctx } = await afterB7()
    const customer = (await repo.listCustomers()).find((c) => c.name === 'Ebrecht Fabrication')
    if (!customer) throw new Error('seed customer missing')
    const { lines } = await createRequest(ctx, { customer_id: customer.id, title: 'Other request', source_text: 'x', open_questions: [], delivery_hint: null, lines: [HEA240_S460], source: 'manual' })
    expect(lines[0]?.technical_status).toBe('not_required')
    expect(await repo.listChecks({ line_id: lines[0]?.id ?? '' })).toHaveLength(0)
  })
})
