// The price memo's own checks on a memo that repeats the numbers of the prompt. Spec 4.4.

import { describe, expect, it } from 'vitest'
import { priceMemo, suggestedMargin, type MemoInput } from '@/ai/steps/price_memo'

const input: MemoInput = {
  line: { family: 'HEA', size: 220, material: 'S355', length_mm: 10000, quantity: 40, customer: 'Ebrecht Fabrication' },
  cost_estimate: 26322.74,
  unit_cost: 658.07,
  suggested_price: 805.96,
  floor: 774.2,
  range: [798.63, 829.85],
  median_won_margin: 0.1835,
  references: [],
  win_rate_bands: [],
}

describe('price_memo numbers_grounded', () => {
  it('accepts the margin of the suggested price as the prompt shows it', () => {
    // 1 - 26322.74 / (805.96 × 40) = 0.18349…, shown as 18.3; the median 0.1835 is shown as 18.4.
    expect((suggestedMargin(input) * 100).toFixed(1)).toBe('18.3')
    const memo = 'The suggested price is 805.96 EUR per piece, an 18.3 percent margin on the cost estimate.'
    const grounded = priceMemo.checks(input, { memo, cited_reference_ids: [] }).find((c) => c.name === 'numbers_grounded')
    expect(grounded?.pass).toBe(true)
  })

  it('still rejects a margin the prompt does not show', () => {
    const memo = 'The suggested price is 805.96 EUR per piece, a 19.1 percent margin on the cost estimate.'
    const grounded = priceMemo.checks(input, { memo, cited_reference_ids: [] }).find((c) => c.name === 'numbers_grounded')
    expect(grounded?.pass).toBe(false)
  })
})

describe('price_memo eval cases', () => {
  it('include cases where the margin of the price and the median won margin show as different numbers', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const cases = readFileSync(resolve(import.meta.dirname, '../../evals/price_memo.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { id: string; tags: string[]; input: MemoInput })
    const tagged = cases.filter((c) => c.tags.includes('margins-differ'))
    expect(tagged.length).toBeGreaterThanOrEqual(1)
    for (const c of tagged) {
      const median = c.input.median_won_margin
      expect(median, c.id).not.toBeNull()
      expect((suggestedMargin(c.input) * 100).toFixed(1), c.id).not.toBe(((median ?? 0) * 100).toFixed(1))
    }
  })
})
