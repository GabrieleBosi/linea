// Static demo backend. The data lives in an in-memory repository seeded from the bundled history
// and kept per browser tab in session storage, so a reload, Back and "Open screen" keep the run.
// The AI steps run in the browser with the same step runner as the server, against the recorded
// model outputs. No network, no keys, no model call: an input without a recording takes the manual
// path. Picked instead of backend.ts when the build runs with `--mode static` (vite.config.ts).

import { z } from 'zod'
import { ModelCallError, runStep } from '@/ai/client'
import { coverInputSchema, coverText } from '@/ai/steps/cover_text'
import { intakeExtract, intakeInputSchema } from '@/ai/steps/intake_extract'
import { memoInputSchema, priceMemo } from '@/ai/steps/price_memo'
import { replyInputSchema, replyInterpret } from '@/ai/steps/reply_interpret'
import type { ModelClient, ReplayStore, StepDefinition, StepName } from '@/ai/types'
import { DEFAULT_RUNTIME_MODEL } from '@/config/models'
import outputsJson from '@/data/replay/outputs.json'
import runsJson from '@/data/replay/runs.json'
import seedJson from '@/data/seed.json'
import { createMemoryRepo, type MemoryRepo, type MemorySnapshot } from '@/repo/memoryRepo'
import type { AiRunRecord } from '@/repo/Repo'
import type { AiResponse, Backend, ResetResult } from './backendTypes'
import { appClock } from './clock'

// Bundled data, checked at load like any other boundary.

const stepName = z.enum(['intake_extract', 'reply_interpret', 'price_memo', 'cover_text'])
const checkSchema = z.object({ name: z.string(), pass: z.boolean(), detail: z.string() })

const seedSchema = z.object({
  customers: z.array(z.object({ name: z.string(), segment: z.string(), country: z.string() })),
  legacy_quotes: z.array(
    z.object({
      quote_id: z.string(),
      quote_date: z.string(),
      customer: z.string(),
      product: z.string(),
      material: z.string(),
      quantity: z.number(),
      production_cost: z.number(),
      quoted_price: z.number(),
      margin: z.number(),
      outcome: z.enum(['WON', 'LOST']),
      revision: z.number(),
      source: z.enum(['given', 'generated']),
    }),
  ),
})

const outputsSchema = z.array(z.object({ step: stepName, input_hash: z.string(), output: z.unknown() }))

const recordedRunSchema = z.object({
  id: z.string(),
  step: stepName,
  mode: z.enum(['live', 'replay', 'revised']),
  model: z.string(),
  request_id: z.string().nullable(),
  line_id: z.string().nullable(),
  input: z.unknown(),
  raw_output: z.string().nullable(),
  output: z.unknown(),
  checks: z.array(checkSchema),
  latency_ms: z.number(),
  tokens_in: z.number().nullable(),
  tokens_out: z.number().nullable(),
  accepted: z.boolean().nullable(),
  edited: z.boolean().nullable(),
  created_at: z.string(),
})

const seed = seedSchema.parse(seedJson)
const recordedOutputs = new Map(outputsSchema.parse(outputsJson).map((e) => [`${e.step}:${e.input_hash}`, e.output]))
// The recorder's extra field (replay_key) is dropped by the schema.
const recordedRuns: AiRunRecord[] = z.array(recordedRunSchema).parse(runsJson)

// The repository, restored from this tab's storage and saved after every write.

const STORAGE_KEY = 'linea.demo.data.v1'

const snapshotSchema = z.object({
  version: z.literal(1),
  data: z.object({
    customers: z.array(z.unknown()),
    requests: z.array(z.unknown()),
    lines: z.array(z.unknown()),
    quotations: z.array(z.unknown()),
    quotationLines: z.array(z.unknown()),
    responses: z.array(z.unknown()),
    checks: z.array(z.unknown()),
    orders: z.array(z.unknown()),
    events: z.array(z.unknown()),
    aiRuns: z.array(z.unknown()),
  }),
})

const memory = createMemoryRepo({ customers: seed.customers, legacyQuotes: seed.legacy_quotes, recordedAiRuns: recordedRuns, now: appClock.now })

function load(): void {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = snapshotSchema.safeParse(JSON.parse(raw))
    // The rows were written by save() below from the same types; the schema checks the envelope.
    if (parsed.success) memory.restore(parsed.data.data as MemorySnapshot)
  } catch {
    /* unreadable or unavailable: start from the seed */
  }
}

function save(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: memory.snapshot() }))
  } catch {
    /* storage unavailable or full: the data lasts for this page only */
  }
}

/** The methods that change data. After each one the tab's copy is saved. */
const WRITES: ReadonlySet<string> = new Set<keyof MemoryRepo>([
  'insertRequest',
  'updateRequest',
  'commitRequestTransition',
  'insertLine',
  'updateLine',
  'commitLineTransition',
  'insertQuotation',
  'updateQuotation',
  'insertQuotationLines',
  'insertResponse',
  'updateResponse',
  'insertCheck',
  'updateCheck',
  'insertOrder',
  'appendEvents',
  'insertAiRun',
  'decideAiRun',
])

function persisted(target: MemoryRepo): MemoryRepo {
  return new Proxy(target, {
    get(t, prop, receiver) {
      const value: unknown = Reflect.get(t, prop, receiver)
      if (typeof value !== 'function') return value
      const fn = value as (...args: unknown[]) => unknown
      if (typeof prop === 'string' && WRITES.has(prop)) {
        return async (...args: unknown[]) => {
          const result = await fn.apply(t, args)
          save()
          return result
        }
      }
      return fn.bind(t)
    },
  })
}

load()
const repo = persisted(memory)

// AI steps against the recorded outputs.

const DEFS: Record<StepName, { def: StepDefinition<unknown, unknown>; input: z.ZodType<unknown> }> = {
  intake_extract: { def: intakeExtract as StepDefinition<unknown, unknown>, input: intakeInputSchema },
  reply_interpret: { def: replyInterpret as StepDefinition<unknown, unknown>, input: replyInputSchema },
  price_memo: { def: priceMemo as StepDefinition<unknown, unknown>, input: memoInputSchema },
  cover_text: { def: coverText as StepDefinition<unknown, unknown>, input: coverInputSchema },
}

const replayStore: ReplayStore = {
  get: async (step, key) => recordedOutputs.get(`${step}:${key}`) ?? null,
  put: async () => {
    /* recordings are made offline by scripts/record-replay.ts */
  },
}

/** The public demo never calls the model. The step runner treats this like a failed call and falls back to the manual path. */
const noModel: ModelClient = async () => {
  throw new ModelCallError('api', 'no recorded output matches this input, and this demo does not call the model')
}

/** A replay answers at once; a short pause keeps the "AI working" state readable. */
const REPLAY_PACE_MS = 700

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((done) => {
    const t = setTimeout(done, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      done()
    })
  })
}

const envelopeIds = z.object({ request_id: z.string().nullable().optional(), line_id: z.string().nullable().optional() })

async function callStep<T>(step: StepName, body: unknown, output: z.ZodType<T>, _replay: boolean, signal: AbortSignal): Promise<AiResponse<T>> {
  const { def, input: inputSchema } = DEFS[step]
  const input = inputSchema.safeParse(body)
  if (!input.success) return { ok: false, error: 'The input for the AI step is not complete.', next: 'Check the fields, or continue by hand.', checks: [] }
  const ids = envelopeIds.safeParse(body)
  const request_id = ids.success ? (ids.data.request_id ?? null) : null
  const line_id = ids.success ? (ids.data.line_id ?? null) : null

  const started = Date.now()
  const outcome = await runStep(def, input.data, { model: DEFAULT_RUNTIME_MODEL, client: noModel, replay: replayStore, mode: 'replay' })
  await pause(REPLAY_PACE_MS, signal)
  if (signal.aborted) return { ok: false, error: 'Cancelled.', next: 'Run it again or continue by hand.', checks: [] }
  const latency_ms = Date.now() - started

  if (!outcome.ok) {
    const f = outcome.failure
    const run = await repo.insertAiRun({ step, mode: 'replay', model: f.model, request_id, line_id, input: input.data, raw_output: f.raw ?? null, output: null, checks: f.checks, latency_ms, tokens_in: null, tokens_out: null })
    return { ok: false, ai_run_id: run.id, error: f.error, next: f.next, checks: f.checks }
  }
  const r = outcome.result
  const parsed = output.safeParse(r.output)
  if (!parsed.success) return { ok: false, error: 'The recorded output does not match the step schema.', next: 'Continue by hand.', checks: r.checks }
  const run = await repo.insertAiRun({ step, mode: r.mode, model: r.model, request_id, line_id, input: input.data, raw_output: r.raw ?? JSON.stringify(r.output), output: r.output, checks: r.checks, latency_ms, tokens_in: null, tokens_out: null })
  return { ok: true, ai_run_id: run.id, output: parsed.data, checks: r.checks, mode: r.mode, model: r.model, latency_ms }
}

async function recordAiDecision(ai_run_id: string, accepted: boolean, edited: boolean): Promise<void> {
  try {
    await repo.decideAiRun(ai_run_id, accepted, edited)
  } catch (e) {
    console.warn('AI decision not recorded', e)
  }
}

async function resetDemo(): Promise<ResetResult> {
  const before = memory.snapshot()
  memory.reset()
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing stored */
  }
  return {
    ok: true,
    deleted: {
      requests: before.requests.length,
      lines: before.lines.length,
      quotations: before.quotations.length,
      quotation_lines: before.quotationLines.length,
      customer_responses: before.responses.length,
      feasibility_checks: before.checks.length,
      orders: before.orders.length,
      events: before.events.length,
      ai_runs: before.aiRuns.length,
    },
  }
}

export const backend: Backend = {
  kind: 'static',
  ready: true,
  repo,
  callStep,
  recordAiDecision,
  resetDemo,
  fixedExpectedMs: 1000,
}
