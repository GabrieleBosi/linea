// applyResponse is all or nothing: every decision is checked before the first write. Scenario A
// after A5 has R1 sent with L1 and L2 quoted.

import { describe, expect, it } from 'vitest'
import type { Decision, Interpretation, LineChanges } from '@/domain/types'
import { createScenarioContext, scenarioA } from '@/scenarios'
import { createContext } from '@/services/context'
import { applyResponse, recordResponse, validateInterpretation } from '@/services/responses'
import { seededRepo, TODAY } from '../scenarios/harness'

const SALES = { role: 'sales', name: 'Marta Keller' } as const
const NONE: LineChanges = { quantity: null, length_mm: null, material: null, size: null, target_unit_price: null }

async function afterA5() {
  const { repo, now } = seededRepo()
  const scenario = createScenarioContext(repo, { clock: { today: () => TODAY, now }, ai: 'scripted' })
  for (const step of scenarioA.steps.slice(0, 5)) {
    await step.run(scenario)
    await step.expect(scenario)
  }
  const ctx = createContext(repo, SALES, { today: () => TODAY, now })
  const requestId = scenario.state.requestId as string
  const quotation = (await repo.listQuotations(requestId)).find((q) => q.revision_no === 1)
  if (!quotation) throw new Error('R1 missing')
  return { repo, ctx, requestId, quotationId: quotation.id }
}

const decision = (line_no: number, kind: Decision['decision'], changes: Partial<LineChanges> = {}): Decision => ({ line_no, decision: kind, changes: { ...NONE, ...changes }, source_span: 'x', confidence: 1 })
const interp = (...decisions: Decision[]): Interpretation => ({ decisions, overall: 'partial', needs_clarification: [] })

describe('applyResponse applies all decisions or none', () => {
  const cases: Array<[string, Interpretation, RegExp]> = [
    // An off-catalog material after a valid accept on L1 used to accept L1, then throw in the cost model.
    ['a material outside the catalog', interp(decision(1, 'accept'), decision(2, 'change', { material: 'S275' as never })), /"S275" is not a material Linea quotes/],
    ['a line that is not in the revision', interp(decision(1, 'accept'), decision(3, 'accept')), /L3 is not in revision R1/],
    ['a change with no new value', interp(decision(1, 'accept'), decision(2, 'change')), /L2: the change has no new value/],
    ['a size outside the catalog', interp(decision(1, 'accept'), decision(2, 'change', { size: 230 })), /HEA 230 is not in the catalog/],
    ['a quantity of zero', interp(decision(1, 'accept'), decision(2, 'change', { quantity: 0 })), /whole number above zero/],
  ]

  for (const [name, interpretation, message] of cases) {
    it(`rejects ${name} and writes nothing`, async () => {
      const { repo, ctx, requestId, quotationId } = await afterA5()
      const response = await recordResponse(ctx, quotationId, 'Customer reply')
      const linesBefore = await repo.listLines(requestId)
      const eventsBefore = (await repo.listEvents(requestId)).length

      await expect(validateInterpretation(ctx, quotationId, interpretation)).rejects.toThrow(message)
      await expect(applyResponse(ctx, response.id, interpretation, 'Marta Keller')).rejects.toThrow(/^Nothing was applied\./)

      expect(await repo.listLines(requestId)).toEqual(linesBefore)
      expect((await repo.listEvents(requestId)).length).toBe(eventsBefore)
      expect((await repo.getResponse(response.id))?.applied).toBe(false)
      expect(await repo.listQuotations(requestId)).toHaveLength(1)
    })
  }

  it('applies a valid set as before', async () => {
    const { repo, ctx, requestId, quotationId } = await afterA5()
    const response = await recordResponse(ctx, quotationId, 'Customer reply')
    await validateInterpretation(ctx, quotationId, interp(decision(1, 'accept'), decision(2, 'change', { material: 'S460' })))
    await applyResponse(ctx, response.id, interp(decision(1, 'accept'), decision(2, 'change', { material: 'S460' })), 'Marta Keller')
    const lines = await repo.listLines(requestId)
    expect(lines.find((l) => l.line_no === 1)?.commercial_status).toBe('agreed')
    expect(lines.find((l) => l.line_no === 2)?.material).toBe('S460')
  })
})
