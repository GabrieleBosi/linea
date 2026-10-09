import { describe, expect, it } from 'vitest'
import { runStep } from '@/ai/client'
import { canonicalJson, replayKey } from '@/ai/replayKey'
import { intakeExtract, type IntakeOutput } from '@/ai/steps/intake_extract'
import { replyInterpret } from '@/ai/steps/reply_interpret'
import type { ModelClient, ReplayStore, StepName } from '@/ai/types'
import { loadPrompts, parsePrompt, renderGenerated } from '../../scripts/build-prompts'
import { PROMPTS } from '@/ai/prompts/generated'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const TEXT = 'please quote 120 pcs HEA 200 in S355, 12 m'

const GOOD: IntakeOutput = {
  customer_name_guess: null,
  lines: [{ family: 'HEA', size: 200, material: 'S355', length_mm: 12000, quantity: 120, notes: '', source_span: '120 pcs HEA 200 in S355, 12 m', confidence: 0.95 }],
  open_questions: [],
  stated_date: null,
  requested_delivery_date: null,
  delivery_hint: null,
}

class MemoryReplay implements ReplayStore {
  map = new Map<string, unknown>()
  async get(step: StepName, key: string) {
    return this.map.get(`${step}:${key}`) ?? null
  }
  async put(step: StepName, key: string, output: unknown) {
    this.map.set(`${step}:${key}`, output)
  }
}

const respond =
  (text: string): ModelClient =>
  async () => ({ text, tokens_in: 10, tokens_out: 5 })

describe('replay keys', () => {
  it('canonical JSON sorts keys at every level', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [{ z: 1, y: 2 }] } })).toBe('{"a":{"c":[{"y":2,"z":1}],"d":2},"b":1}')
  })
  it('key depends only on the step and the listed fields', async () => {
    const k1 = await replayKey('intake_extract', intakeExtract.replayFields({ text: TEXT, customer_hint: 'Ebrecht' }))
    const k2 = await replayKey('intake_extract', intakeExtract.replayFields({ text: TEXT, customer_hint: 'Other' }))
    const k3 = await replayKey('intake_extract', intakeExtract.replayFields({ text: TEXT + '!' }))
    expect(k1).toBe(k2)
    expect(k1).not.toBe(k3)
    expect(k1).toMatch(/^[0-9a-f]{64}$/)
  })
  it('reply key uses the reply, line_no and quantity, not the price', async () => {
    const line = { line_no: 1, family: 'HEA', size: 200, material: 'S355', length_mm: 12000, quantity: 120, unit_price: 700, total_price: 84000 }
    const a = await replayKey('reply_interpret', replyInterpret.replayFields({ reply_text: 'ok', revision: { revision_no: 1, lines: [line] } }))
    const b = await replayKey('reply_interpret', replyInterpret.replayFields({ reply_text: 'ok', revision: { revision_no: 1, lines: [{ ...line, unit_price: 750, total_price: 90000 }] } }))
    const c = await replayKey('reply_interpret', replyInterpret.replayFields({ reply_text: 'ok', revision: { revision_no: 1, lines: [{ ...line, quantity: 60 }] } }))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('runStep', () => {
  it('live: validates, runs the checks and reports tokens', async () => {
    const r = await runStep(intakeExtract, { text: TEXT }, { model: 'test', client: respond(JSON.stringify(GOOD)), replay: null, mode: 'live' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.result.mode).toBe('live')
    expect(r.result.checks.map((c) => c.name)).toEqual(['schema_valid', 'size_in_catalog', 'quantity_positive', 'span_grounded', 'units_normalized', 'no_instruction_text', 'dates_grounded'])
    expect(r.result.checks.every((c) => c.pass)).toBe(true)
    expect(r.result.tokens_in).toBe(10)
  })

  it('a schema failure is a check failure with a next action, not an exception', async () => {
    const r = await runStep(intakeExtract, { text: TEXT }, { model: 'test', client: respond('{"lines": "nope"}'), replay: null, mode: 'live' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.failure.checks[0]?.name).toBe('schema_valid')
    expect(r.failure.checks[0]?.pass).toBe(false)
    expect(r.failure.next).toBe('Add the lines manually.')
    expect(r.failure.raw).toContain('nope')
  })

  it('an extra field fails the strict schema', async () => {
    const r = await runStep(intakeExtract, { text: TEXT }, { model: 'test', client: respond(JSON.stringify({ ...GOOD, discount: 100 })), replay: null, mode: 'live' })
    expect(r.ok).toBe(false)
  })

  it('replay mode reads the cache first and never calls the model', async () => {
    const replay = new MemoryReplay()
    const key = await replayKey('intake_extract', { text: TEXT })
    await replay.put('intake_extract', key, GOOD)
    let calls = 0
    const client: ModelClient = async () => {
      calls++
      return { text: '{}' }
    }
    const r = await runStep(intakeExtract, { text: TEXT }, { model: 'test', client, replay, mode: 'replay' })
    expect(calls).toBe(0)
    expect(r.ok && r.result.mode).toBe('replay')
  })

  it('falls back to the cache after a model failure, and retries once on a fast network error', async () => {
    const replay = new MemoryReplay()
    await replay.put('intake_extract', await replayKey('intake_extract', { text: TEXT }), GOOD)
    let calls = 0
    const client: ModelClient = async () => {
      calls++
      throw new Error('fetch failed')
    }
    const r = await runStep(intakeExtract, { text: TEXT }, { model: 'test', client, replay, mode: 'live' })
    expect(calls).toBe(2)
    expect(r.ok && r.result.mode).toBe('replay')
  })

  it('treats a failed cache read as a miss: a model failure still ends as a failure with a next action, not a crash', async () => {
    const broken = { get: async () => Promise.reject(new Error('ai_replay read: connection refused')), put: async () => undefined }
    const failing: ModelClient = async () => {
      throw new Error('fetch failed')
    }
    const r = await runStep(intakeExtract, { text: TEXT }, { model: 'test', client: failing, replay: broken, mode: 'live' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.failure.next).toBeTruthy()

    // In replay mode the failed read falls through to the live call.
    const good: ModelClient = async () => ({ text: JSON.stringify(GOOD) })
    const live = await runStep(intakeExtract, { text: TEXT }, { model: 'test', client: good, replay: broken, mode: 'replay' })
    expect(live.ok && live.result.mode).toBe('live')
  })

  it('returns a failure with a next action when the model fails and nothing is cached', async () => {
    const client: ModelClient = async () => {
      throw new Error('500 internal')
    }
    const r = await runStep(replyInterpret, { reply_text: 'ok', revision: { revision_no: 1, lines: [{ line_no: 1, family: 'HEA', size: 200, material: 'S355', length_mm: 12000, quantity: 1, unit_price: 1, total_price: 1 }] } }, { model: 'test', client, replay: null, mode: 'live' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.failure.error).toContain('500')
    expect(r.failure.next).toBe('Set the decisions by hand.')
  })

  it('times out at the budget', async () => {
    const slow = { ...intakeExtract, budget_ms: 30 }
    const client: ModelClient = (req) =>
      new Promise((_, reject) => {
        req.signal.addEventListener('abort', () => reject(new Error('This operation was aborted')))
      })
    const r = await runStep(slow, { text: TEXT }, { model: 'test', client, replay: null, mode: 'live' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.failure.error).toMatch(/did not answer/)
  })
})

describe('prompts', () => {
  it('generated module matches the markdown files', () => {
    const dir = resolve(__dirname, '../../src/ai/prompts')
    const expected = renderGenerated(loadPrompts(dir))
    const actual = readFileSync(resolve(dir, 'generated.ts'), 'utf8')
    expect(actual, 'run npm run build:prompts').toBe(expected)
  })
  it('every prompt has a version header and both sections', () => {
    const p = parsePrompt('---\nstep: x\nversion: 3\n---\n\n## System\nS\n\n## User\nU {{a}}\n', 'x.md')
    expect(p).toEqual({ step: 'x', version: 3, system: 'S', user: 'U {{a}}' })
    expect(PROMPTS.intake_extract.version).toBeGreaterThanOrEqual(1)
    expect(PROMPTS.reply_interpret.system).toContain('data')
  })
  it('user prompts render with the input inside markers', () => {
    expect(intakeExtract.userPrompt({ text: 'hello', customer_hint: 'Ebrecht Fabrication' })).toContain('<<<REQUEST\nhello\nREQUEST>>>')
    expect(intakeExtract.userPrompt({ text: 'hello' })).toContain('Customer: not selected yet.')
  })
  it('the JSON schema for the model has no $schema key and marks objects strict', () => {
    const s = intakeExtract.jsonSchema as Record<string, unknown>
    expect(s.$schema).toBeUndefined()
    expect(s.additionalProperties).toBe(false)
  })
})
