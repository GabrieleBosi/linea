// Replay recorder. Spec 4.1.1. Runs scenarios A and B step by step on an in-memory copy of the
// seed data, on the demo date, and collects every AI input the demo can send: the intake and reply
// inputs of the player steps, the price memo of every editable line after every step, and the
// cover text of every revision that has prices. Each distinct replay key is recorded once, live,
// retried up to three times until every check passes. Writes the outputs to
// src/data/replay/outputs.json and the trace of each recorded call to src/data/replay/runs.json.
// The static demo bundles both files.
//   Dry run, no model call:  npx tsx scripts/record-replay.ts --dry
//   Record what is missing:  npx tsx scripts/record-replay.ts   (needs GEMINI_API_KEY)
//   Re-run today's checks on the recorded traces, no model call:  npx tsx scripts/record-replay.ts --recheck
//   Record every input of one step again, after its prompt changed:  npx tsx scripts/record-replay.ts --rerecord price_memo

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runStep, validateOutput } from '../src/ai/client'
import { createGeminiClient } from '../src/ai/gemini'
import { memoInputFrom } from '../src/ai/memoInput'
import { replayKey } from '../src/ai/replayKey'
import { coverText, type CoverInput } from '../src/ai/steps/cover_text'
import { intakeExtract, type IntakeInput } from '../src/ai/steps/intake_extract'
import { priceMemo } from '../src/ai/steps/price_memo'
import { replyInterpret, type ReplyInput } from '../src/ai/steps/reply_interpret'
import type { Check, StepDefinition, StepName } from '../src/ai/types'
import { DEMO_DATE } from '../src/config/demo'
import { runtimeModel } from '../src/config/models'
import type { Line, Quotation, QuotationLine } from '../src/domain/types'
import type { Repo } from '../src/repo/Repo'
import { createMemoryRepo } from '../src/repo/memoryRepo'
import { createScenarioContext, SCENARIOS } from '../src/scenarios'
import { addDays, revisionLines } from '../src/services/context'
import { configurationInsight } from '../src/services/references'
import { VALIDITY_DAYS } from '../src/services/revisions'
import { CUSTOMERS, generateLegacyQuotes } from './generate-legacy'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'src/data/replay')
const OUTPUTS = resolve(OUT_DIR, 'outputs.json')
const RUNS = resolve(OUT_DIR, 'runs.json')

export type ReplayEntry = { step: StepName; input_hash: string; output: unknown }
export type TraceRun = {
  id: string
  /** The replay entry this call produced. Not an ai_runs column; it ties the trace to the entry. */
  replay_key: string
  step: StepName
  mode: 'live'
  model: string
  request_id: null
  line_id: null
  input: unknown
  raw_output: string
  output: unknown
  checks: Check[]
  latency_ms: number
  tokens_in: number | null
  tokens_out: number | null
  accepted: null
  edited: null
  created_at: string
}

const EDITABLE = new Set(['draft', 'negotiating'])
const DEFS: Record<StepName, StepDefinition<unknown, unknown>> = {
  intake_extract: intakeExtract as StepDefinition<unknown, unknown>,
  reply_interpret: replyInterpret as StepDefinition<unknown, unknown>,
  price_memo: priceMemo as StepDefinition<unknown, unknown>,
  cover_text: coverText as StepDefinition<unknown, unknown>,
}

type Collected = { step: StepName; input: unknown; where: string }

/** The cover input the revision screen builds. Draft: the open lines that are not agreed. Sent: the snapshot. */
async function coverInputOf(repo: Repo, quotation: Quotation, previous: Quotation | null, customer: string, delivery: string | null, today: string): Promise<CoverInput | null> {
  type Row = Pick<QuotationLine, 'line_id' | 'line_no' | 'family' | 'size' | 'material' | 'length_mm' | 'quantity'> & { unit_price: number | null; total_price: number | null; subject_to_feasibility: boolean }
  let rows: Row[]
  if (quotation.status === 'draft') {
    rows = revisionLines(await repo.listLines(quotation.request_id)).map((l: Line) => ({
      line_id: l.id,
      line_no: l.line_no,
      family: l.family,
      size: l.size,
      material: l.material,
      length_mm: l.length_mm,
      quantity: l.quantity,
      unit_price: l.unit_price,
      total_price: l.unit_price === null ? null : Math.round(l.unit_price * l.quantity * 100) / 100,
      subject_to_feasibility: l.technical_status === 'pending',
    }))
  } else {
    rows = await repo.listQuotationLines(quotation.id)
  }
  if (rows.length === 0 || rows.some((r) => r.unit_price === null || r.total_price === null)) return null
  const prev = new Map((previous && previous.status !== 'draft' ? await repo.listQuotationLines(previous.id) : []).map((s) => [s.line_id, s]))
  return {
    sender: 'Ferralba Steel',
    customer,
    contact: null,
    revision: {
      revision_no: quotation.revision_no,
      lines: rows.map((r) => ({
        line_no: r.line_no,
        family: r.family,
        size: r.size,
        material: r.material,
        length_mm: r.length_mm,
        quantity: r.quantity,
        unit_price: r.unit_price as number,
        total_price: r.total_price as number,
        subject_to_feasibility: r.subject_to_feasibility,
      })),
    },
    diff_from_previous: rows.flatMap((r) => {
      const p = prev.get(r.line_id)
      if (previous && !p) return [{ line_no: r.line_no, change: 'new line' }]
      if (!p) return []
      const parts: string[] = []
      if (p.family !== r.family || p.size !== r.size || p.material !== r.material || p.length_mm !== r.length_mm) parts.push(`configuration ${p.family} ${p.size} ${p.material} ${p.length_mm} mm → ${r.family} ${r.size} ${r.material} ${r.length_mm} mm × ${r.quantity}`)
      if (p.quantity !== r.quantity) parts.push(`quantity ${p.quantity} → ${r.quantity}`)
      if (p.unit_price !== r.unit_price) parts.push(`unit price ${p.unit_price.toFixed(2)} → ${(r.unit_price as number).toFixed(2)} EUR`)
      return parts.length ? [{ line_no: r.line_no, change: parts.join(', ') }] : []
    }),
    valid_until: quotation.status === 'draft' || !quotation.valid_until ? addDays(today, VALIDITY_DAYS) : quotation.valid_until,
    lines_subject_to_feasibility: rows.filter((r) => r.subject_to_feasibility).map((r) => r.line_no),
    delivery_date: delivery,
  }
}

/** Every AI input of the two scenarios, by replay key, over the orders a visitor can take in one session. */
async function collect(today: string): Promise<Map<string, Collected>> {
  const legacy = generateLegacyQuotes()
  const out = new Map<string, Collected>()
  const add = async (step: StepName, input: unknown, where: string) => {
    const k = await replayKey(step, DEFS[step].replayFields(input))
    if (!out.has(`${step}:${k}`)) out.set(`${step}:${k}`, { step, input, where })
  }
  const orders: Array<Array<'a' | 'b'>> = [['a', 'b'], ['b', 'a'], ['a'], ['b']]
  for (const order of orders) {
    let tick = 0
    const now = () => new Date(Date.parse(`${today}T09:00:00Z`) + tick++ * 1000).toISOString()
    const repo = createMemoryRepo({ customers: CUSTOMERS.map((c) => ({ name: c.name, segment: c.segment, country: c.country })), legacyQuotes: legacy, now })
    for (const id of order) {
      const scenario = SCENARIOS.find((s) => s.id === id)
      if (!scenario) throw new Error(`scenario ${id}`)
      let stepId = ''
      // The hooks capture the input and return nothing: the step then takes its script, as it does after a model failure.
      const ctx = createScenarioContext(repo, {
        clock: { today: () => today, now },
        ai: {
          mode: 'replay',
          intake: async (input: IntakeInput) => (await add('intake_extract', input, `${order.join('+')} ${stepId}`), null),
          interpret: async (input: ReplyInput) => (await add('reply_interpret', input, `${order.join('+')} ${stepId}`), null),
        },
      })
      for (const step of scenario.steps) {
        stepId = step.id
        await step.run(ctx)
        await step.expect(ctx)
        const requestId = ctx.state.requestId
        if (typeof requestId !== 'string') continue
        const request = await repo.getRequest(requestId)
        if (!request) continue
        const customer = (await repo.getCustomer(request.customer_id))?.name ?? ''
        const where = `${order.join('+')} after ${step.id}`
        if (request.status === 'open') {
          for (const line of await repo.listLines(requestId)) {
            if (!EDITABLE.has(line.commercial_status)) continue
            const config = { family: line.family, size: line.size, material: line.material, length_mm: line.length_mm, quantity: line.quantity }
            // As the composer does: the request's own lines are not references for it.
            const insight = await configurationInsight(ctx.as('sales'), config, customer, undefined, request.ref)
            const input = memoInputFrom(config, customer, insight)
            if (input) await add('price_memo', input, `${where} L${line.line_no}`)
          }
        }
        const quotations = (await repo.listQuotations(requestId)).sort((a, b) => a.revision_no - b.revision_no)
        for (const q of quotations) {
          if (q.status === 'superseded') continue
          const previous = quotations.find((p) => p.revision_no === q.revision_no - 1) ?? null
          const input = await coverInputOf(repo, q, previous, customer, request.requested_delivery_date, today)
          if (input) await add('cover_text', input, `${where} R${q.revision_no} (${q.status})`)
        }
      }
    }
  }
  return out
}

function readJson<T>(file: string, fallback: T): T {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback
}

function save(entries: Map<string, ReplayEntry>, runs: TraceRun[]): void {
  mkdirSync(OUT_DIR, { recursive: true })
  const sorted = [...entries.values()].sort((a, b) => a.step.localeCompare(b.step) || a.input_hash.localeCompare(b.input_hash))
  writeFileSync(OUTPUTS, JSON.stringify(sorted, null, 2) + '\n')
  writeFileSync(RUNS, JSON.stringify(runs, null, 2) + '\n')
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry')
  const inputs = await collect(DEMO_DATE)
  const entries = new Map(readJson<ReplayEntry[]>(OUTPUTS, []).map((e) => [`${e.step}:${e.input_hash}`, e]))
  let runs = readJson<TraceRun[]>(RUNS, [])
  const green = (step: StepName, input: unknown, output: unknown): boolean => {
    const def = DEFS[step]
    const parsed = def.schema.safeParse(output)
    return parsed.success && def.checks(input, parsed.data).every((c) => c.pass)
  }

  // The replay key holds no prompt version: after a prompt change, --rerecord <step> records that step again.
  const rerecordAt = process.argv.indexOf('--rerecord')
  const rerecord = rerecordAt >= 0 ? process.argv[rerecordAt + 1] : undefined
  if (rerecord !== undefined && !(rerecord in DEFS)) {
    console.error(`--rerecord takes a step name: ${Object.keys(DEFS).join(', ')}.`)
    process.exit(2)
  }
  const missing = [...inputs.entries()].filter(([k, c]) => {
    const e = entries.get(k)
    return c.step === rerecord || !e || !green(c.step, c.input, e.output)
  })
  const byStep = (list: Array<[string, Collected]>) => Object.entries(list.reduce<Record<string, number>>((acc, [, c]) => ({ ...acc, [c.step]: (acc[c.step] ?? 0) + 1 }), {})).map(([s, n]) => `${s} ${n}`).join(', ')
  console.log(`Demo date ${DEMO_DATE}. ${inputs.size} distinct input(s): ${byStep([...inputs.entries()])}. To record: ${missing.length}${missing.length ? ` (${byStep(missing)})` : ''}.`)
  if (dry) {
    for (const [k, c] of inputs) console.log(`  ${c.step.padEnd(15)} ${k.split(':')[1]!.slice(0, 10)}…  ${missing.some(([m]) => m === k) ? 'MISSING' : 'cached'}  ${c.where}`)
    return
  }
  if (process.argv.includes('--recheck')) {
    // After a check changes: the traces carry the results of today's checks on their recorded
    // outputs, as a replay computes them. No model call.
    let changed = 0
    runs = runs.map((run) => {
      const def = DEFS[run.step]
      const v = validateOutput(def, JSON.stringify(run.output))
      const checks = v.output === null ? [v.check] : [v.check, ...def.checks(run.input, v.output)]
      if (JSON.stringify(checks) === JSON.stringify(run.checks)) return run
      changed++
      const was = run.checks.filter((c) => !c.pass).map((c) => c.name)
      const now = checks.filter((c) => !c.pass).map((c) => c.name)
      console.log(`  ${run.step} ${run.replay_key.slice(0, 10)}…  failed before: ${was.join(', ') || 'none'}; failed now: ${now.join(', ') || 'none'}`)
      return { ...run, checks }
    })
    save(entries, runs)
    console.log(`${changed} of ${runs.length} trace(s) updated to today's checks.`)
    return
  }

  // Keep only the entries the demo can reach; drop stale ones.
  for (const k of [...entries.keys()]) if (!inputs.has(k)) entries.delete(k)
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set.')
    process.exit(2)
  }
  const client = createGeminiClient(apiKey)
  const model = runtimeModel(process.env)
  let failures = 0
  let tick = 0
  for (const [k, c] of missing) {
    const def = DEFS[c.step]
    process.stdout.write(`${c.step} ${c.where} … `)
    let outcome = await runStep(def, c.input, { model, client, replay: null, mode: 'live' })
    for (let t = 1; t < 3 && (!outcome.ok || outcome.result.checks.some((x) => !x.pass)); t++) {
      outcome = await runStep(def, c.input, { model, client, replay: null, mode: 'live' })
    }
    if (!outcome.ok) {
      failures++
      console.log(`FAILED: ${outcome.failure.error}`)
      continue
    }
    const r = outcome.result
    entries.set(k, { step: c.step, input_hash: outcome.replay_key, output: r.output })
    runs = runs.filter((run) => !(run.step === c.step && run.replay_key === outcome.replay_key))
    runs.push({
      id: randomUUID(),
      replay_key: outcome.replay_key,
      step: c.step,
      mode: 'live',
      model,
      request_id: null,
      line_id: null,
      input: c.input,
      raw_output: r.raw ?? JSON.stringify(r.output),
      output: r.output,
      checks: r.checks,
      latency_ms: r.latency_ms,
      tokens_in: r.tokens_in ?? null,
      tokens_out: r.tokens_out ?? null,
      accepted: null,
      edited: null,
      created_at: new Date(Date.parse(`${DEMO_DATE}T08:00:00Z`) + tick++ * 60_000).toISOString(),
    })
    save(entries, runs)
    const failed = r.checks.filter((x) => !x.pass).map((x) => x.name)
    console.log(`recorded ${outcome.replay_key.slice(0, 10)}… ${(r.latency_ms / 1000).toFixed(1)} s${failed.length ? ` (failed checks: ${failed.join(', ')})` : ''}`)
  }
  // Traces of entries that were dropped go too.
  save(entries, runs.filter((run) => entries.has(`${run.step}:${run.replay_key}`)))
  console.log(`${entries.size} entr(ies) in ${OUTPUTS.replace(ROOT, '.')}. ${failures} failure(s).`)
  if (failures > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e))
  process.exit(1)
})
