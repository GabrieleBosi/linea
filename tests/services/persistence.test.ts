// The static demo keeps a tab's data through MemoryRepo.snapshot() and restore(): a reload is a new
// repository restored from the snapshot. The scenario must go on as if nothing happened.

import { describe, expect, it } from 'vitest'
import type { AiRunRecord } from '@/repo/Repo'
import { createScenarioContext, SCENARIOS } from '@/scenarios'
import { seededRepo, TODAY } from '../scenarios/harness'

const RECORDED: AiRunRecord = {
  id: 'recorded-1',
  step: 'price_memo',
  mode: 'live',
  model: 'gemini-3.8-flash',
  request_id: null,
  line_id: null,
  input: {},
  raw_output: '{}',
  output: {},
  checks: [],
  latency_ms: 2900,
  tokens_in: 900,
  tokens_out: 120,
  accepted: null,
  edited: null,
  created_at: `${TODAY}T08:00:00.000Z`,
}

describe('snapshot and restore', () => {
  it('scenario A runs to the end across a "reload" after every step', async () => {
    const scenario = SCENARIOS.find((s) => s.id === 'a')!
    let { repo, now } = seededRepo()
    let state: Record<string, unknown> = {}
    for (const step of scenario.steps) {
      // A new repository restored from the last snapshot, and the player's saved state, as after a reload.
      const fresh = seededRepo()
      fresh.repo.restore(repo.snapshot())
      repo = fresh.repo
      now = fresh.now
      const ctx = createScenarioContext(repo, { clock: { today: () => TODAY, now }, ai: 'scripted' })
      Object.assign(ctx.state, state)
      await step.run(ctx)
      await step.expect(ctx)
      state = JSON.parse(JSON.stringify(ctx.state)) as Record<string, unknown>
    }
    const order = await repo.getOrderByRequest(state.requestId as string)
    expect(order).not.toBeNull()
  })

  it('ids created after a restore never repeat the restored ones', async () => {
    const { repo } = seededRepo()
    const customer = (await repo.listCustomers())[0]!
    const base = { customer_id: customer.id, title: 't', source_text: 'x', open_questions: [], stated_date: null, requested_delivery_date: null, delivery_hint: null, owner: 'Marta Keller', received_at: `${TODAY}T09:00:00Z`, status: 'open' as const, source: 'manual' as const, order_id: null, hold_reason: null }
    const first = await repo.insertRequest({ ...base, ref: 'R-2026-0143' })
    const snap = repo.snapshot()

    const other = seededRepo().repo
    other.restore(snap)
    const second = await other.insertRequest({ ...base, ref: 'R-2026-0144' })
    expect(second.id).not.toBe(first.id)
    expect((await other.listRequestSummaries()).map((s) => s.request.ref).sort()).toEqual(['R-2026-0143', 'R-2026-0144'])
  })

  it('reset() clears the session rows and keeps customers, history and recorded traces', async () => {
    const { repo } = seededRepo()
    const customers = (await repo.listCustomers()).length
    const legacy = (await repo.listLegacyQuotes()).length
    const run = await repo.insertAiRun({ step: 'intake_extract', mode: 'replay', model: 'm', request_id: null, line_id: null, input: {}, raw_output: null, output: {}, checks: [], latency_ms: 700, tokens_in: null, tokens_out: null })
    await repo.decideAiRun(run.id, true, false)
    expect((await repo.getAiRun(run.id))?.accepted).toBe(true)
    repo.reset()
    expect(await repo.getAiRun(run.id)).toBeNull()
    expect((await repo.listCustomers()).length).toBe(customers)
    expect((await repo.listLegacyQuotes()).length).toBe(legacy)
  })
})

describe('AI traces in memory', () => {
  it('lists the session runs first, newest first, then the recorded ones; filters by step and limit', async () => {
    const { createMemoryRepo } = await import('@/repo/memoryRepo')
    let t = 0
    const repo = createMemoryRepo({ recordedAiRuns: [RECORDED], now: () => `${TODAY}T07:00:0${t++}.000Z` })
    const a = await repo.insertAiRun({ step: 'price_memo', mode: 'replay', model: 'm', request_id: null, line_id: null, input: {}, raw_output: null, output: {}, checks: [], latency_ms: 700, tokens_in: null, tokens_out: null })
    const b = await repo.insertAiRun({ step: 'cover_text', mode: 'replay', model: 'm', request_id: null, line_id: null, input: {}, raw_output: null, output: {}, checks: [], latency_ms: 700, tokens_in: null, tokens_out: null })
    expect((await repo.listAiRuns({ limit: 10 })).map((r) => r.id)).toEqual([b.id, a.id, 'recorded-1'])
    expect((await repo.listAiRuns({ step: 'price_memo', limit: 10 })).map((r) => r.id)).toEqual([a.id, 'recorded-1'])
    expect((await repo.listAiRuns({ limit: 1 })).map((r) => r.id)).toEqual([b.id])
    expect((await repo.getAiRun('recorded-1'))?.tokens_in).toBe(900)
    // The snapshot holds the session's runs only.
    expect(repo.snapshot().aiRuns.map((r) => r.id)).toEqual([a.id, b.id])
  })

  it('counts events by type', async () => {
    const { repo } = seededRepo()
    await repo.appendEvents([
      { request_id: 'r', line_id: null, type: 'override', actor_role: 'sales', actor_name: 'x', payload: {} },
      { request_id: 'r', line_id: null, type: 'override', actor_role: 'sales', actor_name: 'x', payload: {} },
      { request_id: 'r', line_id: null, type: 'check_waived', actor_role: 'ops', actor_name: 'y', payload: {} },
    ])
    expect(await repo.countEvents('override')).toBe(2)
    expect(await repo.countEvents('check_waived')).toBe(1)
    expect(await repo.countEvents('order_created')).toBe(0)
  })
})
