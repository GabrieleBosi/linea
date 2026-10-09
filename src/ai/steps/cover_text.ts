// Step cover_text. Spec 4.5 (P1). The customer-facing text of a quotation revision.
// No browser, no Netlify imports.

import { z } from 'zod'
import { everyLinePresent, feasibilityDisclaimer, lengthOk, noDeliveryPromise, validityPresent } from '../checks'
import { PROMPTS } from '../prompts/generated'
import { renderTemplate } from '../prompts/render'
import type { StepDefinition } from '../types'
import { toModelJsonSchema } from './jsonSchema'

export const coverLineSchema = z.object({
  line_no: z.number().int(),
  family: z.string(),
  size: z.number(),
  material: z.string(),
  length_mm: z.number(),
  quantity: z.number(),
  unit_price: z.number(),
  total_price: z.number(),
  subject_to_feasibility: z.boolean(),
})

export const coverDiffSchema = z.object({
  line_no: z.number().int(),
  /** What changed against the previous revision, in words: "quantity 40 → 60", "new line", "unit price 801.06 → 777.03". */
  change: z.string(),
})

export const coverInputSchema = z.object({
  /** The sender, so the signature is grounded in the input. */
  sender: z.string().min(1),
  customer: z.string().min(1),
  contact: z.string().nullable(),
  revision: z.object({ revision_no: z.number().int(), lines: z.array(coverLineSchema).min(1) }),
  diff_from_previous: z.array(coverDiffSchema),
  /** ISO date. */
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines_subject_to_feasibility: z.array(z.number().int()),
  /** ISO date when the customer asked for one and Sales confirms it; else null, and the text promises no date. */
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
})

export type CoverInput = z.infer<typeof coverInputSchema>

export const coverOutputSchema = z.strictObject({ text: z.string() })

export type CoverOutput = z.infer<typeof coverOutputSchema>

export const FEASIBILITY_PHRASE = 'subject to technical validation'

const eur = (n: number) => n.toFixed(2)

function linesText(input: CoverInput): string {
  return input.revision.lines
    .map(
      (l) =>
        `- L${l.line_no}: ${l.family} ${l.size} ${l.material}, ${l.length_mm} mm, ${l.quantity} pcs at ${eur(l.unit_price)} EUR per piece, total ${eur(l.total_price)} EUR${l.subject_to_feasibility ? ` — ${FEASIBILITY_PHRASE}` : ''}`,
    )
    .join('\n')
}

export const coverText: StepDefinition<CoverInput, CoverOutput> = {
  name: 'cover_text',
  budget_ms: 35_000,
  temperature: 0.4,
  // Spec 4.1 says medium for the text steps. Measured with medium (evals/error-analysis.md): p50 13.5 s,
  // p90 at the 35 s budget, 1 to 2 timeouts in 20 with no quality miss. The writing is mechanical
  // (numbers copied from the input), so LOW keeps the quality and takes the timeouts away.
  thinking: 'minimal',
  allowRevision: true,
  schema: coverOutputSchema,
  jsonSchema: toModelJsonSchema(coverOutputSchema),
  // Spec 4.1.1: revision_no, line configurations, quantities, unit_price per line, valid_until.
  replayFields: (input) => ({
    revision_no: input.revision.revision_no,
    lines: input.revision.lines.map((l) => ({ line_no: l.line_no, family: l.family, size: l.size, material: l.material, length_mm: l.length_mm, quantity: l.quantity, unit_price: l.unit_price, subject_to_feasibility: l.subject_to_feasibility })),
    valid_until: input.valid_until,
  }),
  systemPrompt: PROMPTS.cover_text.system,
  userPrompt: (input) =>
    renderTemplate(PROMPTS.cover_text.user, {
      sender: input.sender,
      customer: input.customer,
      contact: input.contact ?? 'no contact name',
      revision_no: String(input.revision.revision_no),
      lines: linesText(input),
      diff: input.diff_from_previous.length === 0 ? (input.revision.revision_no > 1 ? 'no change listed' : 'first revision') : input.diff_from_previous.map((d) => `- L${d.line_no}: ${d.change}`).join('\n'),
      valid_until: input.valid_until,
      feasibility: input.lines_subject_to_feasibility.length === 0 ? 'none' : input.lines_subject_to_feasibility.map((n) => `L${n}`).join(', '),
      delivery: input.delivery_date ?? 'none: promise no delivery date',
    }),
  checks: (input, output) => [
    everyLinePresent(output.text, input.revision.lines),
    validityPresent(output.text, input.valid_until),
    feasibilityDisclaimer(output.text, input.revision.lines.filter((l) => input.lines_subject_to_feasibility.includes(l.line_no))),
    noDeliveryPromise(output.text, input.valid_until, input.delivery_date),
    lengthOk(output.text, 160),
  ],
}
