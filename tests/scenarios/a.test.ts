import { expect, it } from 'vitest'
import { scenarioA } from '@/scenarios'
import { describeScenario } from './harness'

const ctx = describeScenario(scenarioA)

it('on a fresh database the request is R-2026-0143 and the order O-2026-0088 (spec 7.1)', () => {
  expect(ctx.state.requestRef).toBe('R-2026-0143')
  expect(ctx.state.orderRef).toBe('O-2026-0088')
})
