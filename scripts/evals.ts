// Eval runner. Spec 9.2. Run with GEMINI_API_KEY in the environment:
//   npm run evals -- --step intake_extract
//   npm run evals -- --all --runs 3
//   npm run evals -- --step intake_extract --kind heldout
//   npm run evals -- --step price_memo
// Options: --kind quality|adversarial|control|heldout|all (default all: quality, adversarial and
// control; held-out only when asked), --runs N (repeat the suite, report mean and range), --limit N.
// Writes evals/results/<step>-<timestamp>[-runK].json, updates evals/results/latest.json, prints a
// table and every failure with input, expected, output and failed checks.
// The text steps (price_memo, cover_text) are graded by the code checks plus the judge model
// (spec 9.1): a case passes when every check passes and the judge answers yes to all four criteria.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runStep } from '../src/ai/client'
import { gradeAdversarial, gradeIntake, gradeReply, padText } from '../src/ai/evals/grade'
import type {
  AdversarialCase,
  CaseResult,
  ControlCase,
  EvalCase,
  EvalResults,
  ExpectedIntake,
  ExpectedReply,
  MetricName,
  MetricStats,
  QualityCase,
  QualitySummary,
  RunMetrics,
  StepSummary,
} from '../src/ai/evals/types'
import { createGeminiClient } from '../src/ai/gemini'
import { judgeText, verdictPasses, type Verdict } from '../src/ai/judge'
import { intakeExtract, type IntakeInput, type IntakeOutput } from '../src/ai/steps/intake_extract'
import { coverText, type CoverOutput } from '../src/ai/steps/cover_text'
import { priceMemo, type MemoOutput } from '../src/ai/steps/price_memo'
import { replyInterpret, type ReplyInput, type ReplyOutput } from '../src/ai/steps/reply_interpret'
import type { ModelClient, StepDefinition, StepName } from '../src/ai/types'
import { FALLBACK_JUDGE_MODEL, judgeModel, runtimeModel } from '../src/config/models'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EVALS = resolve(ROOT, 'evals')
const RESULTS = resolve(EVALS, 'results')

const STEP_DEFS: Partial<Record<StepName, StepDefinition<unknown, unknown>>> = {
  intake_extract: intakeExtract as StepDefinition<unknown, unknown>,
  reply_interpret: replyInterpret as StepDefinition<unknown, unknown>,
  price_memo: priceMemo as StepDefinition<unknown, unknown>,
  cover_text: coverText as StepDefinition<unknown, unknown>,
}

const JUDGED_STEPS = new Set<StepName>(['price_memo', 'cover_text'])

type Kind = 'quality' | 'adversarial' | 'control' | 'heldout' | 'all'

function parseArgs(argv: string[]): { steps: StepName[]; kind: Kind; limit: number | null; runs: number } {
  const steps: StepName[] = []
  let kind: Kind = 'all'
  let limit: number | null = null
  let runs = 1
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--all') steps.push(...(Object.keys(STEP_DEFS) as StepName[]))
    else if (a === '--step') steps.push(argv[++i] as StepName)
    else if (a === '--kind') kind = argv[++i] as Kind
    else if (a === '--limit') limit = Number(argv[++i])
    else if (a === '--runs') runs = Math.max(1, Number(argv[++i]))
  }
  if (steps.length === 0 || steps.some((s) => !STEP_DEFS[s])) {
    console.error(`Usage: npm run evals -- --step <${Object.keys(STEP_DEFS).join('|')}> | --all [--kind quality|adversarial|control|heldout|all] [--runs N] [--limit N]`)
    process.exit(2)
  }
  return { steps: [...new Set(steps)], kind, limit, runs }
}

export function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as T)
}

function expandInput<I extends IntakeInput | ReplyInput>(c: AdversarialCase<I>): I {
  if (!c.pad) return c.input
  if ('text' in c.input) return { ...c.input, text: padText(c.input.text, c.pad) }
  return { ...c.input, reply_text: padText(c.input.reply_text, c.pad) }
}

function gradeObjective(step: StepName, expected: ExpectedIntake | ExpectedReply, output: unknown) {
  return step === 'intake_extract' ? gradeIntake(expected as ExpectedIntake, output as IntakeOutput) : gradeReply(expected as ExpectedReply, output as ReplyOutput)
}

/** The judge client: the judge model, with the documented fallback when the preview is unavailable to the key. */
type Judge = { client: ModelClient; model: string; fellBack: boolean }

async function judgeWithFallback(judge: Judge, step: 'price_memo' | 'cover_text', rendered: string, text: string): Promise<Verdict> {
  try {
    return await judgeText(step, rendered, text, { client: judge.client, model: judge.model })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!judge.fellBack && /not found|404|unavailable|not supported|permission/i.test(msg)) {
      console.warn(`\n  judge ${judge.model} unavailable (${msg.slice(0, 80)}); falling back to ${FALLBACK_JUDGE_MODEL}`)
      judge.model = FALLBACK_JUDGE_MODEL
      judge.fellBack = true
      return judgeText(step, rendered, text, { client: judge.client, model: judge.model })
    }
    throw e
  }
}

function textOf(step: StepName, output: unknown): string {
  if (step === 'price_memo') return (output as MemoOutput).memo
  if (step === 'cover_text') return (output as CoverOutput).text
  return JSON.stringify(output)
}

async function runCases(step: StepName, cases: EvalCase[], client: ModelClient, model: string, judge: Judge | null): Promise<CaseResult[]> {
  const def = STEP_DEFS[step]!
  const results: CaseResult[] = []
  for (const c of cases) {
    const input = c.kind === 'adversarial' ? expandInput(c as AdversarialCase<IntakeInput | ReplyInput>) : c.input
    process.stdout.write(`  ${c.id} … `)
    const outcome = await runStep(def, input, { model, client, replay: null, mode: 'live' })
    const checks = outcome.ok ? outcome.result.checks : outcome.failure.checks
    const output = outcome.ok ? outcome.result.output : null
    const latency_ms = outcome.ok ? outcome.result.latency_ms : outcome.failure.latency_ms
    const mode = outcome.ok ? outcome.result.mode : 'failed'
    const checks_failed = checks.filter((k) => !k.pass).map((k) => k.name)
    const base = { id: c.id, kind: c.kind, tags: c.tags, latency_ms, mode, checks_failed, output } as const

    if (c.kind === 'adversarial') {
      const g = gradeAdversarial(c.marker, c.intent, c.expected, output, checks)
      const pass = !g.contaminated && g.schema_valid
      results.push({ ...base, pass, detail: g.detail, contaminated: g.contaminated, flagged: g.flagged, schema_valid: g.schema_valid, ...(outcome.ok ? {} : { error: outcome.failure.error }) })
      console.log(`${pass ? 'ok' : 'FAIL'} (${g.flagged ? 'flagged' : 'not flagged'}) ${g.detail}`)
      continue
    }

    if (!outcome.ok) {
      results.push({ ...base, pass: false, detail: outcome.failure.error, error: outcome.failure.error, flagged: checks_failed.includes('no_instruction_text') })
      console.log(`FAIL ${outcome.failure.error}`)
      continue
    }

    if (c.kind === 'judged') {
      if (!judge || (step !== 'price_memo' && step !== 'cover_text')) throw new Error(`No judge for step ${step}.`)
      const verdict = await judgeWithFallback(judge, step, def.userPrompt(c.input), textOf(step, output))
      const judgeOk = verdictPasses(verdict)
      const pass = checks_failed.length === 0 && judgeOk
      const failedCriteria = (['clear', 'cites_references', 'no_invented_fact', 'right_length'] as const).filter((k) => !verdict[k])
      const detail = [checks_failed.length ? `checks failed: ${checks_failed.join(', ')}` : 'checks ok', judgeOk ? 'judge: all four yes' : `judge: no on ${failedCriteria.join(', ')} (${verdict.notes})`, mode === 'revised' ? 'after one revision round' : ''].filter(Boolean).join(' · ')
      results.push({ ...base, pass, detail, judge: verdict })
      console.log(`${pass ? 'ok' : 'FAIL'} ${detail}`)
      continue
    }

    const g = gradeObjective(step, (c as QualityCase<unknown> | ControlCase<unknown>).expected, output)
    const flagged = checks_failed.includes('no_instruction_text')
    results.push({ ...base, pass: g.pass, detail: g.detail, flagged, ...(g.precision !== undefined ? { precision: g.precision, recall: g.recall, f1: g.f1 } : {}) })
    console.log(`${g.pass ? 'ok' : 'FAIL'} ${g.detail}${c.kind === 'control' ? (flagged ? ' [flagged]' : ' [not flagged]') : ''}`)
  }
  return results
}

const rate = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 1000)

function qualitySummary(results: CaseResult[]): QualitySummary {
  const pass = results.filter((r) => r.pass).length
  return { cases: results.length, pass, fail: results.length - pass, pass_rate: rate(pass, results.length), results }
}

function summarize(step: StepName, model: string, quality: CaseResult[] | null, adversarial: CaseResult[] | null, control: CaseResult[] | null, judge_model?: string): StepSummary {
  return {
    step,
    model,
    ...(judge_model ? { judge_model } : {}),
    quality: quality ? qualitySummary(quality) : null,
    adversarial: adversarial
      ? {
          cases: adversarial.length,
          contamination_rate: rate(adversarial.filter((r) => r.contaminated).length, adversarial.length),
          flag_recall: rate(adversarial.filter((r) => r.flagged).length, adversarial.length),
          schema_validity: rate(adversarial.filter((r) => r.schema_valid).length, adversarial.length),
          results: adversarial,
        }
      : null,
    control: control
      ? { cases: control.length, false_positive_rate: rate(control.filter((r) => r.flagged).length, control.length), pass: control.filter((r) => r.pass).length, results: control }
      : null,
  }
}

function metricsOf(s: StepSummary, run: number): RunMetrics {
  const m: RunMetrics = { run, at: new Date().toISOString() }
  if (s.quality) m.quality_pass_rate = s.quality.pass_rate
  if (s.adversarial) {
    m.contamination_rate = s.adversarial.contamination_rate
    m.flag_recall = s.adversarial.flag_recall
    m.schema_validity = s.adversarial.schema_validity
  }
  if (s.control) m.control_false_positive_rate = s.control.false_positive_rate
  return m
}

function aggregate(runs: RunMetrics[]): Partial<Record<MetricName, MetricStats>> {
  const out: Partial<Record<MetricName, MetricStats>> = {}
  const names: MetricName[] = ['quality_pass_rate', 'contamination_rate', 'flag_recall', 'schema_validity', 'control_false_positive_rate']
  for (const name of names) {
    const values = runs.map((r) => r[name]).filter((v): v is number => typeof v === 'number')
    if (values.length === 0) continue
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    out[name] = { mean: Math.round(mean * 1000) / 1000, min: Math.min(...values), max: Math.max(...values), n: values.length }
  }
  return out
}

const pct = (v: number) => `${(v * 100).toFixed(0)}%`

function printSummary(s: StepSummary): void {
  console.log('')
  console.log(`Step ${s.step} · model ${s.model}${s.judge_model ? ` · judge ${s.judge_model}` : ''}`)
  if (s.quality) console.log(`  quality      ${s.quality.pass}/${s.quality.cases} pass (${pct(s.quality.pass_rate)})`)
  if (s.adversarial) {
    console.log(`  adversarial  contamination ${pct(s.adversarial.contamination_rate)} · flag recall ${pct(s.adversarial.flag_recall)} · schema validity ${pct(s.adversarial.schema_validity)} (${s.adversarial.cases} cases)`)
  }
  if (s.control) console.log(`  controls     false positives ${pct(s.control.false_positive_rate)} · ${s.control.pass}/${s.control.cases} graded ok`)
  if (s.heldout) console.log(`  held-out     ${s.heldout.pass}/${s.heldout.cases} pass (${pct(s.heldout.pass_rate)})`)
  const judged = s.quality?.results.filter((r) => r.judge) ?? []
  if (judged.length > 0) {
    const checksOk = judged.filter((r) => r.checks_failed.length === 0).length
    const judgeOk = judged.filter((r) => r.judge && verdictPasses(r.judge)).length
    const revised = judged.filter((r) => r.mode === 'revised').length
    console.log(`  text step    checks ok ${checksOk}/${judged.length} · judge ok ${judgeOk}/${judged.length} · revised ${revised}`)
  }
  const failures = [...(s.quality?.results ?? []), ...(s.adversarial?.results ?? []), ...(s.control?.results ?? []), ...(s.heldout?.results ?? [])].filter((r) => !r.pass)
  if (failures.length > 0) {
    console.log(`  failures (${failures.length}):`)
    for (const f of failures) console.log(`  - ${f.id} [${f.kind}] ${f.detail}${f.checks_failed.length ? ` · failed checks: ${f.checks_failed.join(', ')}` : ''}`)
  }
}

function printAggregate(step: StepName, agg: Partial<Record<MetricName, MetricStats>>): void {
  console.log(`\nStep ${step} · mean and range over ${Object.values(agg)[0]?.n ?? 0} run(s)`)
  for (const [name, s] of Object.entries(agg)) {
    if (s) console.log(`  ${name.padEnd(28)} mean ${pct(s.mean)} · range ${pct(s.min)} to ${pct(s.max)}`)
  }
}

function printFailureDetails(step: StepName, cases: EvalCase[], results: CaseResult[]): void {
  const byId = new Map(cases.map((c) => [c.id, c]))
  for (const r of results.filter((x) => !x.pass)) {
    const c = byId.get(r.id)
    console.log('')
    console.log(`=== ${step} ${r.id} ===`)
    console.log('input:', JSON.stringify(c?.input).slice(0, 600))
    console.log('expected:', JSON.stringify((c as QualityCase<unknown> | undefined)?.expected ?? {}))
    console.log('output:', JSON.stringify(r.output).slice(0, 900))
    console.log('failed checks:', r.checks_failed.join(', ') || 'none', '· detail:', r.detail)
    if (r.judge) console.log('judge:', JSON.stringify(r.judge))
  }
}

async function main(): Promise<void> {
  const { steps, kind, limit, runs } = parseArgs(process.argv.slice(2))
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set. Run: npx netlify dev:exec "npm run evals -- --all"')
    process.exit(2)
  }
  const model = runtimeModel(process.env)
  const client = createGeminiClient(apiKey)
  const judge: Judge = { client, model: judgeModel(process.env), fellBack: false }
  mkdirSync(RESULTS, { recursive: true })
  const latestPath = resolve(RESULTS, 'latest.json')
  const latest: EvalResults = existsSync(latestPath) ? (JSON.parse(readFileSync(latestPath, 'utf8')) as EvalResults) : { generated_at: '', steps: {} }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const take = <T,>(arr: T[]) => (limit ? arr.slice(0, limit) : arr)

  for (const step of steps) {
    const previous = latest.steps[step]
    const judged = JUDGED_STEPS.has(step)

    if (kind === 'heldout') {
      // Held-out: run once, report separately, never tune on it.
      const cases = take(readJsonl<EvalCase>(resolve(EVALS, `${step}.heldout.jsonl`)))
      if (cases.length === 0) {
        console.log(`\n# ${step}: no held-out file`)
        continue
      }
      console.log(`\n# ${step} held-out (${model})`)
      const results = await runCases(step, cases, client, model, judged ? judge : null)
      const heldout = qualitySummary(results)
      const summary: StepSummary = { step, model, quality: null, adversarial: null, control: null, heldout }
      printSummary(summary)
      printFailureDetails(step, cases, results)
      writeFileSync(resolve(RESULTS, `${step}-heldout-${stamp}.json`), JSON.stringify(summary, null, 2))
      latest.steps[step] = { ...(previous ?? { step, model, quality: null, adversarial: null, control: null }), heldout }
      continue
    }

    const quality = kind === 'all' || kind === 'quality' ? take(readJsonl<EvalCase>(resolve(EVALS, `${step}.jsonl`))) : []
    const adversarial = kind === 'all' || kind === 'adversarial' ? take(readJsonl<EvalCase>(resolve(EVALS, `${step}.adversarial.jsonl`))) : []
    const control = kind === 'all' || kind === 'control' ? take(readJsonl<ControlCase<unknown>>(resolve(EVALS, 'controls.jsonl')).filter((c) => c.step === step) as EvalCase[]) : []

    const runMetrics: RunMetrics[] = []
    let last: StepSummary | null = null
    for (let k = 1; k <= runs; k++) {
      console.log(`\n# ${step} (${model}${judged ? `, judge ${judge.model}` : ''})${runs > 1 ? ` · run ${k} of ${runs}` : ''}`)
      const qr = quality.length ? await runCases(step, quality, client, model, judged ? judge : null) : null
      const ar = adversarial.length ? await runCases(step, adversarial, client, model, null) : null
      const cr = control.length ? await runCases(step, control, client, model, null) : null
      const summary = summarize(step, model, qr, ar, cr, judged ? judge.model : undefined)
      printSummary(summary)
      printFailureDetails(step, [...quality, ...adversarial, ...control], [...(qr ?? []), ...(ar ?? []), ...(cr ?? [])])
      writeFileSync(resolve(RESULTS, `${step}-${stamp}${runs > 1 ? `-run${k}` : ''}.json`), JSON.stringify(summary, null, 2))
      runMetrics.push(metricsOf(summary, k))
      last = summary
    }
    if (!last) continue
    const agg = aggregate(runMetrics)
    if (runs > 1) printAggregate(step, agg)

    latest.steps[step] = {
      step,
      model,
      ...(last.judge_model ? { judge_model: last.judge_model } : {}),
      quality: last.quality ?? previous?.quality ?? null,
      adversarial: last.adversarial ?? previous?.adversarial ?? null,
      control: last.control ?? previous?.control ?? null,
      heldout: previous?.heldout ?? null,
      runs: runMetrics,
      aggregate: agg,
    }
  }
  latest.generated_at = new Date().toISOString()
  writeFileSync(latestPath, JSON.stringify(latest, null, 2))
  console.log(`\nWrote ${latestPath}`)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.stack ?? e.message : String(e))
    process.exit(1)
  })
}
