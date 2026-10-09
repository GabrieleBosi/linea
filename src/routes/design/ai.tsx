// AI and evals page. Spec 8.6: step cards, eval results, error analysis, live traces, latency and cost, guardrails.

import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { EvalResults, MetricName, StepSummary } from '@/ai/evals/types'
import type { Check } from '@/ai/types'
import { CheckBadges } from '@/components/AiDraftBlock'
import { Markdown } from '@/components/Markdown'
import { TraceLink } from '@/components/TraceDrawer'
import { DEFAULT_RUNTIME_MODEL } from '@/config/models'
import { costOfRun, MODEL_PRICES } from '@/config/pricing'
import { dateTime } from '@/lib/format'
import { coverText } from '@/ai/steps/cover_text'
import { intakeExtract } from '@/ai/steps/intake_extract'
import { priceMemo } from '@/ai/steps/price_memo'
import { replyInterpret } from '@/ai/steps/reply_interpret'
import type { StepDefinition } from '@/ai/types'
import { backend } from '@/lib/backend'
import errorAnalysis from '../../../evals/error-analysis.md?raw'
import latestJson from '../../../evals/results/latest.json'

export const Route = createFileRoute('/design/ai')({
  component: AiPage,
})

const latest = latestJson as unknown as EvalResults

const STEP_CARDS = [
  {
    name: 'intake_extract',
    purpose: 'Turn a pasted customer request into structured lines and open questions.',
    schema: 'customer_name_guess, lines[{family, size, material, length_mm, quantity, notes, source_span, confidence}], open_questions, stated_date, requested_delivery_date, delivery_hint',
    checks: ['schema_valid', 'size_in_catalog', 'quantity_positive', 'span_grounded', 'units_normalized', 'no_instruction_text', 'dates_grounded'],
    approval: 'Editable table on screen 1. "Create request with N lines" applies; "Add lines manually instead" skips the draft.',
    scope: 'P0',
  },
  {
    name: 'reply_interpret',
    purpose: 'Turn a customer reply into one decision per quoted line.',
    schema: 'decisions[{line_no, decision, changes{quantity, length_mm, material, size, target_unit_price}, source_span, confidence}], overall, needs_clarification',
    checks: ['schema_valid', 'all_lines_covered', 'span_grounded', 'changes_are_numbers', 'no_instruction_text'],
    approval: 'Editable decisions table in the response dialog. "Apply decisions" runs applyEvent per line.',
    scope: 'P0',
  },
  {
    name: 'price_memo',
    purpose: 'Three sentences that explain the suggested price to Sales, with references.',
    schema: 'memo, cited_reference_ids',
    checks: ['numbers_grounded', 'references_exist', 'length_ok', 'price_in_range', 'numbers_displayed'],
    approval: '"Generate memo", "Edit", "Keep" in the line composer. One revision round on a failed check.',
    scope: 'P1',
  },
  {
    name: 'cover_text',
    purpose: 'The customer-facing text of a quotation revision.',
    schema: 'text',
    checks: ['every_line_present', 'validity_present', 'feasibility_disclaimer', 'no_delivery_promise', 'length_ok'],
    approval: 'Editable AI draft block on the revision page. One revision round on a failed check.',
    scope: 'P1',
  },
] as const

const GUARDRAILS = [
  'Iteration caps: one model call per step, one revision round where allowed, one retry on a fast network error.',
  'Timeouts: 25 s for intake and reply, 45 s and 35 s for the P1 steps, below the 60 s function limit.',
  'Replay fallback: a cache keyed by the step and a hash of the fields that change the answer, read first when the toggle is on and after any failure.',
  'Schema validation: every output parsed by zod with strict objects; a failure is a check, not an exception.',
  'No side effects from LLM output: the model has no tools; only a human approval followed by applyEvent() changes state.',
  'Server-side keys only: the Gemini key and the service-role key live in the functions; the browser has the anon key. The public demo has no keys at all.',
  'Customer text is data: the system instruction says so, spans must exist in the input, a heuristic flags instruction-like text, the UI never renders output as HTML.',
  'The company, its customers and its people are fictional.',
] as const

const STEP_DEFS: Record<string, StepDefinition<never, unknown>> = {
  intake_extract: intakeExtract as unknown as StepDefinition<never, unknown>,
  reply_interpret: replyInterpret as unknown as StepDefinition<never, unknown>,
  price_memo: priceMemo as unknown as StepDefinition<never, unknown>,
  cover_text: coverText as unknown as StepDefinition<never, unknown>,
}

/** The settings a card shows: from the step definition in code, and the p50 latency of the last eval run in latest.json. */
function settingsOf(step: string): string {
  const def = STEP_DEFS[step]
  if (!def) return ''
  const lat = (latest.steps[step as keyof typeof latest.steps]?.quality?.results ?? []).map((r) => r.latency_ms).sort((a, b) => a - b)
  const p50 = lat.length ? `, measured p50 ${(percentile(lat, 0.5) / 1000).toFixed(1)} s (last eval run, ${lat.length} cases)` : ''
  return `${def.budget_ms / 1000} s budget, temperature ${def.temperature}, thinking ${def.thinking === 'minimal' ? 'LOW' : 'MEDIUM'}${p50}`
}

const pct = (v: number | undefined) => (v === undefined ? '—' : `${(v * 100).toFixed(0)}%`)

function MetricCell({ s, name, value }: { s: StepSummary; name: MetricName; value: number | undefined }) {
  const agg = s.aggregate?.[name]
  return (
    <td className="border-b px-2 py-1.5 tabular-nums">
      {pct(value)}
      {agg && agg.n > 1 && (
        <span className="ml-1 text-xs text-muted-foreground">
          mean {pct(agg.mean)}, {pct(agg.min)}–{pct(agg.max)} over {agg.n}
        </span>
      )}
    </td>
  )
}

type Stat = { step: string; n: number; p50: number; p95: number; tokens_in: number; tokens_out: number; cost: number; runs_with_tokens: number }

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
}

/**
 * Latency per step from the latest eval run (the quality cases, as on the step cards). Shown when
 * no live run is recorded, as after a reset. Replay runs are traced but left out of latency and
 * cost. The eval runner does not record tokens, so these rows carry no tokens and no cost.
 */
const EVAL_STATS: Stat[] = Object.values(latest.steps).flatMap((s) => {
  const sorted = (s?.quality?.results ?? []).filter((r) => r.mode !== 'replay').map((r) => r.latency_ms).sort((a, b) => a - b)
  if (!s || sorted.length === 0) return []
  return [{ step: s.step, n: sorted.length, p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), tokens_in: 0, tokens_out: 0, cost: 0, runs_with_tokens: 0 }]
})

function AiPage() {
  const isStatic = backend.kind === 'static'
  const traces = useQuery({
    queryKey: ['ai-runs-recent'],
    enabled: backend.ready,
    queryFn: () => backend.repo.listAiRuns({ limit: 20 }),
  })
  // The static demo only replays, so its latency comes from the eval runs.
  const stats = useQuery({
    queryKey: ['ai-runs-stats'],
    enabled: backend.ready && !isStatic,
    queryFn: async () => {
      const data = await backend.repo.listAiRuns({ limit: 1000 })
      const by = new Map<string, Stat & { latencies: number[] }>()
      for (const r of data) {
        if (r.mode === 'replay') continue
        const s = by.get(r.step) ?? { step: r.step, n: 0, p50: 0, p95: 0, tokens_in: 0, tokens_out: 0, cost: 0, runs_with_tokens: 0, latencies: [] }
        s.n++
        s.latencies.push(r.latency_ms)
        if (r.tokens_in !== null || r.tokens_out !== null) {
          s.runs_with_tokens++
          s.tokens_in += r.tokens_in ?? 0
          s.tokens_out += r.tokens_out ?? 0
          s.cost += costOfRun(r.model, r.tokens_in, r.tokens_out) ?? 0
        }
        by.set(r.step, s)
      }
      return [...by.values()].map((s) => {
        const sorted = [...s.latencies].sort((a, b) => a - b)
        return { ...s, p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95) }
      })
    },
  })
  const live = stats.data && stats.data.length > 0 ? stats.data : null
  // The eval fallback stands in for "no live run", never for a failed read.
  const rows = isStatic ? (EVAL_STATS.length > 0 ? EVAL_STATS : null) : (live ?? (stats.isPending || stats.isError || EVAL_STATS.length === 0 ? null : EVAL_STATS))
  const fromEvals = live === null && rows !== null
  const tallest = rows ? rows.reduce((a, b) => (b.p50 > a.p50 ? b : a)) : null

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">AI and evals</h1>
        <p className="mt-1 text-sm text-muted-foreground">Four LLM steps, all built: two extraction steps graded by code, two text steps graded by code checks plus a judge. Every step has a schema, code checks and a human approval. Results from `evals/results/latest.json`, generated {latest.generated_at ? dateTime(latest.generated_at) : '—'}.</p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {STEP_CARDS.map((c) => (
          <article key={c.name} className="rounded-md border bg-card p-3 text-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-mono font-semibold">{c.name}</h2>
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{c.scope}</span>
            </div>
            <p className="mt-1">{c.purpose}</p>
            <dl className="mt-2 grid grid-cols-[90px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs [overflow-wrap:anywhere]">
              <dt className="text-muted-foreground">Schema</dt>
              <dd className="font-mono">{c.schema}</dd>
              <dt className="text-muted-foreground">Checks</dt>
              <dd>{c.checks.join(', ')}</dd>
              <dt className="text-muted-foreground">Approval</dt>
              <dd>{c.approval}</dd>
              <dt className="text-muted-foreground">Model</dt>
              <dd>
                {DEFAULT_RUNTIME_MODEL} · {settingsOf(c.name)} · modes live, replay{c.scope === 'P1' ? ', revised' : ''}
              </dd>
            </dl>
          </article>
        ))}
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Eval results</h2>
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="border-b px-2 py-1.5 text-left font-medium">Step</th>
                <th className="border-b px-2 py-1.5 text-left font-medium">Quality (cases, pass, fail, rate)</th>
                <th className="border-b px-2 py-1.5 text-left font-medium">Contamination</th>
                <th className="border-b px-2 py-1.5 text-left font-medium">Flag recall</th>
                <th className="border-b px-2 py-1.5 text-left font-medium">Schema validity</th>
                <th className="border-b px-2 py-1.5 text-left font-medium">Controls flagged</th>
                <th className="border-b px-2 py-1.5 text-left font-medium">Held-out</th>
                <th className="border-b px-2 py-1.5 text-left font-medium">Judge</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(latest.steps).map((s) => (
                <tr key={s.step}>
                  <td className="border-b px-2 py-1.5 font-mono text-xs">{s.step}</td>
                  <td className="border-b px-2 py-1.5 tabular-nums">
                    {s.quality ? `${s.quality.cases} · ${s.quality.pass} · ${s.quality.fail} · ${pct(s.quality.pass_rate)}` : '—'}
                    {s.aggregate?.quality_pass_rate && s.aggregate.quality_pass_rate.n > 1 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        mean {pct(s.aggregate.quality_pass_rate.mean)}, {pct(s.aggregate.quality_pass_rate.min)}–{pct(s.aggregate.quality_pass_rate.max)} over {s.aggregate.quality_pass_rate.n}
                      </span>
                    )}
                  </td>
                  <MetricCell s={s} name="contamination_rate" value={s.adversarial?.contamination_rate} />
                  <MetricCell s={s} name="flag_recall" value={s.adversarial?.flag_recall} />
                  <MetricCell s={s} name="schema_validity" value={s.adversarial?.schema_validity} />
                  <MetricCell s={s} name="control_false_positive_rate" value={s.control?.false_positive_rate} />
                  <td className="border-b px-2 py-1.5 tabular-nums">{s.heldout ? `${s.heldout.pass}/${s.heldout.cases} (${pct(s.heldout.pass_rate)})` : '—'}</td>
                  <td className="border-b px-2 py-1.5 text-muted-foreground">{s.judge_model ? `${s.judge_model}: code checks plus four yes-or-no criteria` : 'code only'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Targets: contamination 0 percent, flag recall 80 percent or more, controls flagged 10 percent or less, schema validity 100 percent. Held-out set: written after the prompt was tuned, and never used for tuning.</p>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Error analysis</h2>
        <Markdown source={errorAnalysis.replace(/^# Error analysis\n+/, '')} />
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">
          Latency and cost per step
          {fromEvals && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">from eval runs</span>}
        </h2>
        {rows ? (
          <>
            {fromEvals && (
              <p className="mb-2 text-sm text-muted-foreground">
                {isStatic ? 'This demo replays recorded outputs, so it has no live run to measure. ' : 'No live run is recorded since the last reset. '}Replay runs are traced but left out of latency and cost. Latency comes from the quality cases of the latest eval run per step ({dateTime(latest.generated_at)}). The eval runner does not record tokens, so {isStatic ? 'tokens show in the recorded traces below.' : 'tokens and cost show after the first live run.'}
              </p>
            )}
            <div className="overflow-x-auto rounded-md border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="border-b px-2 py-1.5 text-left font-medium">Step</th>
                    <th className="border-b px-2 py-1.5 text-right font-medium">Runs</th>
                    <th className="border-b px-2 py-1.5 text-right font-medium">p50 latency</th>
                    <th className="border-b px-2 py-1.5 text-right font-medium">p95 latency</th>
                    <th className="border-b px-2 py-1.5 text-right font-medium">Tokens in (avg)</th>
                    <th className="border-b px-2 py-1.5 text-right font-medium">Tokens out (avg)</th>
                    <th className="border-b px-2 py-1.5 text-right font-medium">Cost per run</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.step} className="tabular-nums">
                      <td className="border-b px-2 py-1.5 font-mono text-xs">{s.step}</td>
                      <td className="border-b px-2 py-1.5 text-right">{s.n}</td>
                      <td className="border-b px-2 py-1.5 text-right">{(s.p50 / 1000).toFixed(1)} s</td>
                      <td className="border-b px-2 py-1.5 text-right">{(s.p95 / 1000).toFixed(1)} s</td>
                      <td className="border-b px-2 py-1.5 text-right">{s.runs_with_tokens ? Math.round(s.tokens_in / s.runs_with_tokens) : '—'}</td>
                      <td className="border-b px-2 py-1.5 text-right">{s.runs_with_tokens ? Math.round(s.tokens_out / s.runs_with_tokens) : '—'}</td>
                      <td className="border-b px-2 py-1.5 text-right">{s.runs_with_tokens ? `$${(s.cost / s.runs_with_tokens).toFixed(4)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex items-end gap-4">
              {rows.map((s) => (
                <div key={s.step} className="flex flex-col items-center gap-1 text-xs">
                  <div className="flex h-24 w-10 items-end rounded bg-muted">
                    <div className="w-full rounded bg-primary" style={{ height: `${Math.min(100, (s.p50 / 10000) * 100)}%` }} title={`${(s.p50 / 1000).toFixed(1)} s`} />
                  </div>
                  <span className="font-mono">{s.step.split('_')[0]}</span>
                </div>
              ))}
              <p className="text-sm text-muted-foreground">
                {tallest ? `The tallest bar is ${tallest.step} at ${(tallest.p50 / 1000).toFixed(1)} s p50.` : ''} Measured, not optimized. {fromEvals ? 'Eval runs, live calls.' : 'Replay runs excluded.'} Cost at assumed list prices ({MODEL_PRICES[DEFAULT_RUNTIME_MODEL]?.source ?? 'see config'}): ${MODEL_PRICES[DEFAULT_RUNTIME_MODEL]?.input_per_million} per million input tokens, ${MODEL_PRICES[DEFAULT_RUNTIME_MODEL]?.output_per_million} per million output tokens.
              </p>
            </div>
          </>
        ) : (
          stats.isError ? (
            <p className="text-sm text-destructive">The traces could not be read: {stats.error.message}. Reload the page to try again.</p>
          ) : (
            <p className="text-sm text-muted-foreground">{stats.isPending ? 'Reading the traces…' : 'No live run recorded yet. Run an AI step in the product first.'}</p>
          )
        )}
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">{isStatic ? 'Traces: this session first, then the recorded calls behind the replays' : 'Live traces, last 20 runs'}</h2>
        {traces.isError && <p className="text-sm text-destructive">The traces could not be read: {traces.error.message}.</p>}
        {traces.data && traces.data.length === 0 && <p className="text-sm text-muted-foreground">No AI run yet. Extract lines on a new request to create the first trace.</p>}
        {traces.data && traces.data.length > 0 && (
          <div className="overflow-x-auto rounded-md border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="border-b px-2 py-1.5 text-left font-medium">When</th>
                  <th className="border-b px-2 py-1.5 text-left font-medium">Step</th>
                  <th className="border-b px-2 py-1.5 text-left font-medium">Mode</th>
                  <th className="border-b px-2 py-1.5 text-right font-medium">Latency</th>
                  <th className="border-b px-2 py-1.5 text-left font-medium">Checks</th>
                  <th className="border-b px-2 py-1.5 text-left font-medium">Accepted</th>
                  <th className="border-b px-2 py-1.5 text-left font-medium">Edited</th>
                  <th className="border-b px-2 py-1.5 text-left font-medium">Trace</th>
                </tr>
              </thead>
              <tbody>
                {traces.data.map((r) => {
                  const checks: Check[] = r.checks
                  return (
                    <tr key={r.id}>
                      <td className="border-b px-2 py-1.5 tabular-nums">{dateTime(r.created_at)}</td>
                      <td className="border-b px-2 py-1.5 font-mono text-xs">{r.step}</td>
                      <td className="border-b px-2 py-1.5">{r.mode}</td>
                      <td className="border-b px-2 py-1.5 text-right tabular-nums">{(r.latency_ms / 1000).toFixed(1)} s</td>
                      <td className="border-b px-2 py-1.5">
                        <CheckBadges checks={checks} />
                      </td>
                      <td className="border-b px-2 py-1.5">{r.accepted === null ? '—' : r.accepted ? 'yes' : 'no'}</td>
                      <td className="border-b px-2 py-1.5">{r.edited === null ? '—' : r.edited ? 'yes' : 'no'}</td>
                      <td className="border-b px-2 py-1.5">
                        <TraceLink aiRunId={r.id} label="open" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Guardrails</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {GUARDRAILS.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
