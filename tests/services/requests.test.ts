// Hold, reject, reopen and the forced transition through the services, against memoryRepo. Spec 2.3, P1.

import { describe, expect, it } from 'vitest'
import { createContext } from '@/services/context'
import { createRequest } from '@/services/createRequest'
import { addLineToRequest } from '@/services/createRequest'
import { forceEvent } from '@/services/override'
import { holdRequest, rejectRequest, reopenRequest } from '@/services/requests'
import { seededRepo, TODAY } from '../scenarios/harness'

const SALES = { role: 'sales', name: 'Marta Keller' } as const
const OPS = { role: 'ops', name: 'Jonas Weber' } as const

async function setup() {
  const { repo, now } = seededRepo()
  const ctx = createContext(repo, SALES, { today: () => TODAY, now })
  const customers = await repo.listCustomers()
  const customer = customers.find((c) => c.name === 'Ebrecht Fabrication')
  if (!customer) throw new Error('seed customer missing')
  const { request, lines } = await createRequest(ctx, {
    customer_id: customer.id,
    title: 'Hold and reopen',
    source_text: 'x',
    open_questions: [],
    delivery_hint: null,
    lines: [{ family: 'HEA', size: 200, material: 'S355', length_mm: 12000, quantity: 10, notes: '' }],
    source: 'manual',
  })
  return { repo, ctx, request, line: lines[0]!, opsCtx: createContext(repo, OPS, { today: () => TODAY, now }) }
}

describe('hold, reject, reopen', () => {
  it('puts a request on hold with a reason, then reopens it', async () => {
    const { repo, ctx, request } = await setup()
    const held = await holdRequest(ctx, request.id, 'Customer asked to wait for the budget.')
    expect(held.status).toBe('on_hold')
    expect(held.hold_reason).toBe('Customer asked to wait for the budget.')
    await expect(addLineToRequest(ctx, request.id, { family: 'HEA', size: 220, material: 'S355', length_mm: 10000, quantity: 5, notes: '' })).rejects.toThrow(/on hold/)
    const reopened = await reopenRequest(ctx, request.id)
    expect(reopened.status).toBe('open')
    expect(reopened.hold_reason).toBeNull()
    const types = (await repo.listEvents(request.id)).map((e) => e.type)
    expect(types).toContain('request_held')
    expect(types).toContain('request_reopened')
  })

  it('refuses a hold without a reason', async () => {
    const { ctx, request } = await setup()
    await expect(holdRequest(ctx, request.id, '  ')).rejects.toThrow(/reason/)
  })

  it('rejects a request with a reason and reopens it', async () => {
    const { ctx, request } = await setup()
    const rejected = await rejectRequest(ctx, request.id, 'Out of scope for the plant.')
    expect(rejected.status).toBe('rejected')
    const reopened = await reopenRequest(ctx, request.id)
    expect(reopened.status).toBe('open')
  })

  it('refuses hold and reject from Operations', async () => {
    const { opsCtx, request } = await setup()
    await expect(holdRequest(opsCtx, request.id, 'Busy.')).rejects.toThrow(/cannot apply/)
  })
})

describe('forceEvent', () => {
  it('forces a draft line to agreed and writes one override event with the reason', async () => {
    const { repo, ctx, request, line } = await setup()
    const next = await forceEvent(ctx, { kind: 'line', line_id: line.id }, 'customer_accept', 'Verbal agreement at the plant visit.')
    expect('commercial_status' in next && next.commercial_status).toBe('agreed')
    const events = await repo.listEvents(request.id)
    const override = events.filter((e) => e.type === 'override')
    expect(override).toHaveLength(1)
    expect(override[0]?.payload).toMatchObject({ forced: true, reason: 'Verbal agreement at the plant visit.', transition: 'customer_accept', from: 'draft', to: 'agreed' })
    expect(events.filter((e) => e.type === 'decision_applied')).toHaveLength(0)
  })

  it('forces a request transition from Operations, skipping the role check', async () => {
    const { opsCtx, request } = await setup()
    const next = await forceEvent(opsCtx, { kind: 'request', request_id: request.id }, 'hold', 'Sales is away; the plant asked to pause.')
    expect('status' in next && next.status).toBe('on_hold')
  })

  it('refuses a forced transition without a reason', async () => {
    const { ctx, line } = await setup()
    await expect(forceEvent(ctx, { kind: 'line', line_id: line.id }, 'withdraw', '')).rejects.toThrow(/reason/)
  })

  it('refuses a request event on a line', async () => {
    const { ctx, line } = await setup()
    await expect(forceEvent(ctx, { kind: 'line', line_id: line.id }, 'hold', 'x')).rejects.toThrow(/applies to a request/)
  })

  it('decides the pending check when a line is forced to feasible', async () => {
    const { repo, ctx, line } = await setup()
    if (line.technical_status !== 'pending') {
      const { requestCheck } = await import('@/services/lines')
      await requestCheck(ctx, line.id, 'Customer wants a certificate.')
    }
    await forceEvent(ctx, { kind: 'line', line_id: line.id }, 'feasible', 'Plant manager confirmed by phone.')
    const checks = await repo.listChecks({ line_id: line.id })
    expect(checks[0]?.status).toBe('feasible')
    expect(checks[0]?.notes).toMatch(/Override/)
    const updated = await repo.getLine(line.id)
    expect(updated?.technical_status).toBe('feasible')
  })
})
