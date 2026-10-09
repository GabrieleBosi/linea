// Step price_memo. Spec 4.4 (P1). Three sentences that explain the suggested price to Sales,
// with references. No browser, no Netlify imports.

import { z } from 'zod'
import { lengthOk, numbersDisplayed, numbersGrounded, priceInRange, referencesExist } from '../checks'
import { PROMPTS } from '../prompts/generated'
import { renderTemplate } from '../prompts/render'
import type { StepDefinition } from '../types'
import { toModelJsonSchema } from './jsonSchema'

export const memoReferenceSchema = z.object({
  ref_id: z.string(),
  date: z.string(),
  customer: z.string(),
  family: z.string(),
  size: z.number(),
  material: z.string(),
  quantity: z.number(),
  unit_price: z.number(),
  margin: z.number(),
  outcome: z.enum(['WON', 'LOST']),
  revision: z.number(),
  score: z.object({ customer: z.number(), product: z.number(), material: z.number(), quantity: z.number(), recency: z.number(), total: z.number() }),
})

export const memoInputSchema = z.object({
  line: z.object({ family: z.string(), size: z.number(), material: z.string(), length_mm: z.number(), quantity: z.number(), customer: z.string() }),
  /** Total production cost estimate for the line. */
  cost_estimate: z.number(),
  unit_cost: z.number(),
  /** Unit prices, EUR per piece. */
  suggested_price: z.number(),
  floor: z.number(),
  range: z.tuple([z.number(), z.number()]).nullable(),
  median_won_margin: z.number().nullable(),
  references: z.array(memoReferenceSchema).max(5),
  win_rate_bands: z.array(z.object({ label: z.string(), n: z.number(), won: z.number(), win_rate: z.number().nullable() })),
})

export type MemoInput = z.infer<typeof memoInputSchema>

export const memoOutputSchema = z.strictObject({
  memo: z.string(),
  cited_reference_ids: z.array(z.string()),
})

export type MemoOutput = z.infer<typeof memoOutputSchema>

const eur = (n: number) => n.toFixed(2)
const pctText = (m: number) => `${(m * 100).toFixed(1)} percent`

function referencesText(input: MemoInput): string {
  if (input.references.length === 0) return '(none: this is a new configuration)'
  return input.references
    .map(
      (r) =>
        `- ${r.ref_id}: ${r.date}, ${r.customer}, ${r.family} ${r.size} ${r.material}, ${r.quantity} pcs at ${eur(r.unit_price)} EUR per piece, margin ${pctText(r.margin)}, ${r.outcome}, ${r.revision} revision(s), score ${r.score.total.toFixed(0)} (customer ${r.score.customer}, product ${r.score.product}, material ${r.score.material}, quantity ${r.score.quantity.toFixed(0)}, recency ${r.score.recency.toFixed(0)})`,
    )
    .join('\n')
}

function bandsText(input: MemoInput): string {
  return input.win_rate_bands.map((b) => `- ${b.label}: ${b.win_rate === null ? 'no data' : `${(b.win_rate * 100).toFixed(0)} percent won`} (${b.won} of ${b.n})`).join('\n')
}

/** The margin the suggested price gives on the cost estimate, as the composer computes it. */
export function suggestedMargin(input: Pick<MemoInput, 'cost_estimate' | 'suggested_price' | 'line'>): number {
  return 1 - input.cost_estimate / (input.suggested_price * input.line.quantity)
}

/**
 * The user prompt. Prices carry two decimals and margins one decimal, exactly as the composer
 * shows them, so the memo can only quote a displayed value (check numbers_displayed).
 */
function renderUser(input: MemoInput): string {
  return renderTemplate(PROMPTS.price_memo.user, {
    line: `${input.line.family} ${input.line.size} ${input.line.material}, ${input.line.length_mm} mm, ${input.line.quantity} pcs for ${input.line.customer}`,
    cost: `${eur(input.cost_estimate)} EUR total, ${eur(input.unit_cost)} EUR per piece`,
    suggested: `${eur(input.suggested_price)} EUR per piece`,
    // Two lines, two names (prompt v3): the median sets the price, but it is not the price's margin.
    price_margin: pctText(suggestedMargin(input)),
    median_margin: input.median_won_margin === null ? 'none: no won reference, so the suggested price is the cost at a 20 percent margin' : `${pctText(input.median_won_margin)} (the suggested price is set from it)`,
    floor: `${eur(input.floor)} EUR per piece (15 percent margin)`,
    range: input.range ? `${eur(input.range[0])} to ${eur(input.range[1])} EUR per piece` : 'no range: no won reference',
    references: referencesText(input),
    bands: bandsText(input),
  })
}

export const priceMemo: StepDefinition<MemoInput, MemoOutput> = {
  name: 'price_memo',
  budget_ms: 45_000,
  temperature: 0.4,
  // Spec 4.1 says medium. Measured with medium (evals/error-analysis.md): 20/20 at p50 20.2 s, p90 30.2 s.
  // LOW was tried on request after cover_text held its quality at LOW; the runs are in the log.
  thinking: 'minimal',
  allowRevision: true,
  schema: memoOutputSchema,
  jsonSchema: toModelJsonSchema(memoOutputSchema),
  // Spec 4.1.1: line configuration, quantity, cost estimate, suggested price, the reference ids.
  replayFields: (input) => ({
    line: input.line,
    cost_estimate: input.cost_estimate,
    suggested_price: input.suggested_price,
    reference_ids: input.references.map((r) => r.ref_id),
  }),
  systemPrompt: PROMPTS.price_memo.system,
  userPrompt: renderUser,
  checks: (input, output) => [
    // The prompt shows the margin of the suggested price; it is part of what the model reads.
    numbersGrounded(output.memo, { ...input, suggested_margin: suggestedMargin(input) }),
    referencesExist(output.cited_reference_ids, input.references.map((r) => r.ref_id)),
    lengthOk(output.memo, 80),
    priceInRange(output.memo, input.suggested_price, input.range),
    numbersDisplayed(output.memo, renderUser(input)),
  ],
}
