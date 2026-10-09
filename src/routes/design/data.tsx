// Data page. Spec 8.5: the gap table, the scoring rule with a worked example, the generator, the anchor rows.

import { createFileRoute } from '@tanstack/react-router'
import { Markdown } from '@/components/Markdown'
import { GIVEN_LEGACY_QUOTES } from '@/data/givenLegacyQuotes'
import dataText from '@/design/content/data.md?raw'
import { MARGIN_BANDS, pricePerTonne, SCORE_WEIGHTS, winRateBands } from '@/domain/references'
import { useQuery } from '@tanstack/react-query'
import { Fragment } from 'react'
import { repo } from '@/lib/repo'
import { loadReferencePool } from '@/services/context'
import { money, number, pct, unitMoney } from '@/lib/format'
import { useConfigurationInsight, useRequestSummaries } from '@/lib/queries'
import { A_REQUEST_TITLE } from '@/scenarios/a'

export const Route = createFileRoute('/design/data')({
  component: DataPage,
})

const GAPS = [
  ['Which lines a request had, and which of them were won', 'Request → lines, each line with its own outcome'],
  ['How the offer moved between revisions, and what the customer said', 'Every revision as a snapshot; CustomerResponse raw and interpreted, plus events'],
  ['Whether the product could be made, and what was offered instead', 'FeasibilityCheck with notes, and the alternative line'],
  ['Why a line was lost', 'declined with a reason, per line'],
  ['What the order really cost', 'Order carries the estimate; a later actual_cost field is planned'],
] as const

// The markdown ends with the anchor rows; the band table goes after the calibration text, before them.
const [dataBeforeGiven = dataText, dataAfterGiven = ''] = dataText.split('## The eight anchor rows')

const FAMILIES = ['HEA', 'HEB', 'IPE'] as const

/**
 * Win rate per margin band with the count behind it, from the same pool the composer's chart
 * reads (legacy quotations plus Linea's sent lines with an outcome). Small bands are marked.
 */
function WinRateByBand() {
  const pool = useQuery({ queryKey: ['reference-pool'], queryFn: () => loadReferencePool(repo) })
  if (pool.isPending) return <p className="text-sm text-muted-foreground">Counting the history…</p>
  if (pool.isError) return <p className="text-sm text-destructive">The history could not be read: {pool.error.message}. Reload the page.</p>
  const perFamily = FAMILIES.map((f) => winRateBands(f, pool.data))
  const all = MARGIN_BANDS.map((_, i) => {
    const n = perFamily.reduce((s, b) => s + (b[i]?.n ?? 0), 0)
    const won = perFamily.reduce((s, b) => s + (b[i]?.won ?? 0), 0)
    return { label: perFamily[0]?.[i]?.label ?? '', n, won }
  })
  const cell = (won: number, n: number) => (
    <td className={`border-b px-2 py-1.5 text-right tabular-nums ${n < 10 ? 'text-muted-foreground' : ''}`}>
      {n === 0 ? '—' : `${((won / n) * 100).toFixed(0)}%`} <span className="text-xs text-muted-foreground">({won} of {n}{n < 10 ? ', few' : ''})</span>
    </td>
  )
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold">Win rate by margin band, with the count behind each rate</h3>
      <p className="mb-2 text-xs text-muted-foreground">History in this database: legacy quotations plus Linea's sent lines with an outcome. Grey cells rest on fewer than ten quotations.</p>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="border-b px-2 py-1.5 text-left font-medium">Margin band</th>
              <th className="border-b px-2 py-1.5 text-right font-medium">All families</th>
              {FAMILIES.map((f) => (
                <th key={f} className="border-b px-2 py-1.5 text-right font-medium">
                  {f}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {all.map((b, i) => (
              <tr key={b.label}>
                <td className="border-b px-2 py-1.5">{b.label}</td>
                {cell(b.won, b.n)}
                {perFamily.map((fam, j) => (
                  <Fragment key={FAMILIES[j]}>{cell(fam[i]?.won ?? 0, fam[i]?.n ?? 0)}</Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const A3_TARGET = { family: 'HEA' as const, size: 200, material: 'S355' as const, length_mm: 12000, quantity: 120 }

function DataPage() {
  // As on the A3 screen, the line's own request is not a reference for it. Scenario A's request is
  // found by its title; there is none before scenario A runs.
  const summaries = useRequestSummaries()
  const scenarioARef = summaries.data?.find((s) => s.customer_name === 'Ebrecht Fabrication' && s.request.title === A_REQUEST_TITLE)?.request.ref
  const insight = useConfigurationInsight(summaries.data ? A3_TARGET : null, 'Ebrecht Fabrication', scenarioARef)
  const top = insight.data?.references.slice(0, 5) ?? []

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Data</h1>
        <p className="mt-1 text-sm text-muted-foreground">What a one-row quote history can't tell you, and what Linea records from day one. The scoring rule with one worked example. The generator and its calibration.</p>
      </header>

      <section>
        <h2 className="mb-2 text-base font-semibold">What a one-row quote history can&apos;t tell you</h2>
        <div className="rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="border-b px-2 py-1.5 text-left font-medium">What it can&apos;t tell you</th>
                <th className="border-b px-2 py-1.5 text-left font-medium">Linea record</th>
              </tr>
            </thead>
            <tbody>
              {GAPS.map(([gap, record]) => (
                <tr key={gap}>
                  <td className="border-b px-2 py-1.5">{gap}</td>
                  <td className="border-b px-2 py-1.5">{record}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">The reference scoring rule</h2>
        <div className="grid grid-cols-5 gap-2 text-sm">
          {[
            ['Customer', SCORE_WEIGHTS.customer, 'Same customer.'],
            ['Product', SCORE_WEIGHTS.product, `Same family and size. Next size up or down in the catalog: ${SCORE_WEIGHTS.product_adjacent}.`],
            ['Material', SCORE_WEIGHTS.material, 'Same grade.'],
            ['Quantity', SCORE_WEIGHTS.quantity, '15 × (1 − |q_target − q_ref| / max(q_target, q_ref))'],
            ['Recency', SCORE_WEIGHTS.recency, '10 × exp(−age_months / 12)'],
          ].map(([name, pts, rule]) => (
            <div key={String(name)} className="rounded-md border bg-card p-3">
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{name}</span>
                <span className="text-lg font-semibold tabular-nums text-primary">{pts}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{rule}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Score 0 to 100. The pool is every legacy quotation plus every line of a sent revision with a known outcome: agreed is WON; declined, withdrawn and superseded are LOST. Price suggestion: floor = cost / (1 − 0.15); suggested = cost / (1 − median won margin of the top 5), 0.20 without a won reference; range from the min and max won margin.</p>

        <h3 className="mt-4 mb-1 text-sm font-semibold">Worked example: scenario A, step A3</h3>
        <p className="mb-2 text-sm">Target: Ebrecht Fabrication, HEA 200 S355, 12 000 mm × 120, today. Computed live from the pool in the database, without the lines of scenario A's own request{scenarioARef ? ` (${scenarioARef})` : ''}, as the A3 screen ranks them.</p>
        {summaries.isError && <p className="text-sm text-destructive">The requests could not be read, so scenario A's request cannot be left out: {summaries.error.message}. Reload the page.</p>}
        {!summaries.isError && insight.isPending && <p className="text-sm text-muted-foreground">Ranking the pool…</p>}
        {insight.isError && <p className="text-sm text-destructive">The pool could not be read: {insight.error.message}.</p>}
        {insight.data && (
          <div className="rounded-md border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="border-b px-2 py-1.5 text-left font-medium">Ref</th>
                  <th className="border-b px-2 py-1.5 text-left font-medium">Date · customer · product</th>
                  <th className="border-b px-2 py-1.5 text-right font-medium">Qty</th>
                  <th className="border-b px-2 py-1.5 text-right font-medium">Unit price</th>
                  <th className="border-b px-2 py-1.5 text-right font-medium">Margin</th>
                  <th className="border-b px-2 py-1.5 text-left font-medium">Outcome</th>
                  <th className="border-b px-2 py-1.5 text-left font-medium">Customer · Product · Material · Quantity · Recency</th>
                  <th className="border-b px-2 py-1.5 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {top.map((r) => (
                  <tr key={r.ref_id}>
                    <td className="border-b px-2 py-1.5 font-medium">{r.ref_id}</td>
                    <td className="border-b px-2 py-1.5">
                      {r.date} · {r.customer} · {r.family} {r.size} {r.material}
                    </td>
                    <td className="border-b px-2 py-1.5 text-right tabular-nums">{number(r.quantity)}</td>
                    <td className="border-b px-2 py-1.5 text-right tabular-nums">
                      {unitMoney(r.unit_price)}
                      <div className="text-xs text-muted-foreground">{pricePerTonne(r) === null ? 'per piece, length unknown' : `${money(pricePerTonne(r))} / t`}</div>
                    </td>
                    <td className="border-b px-2 py-1.5 text-right tabular-nums">{pct(r.margin)}</td>
                    <td className="border-b px-2 py-1.5">{r.outcome}</td>
                    <td className="border-b px-2 py-1.5 tabular-nums">
                      {r.score.customer} · {r.score.product}
                      {r.score.product_adjacent ? ' (next size)' : ''} · {r.score.material} · {r.score.quantity.toFixed(1)} · {r.score.recency.toFixed(1)}
                    </td>
                    <td className="border-b px-2 py-1.5 text-right font-medium tabular-nums">{r.score.total.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {insight.data.price && insight.data.cost && (
              <p className="border-t px-2 py-2 text-sm text-muted-foreground">
                Cost estimate {money(insight.data.cost.total)} → floor {unitMoney(insight.data.price.unit.floor)} per piece, suggested {unitMoney(insight.data.price.unit.suggested)} at {pct(insight.data.price.median_won_margin ?? 0.2, 0)} margin from {insight.data.price.won_count} won references
                {insight.data.price.unit.range ? `, range ${unitMoney(insight.data.price.unit.range[0])} to ${unitMoney(insight.data.price.unit.range[1])}` : ''}. Expected revisions: {insight.data.expected_revisions ?? '—'}.
              </p>
            )}
          </div>
        )}
      </section>

      <Markdown source={dataBeforeGiven} />

      <WinRateByBand />

      <Markdown source={`## The eight anchor rows${dataAfterGiven}`} />

      <section>
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['quote_id', 'quote_date', 'customer', 'product', 'material', 'quantity', 'production_cost', 'quoted_price', 'margin', 'outcome', 'revision'].map((h) => (
                  <th key={h} className="border-b px-2 py-1.5 text-left font-mono text-xs font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GIVEN_LEGACY_QUOTES.map((q) => (
                <tr key={q.quote_id} className="tabular-nums">
                  <td className="border-b px-2 py-1">{q.quote_id}</td>
                  <td className="border-b px-2 py-1">{q.quote_date}</td>
                  <td className="border-b px-2 py-1">{q.customer}</td>
                  <td className="border-b px-2 py-1">{q.product}</td>
                  <td className="border-b px-2 py-1">{q.material}</td>
                  <td className="border-b px-2 py-1">{q.quantity}</td>
                  <td className="border-b px-2 py-1">{q.production_cost}</td>
                  <td className="border-b px-2 py-1">{q.quoted_price}</td>
                  <td className="border-b px-2 py-1">{q.margin}</td>
                  <td className="border-b px-2 py-1">{q.outcome}</td>
                  <td className="border-b px-2 py-1">{q.revision}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
