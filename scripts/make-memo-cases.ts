// Builds evals/price_memo.jsonl from the generated history: twenty target lines, each with the
// same input the composer sends (cost, suggested price, range, top 5 references with scores,
// win-rate bands). Deterministic: the generator is seeded. Run: npm run evals:cases:memo
// The cases are committed; this script only regenerates them when the generator changes.

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { suggestedMargin, type MemoInput } from '../src/ai/steps/price_memo'
import { DEMO_DATE } from '../src/config/demo'
import { costBreakdown } from '../src/domain/costModel'
import { buildReferencePool, priceSuggestion, rankReferences, winRateBands } from '../src/domain/references'
import type { Family, Material } from '../src/domain/types'
import { generateLegacyQuotes } from './generate-legacy'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TODAY = DEMO_DATE

type Target = { id: string; tags: string[]; customer: string; family: Family; size: number; material: Material; length_mm: number; quantity: number }

const TARGETS: Target[] = [
  { id: 'memo-001', tags: ['repeat-customer', 'won-refs'], customer: 'Ebrecht Fabrication', family: 'HEA', size: 200, material: 'S355', length_mm: 12000, quantity: 120 },
  { id: 'memo-002', tags: ['next-size'], customer: 'Ebrecht Fabrication', family: 'HEA', size: 220, material: 'S355', length_mm: 10000, quantity: 40 },
  { id: 'memo-003', tags: ['new-configuration', 'no-won-ref'], customer: 'Torvane Structures', family: 'HEA', size: 240, material: 'S460', length_mm: 14000, quantity: 100 },
  { id: 'memo-004', tags: ['other-customer'], customer: 'Torvane Structures', family: 'IPE', size: 300, material: 'S355', length_mm: 12000, quantity: 80 },
  { id: 'memo-005', tags: ['alternative'], customer: 'Torvane Structures', family: 'HEA', size: 260, material: 'S355', length_mm: 14000, quantity: 100 },
  { id: 'memo-006', tags: ['repeat-customer'], customer: 'Halvorn Steel Supply', family: 'HEA', size: 200, material: 'S355', length_mm: 9000, quantity: 60 },
  { id: 'memo-007', tags: ['small-quantity'], customer: 'Halvorn Steel Supply', family: 'IPE', size: 240, material: 'S235', length_mm: 6000, quantity: 25 },
  { id: 'memo-008', tags: ['large-quantity'], customer: 'Ostervald Engineering', family: 'HEA', size: 240, material: 'S355', length_mm: 12000, quantity: 300 },
  { id: 'memo-009', tags: ['heb'], customer: 'Ostervald Engineering', family: 'HEB', size: 300, material: 'S355', length_mm: 10000, quantity: 45 },
  { id: 'memo-010', tags: ['s460'], customer: 'Ebrecht Fabrication', family: 'HEA', size: 200, material: 'S460', length_mm: 12000, quantity: 100 },
  { id: 'memo-011', tags: ['long-length'], customer: 'Baltic Frames', family: 'HEB', size: 320, material: 'S355', length_mm: 15000, quantity: 30 },
  { id: 'memo-012', tags: ['short-length'], customer: 'Baltic Frames', family: 'IPE', size: 160, material: 'S235', length_mm: 6000, quantity: 200 },
  { id: 'memo-013', tags: ['other-customer'], customer: 'Kestrel Modular', family: 'HEA', size: 160, material: 'S355', length_mm: 8000, quantity: 150 },
  { id: 'memo-014', tags: ['heb'], customer: 'Kestrel Modular', family: 'HEB', size: 200, material: 'S355', length_mm: 12000, quantity: 90 },
  { id: 'memo-015', tags: ['ipe'], customer: 'Quillon Structures', family: 'IPE', size: 270, material: 'S355', length_mm: 12000, quantity: 70 },
  { id: 'memo-016', tags: ['s460', 'rare'], customer: 'Rudmark Industrial', family: 'HEB', size: 240, material: 'S460', length_mm: 11000, quantity: 50 },
  { id: 'memo-017', tags: ['repeat-customer'], customer: 'Tessmer Fabrication', family: 'HEA', size: 300, material: 'S355', length_mm: 13000, quantity: 40 },
  { id: 'memo-018', tags: ['other-customer'], customer: 'Varnholt Engineering', family: 'IPE', size: 200, material: 'S355', length_mm: 10000, quantity: 110 },
  { id: 'memo-019', tags: ['unknown-size', 'no-refs'], customer: 'Adria Marine Works', family: 'HEA', size: 100, material: 'S235', length_mm: 7000, quantity: 20 },
  { id: 'memo-020', tags: ['repeat-customer'], customer: 'Corvin Steel Buildings', family: 'HEB', size: 260, material: 'S355', length_mm: 12000, quantity: 65 },
]

export function buildMemoInput(t: Target): MemoInput | null {
  const pool = buildReferencePool(generateLegacyQuotes(), [])
  const config = { family: t.family, size: t.size, material: t.material, length_mm: t.length_mm, quantity: t.quantity }
  const cost = costBreakdown(config, TODAY)
  if (!cost) return null
  const top5 = rankReferences({ ...config, customer: t.customer }, pool, TODAY).slice(0, 5)
  const price = priceSuggestion(cost.total, t.quantity, top5)
  return {
    line: { ...config, customer: t.customer },
    cost_estimate: Math.round(cost.total * 100) / 100,
    unit_cost: Math.round((cost.total / t.quantity) * 100) / 100,
    suggested_price: Math.round(price.unit.suggested * 100) / 100,
    floor: Math.round(price.unit.floor * 100) / 100,
    range: price.unit.range ? [Math.round(price.unit.range[0] * 100) / 100, Math.round(price.unit.range[1] * 100) / 100] : null,
    median_won_margin: price.median_won_margin === null ? null : Math.round(price.median_won_margin * 1000) / 1000,
    references: top5.map((r) => ({
      ref_id: r.ref_id,
      date: r.date,
      customer: r.customer,
      family: r.family,
      size: r.size,
      material: r.material,
      quantity: r.quantity,
      unit_price: Math.round(r.unit_price * 100) / 100,
      margin: Math.round(r.margin * 1000) / 1000,
      outcome: r.outcome,
      revision: r.revision,
      score: {
        customer: r.score.customer,
        product: r.score.product,
        material: r.score.material,
        quantity: Math.round(r.score.quantity * 10) / 10,
        recency: Math.round(r.score.recency * 10) / 10,
        total: Math.round(r.score.total * 10) / 10,
      },
    })),
    win_rate_bands: winRateBands(t.family, pool).map((b) => ({ label: b.label, n: b.n, won: b.won, win_rate: b.win_rate === null ? null : Math.round(b.win_rate * 1000) / 1000 })),
  }
}

/**
 * True when the prompt shows the margin of the suggested price and the median won margin as two
 * different numbers. These cases test that the memo attaches each number to the right margin.
 */
export function marginsDiffer(input: MemoInput): boolean {
  if (input.median_won_margin === null) return false
  return (suggestedMargin(input) * 100).toFixed(1) !== (input.median_won_margin * 100).toFixed(1)
}

function main(): void {
  const lines: string[] = []
  for (const t of TARGETS) {
    const input = buildMemoInput(t)
    if (!input) {
      console.warn(`${t.id}: no cost model for ${t.family} ${t.size}; skipped`)
      continue
    }
    lines.push(JSON.stringify({ id: t.id, kind: 'judged', tags: [...t.tags, ...(marginsDiffer(input) ? ['margins-differ'] : [])], input }))
  }
  const file = resolve(ROOT, 'evals', 'price_memo.jsonl')
  writeFileSync(file, lines.join('\n') + '\n')
  console.log(`Wrote ${lines.length} case(s) to ${file}`)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main()
