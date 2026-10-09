// Step reply_interpret. Spec 4.3. No browser, no Netlify imports.

import { z } from 'zod'
import { allLinesCovered, changesAreNumbers, noInstructionText, spanGrounded } from '../checks'
import { PROMPTS } from '../prompts/generated'
import { renderTemplate } from '../prompts/render'
import type { StepDefinition } from '../types'
import { toModelJsonSchema } from './jsonSchema'

export const replyRevisionLineSchema = z.object({
  line_no: z.number().int(),
  family: z.string(),
  size: z.number(),
  material: z.string(),
  length_mm: z.number(),
  quantity: z.number(),
  unit_price: z.number(),
  total_price: z.number(),
})

export const replyInputSchema = z.object({
  reply_text: z.string().min(1),
  revision: z.object({
    revision_no: z.number().int(),
    lines: z.array(replyRevisionLineSchema).min(1),
  }),
})

export type ReplyInput = z.infer<typeof replyInputSchema>

export const replyDecisionSchema = z.strictObject({
  line_no: z.number(),
  decision: z.enum(['accept', 'change', 'reject', 'unclear']),
  changes: z.strictObject({
    quantity: z.number().nullable(),
    length_mm: z.number().nullable(),
    material: z.string().nullable(),
    size: z.number().nullable(),
    target_unit_price: z.number().nullable(),
  }),
  source_span: z.string(),
  confidence: z.number().min(0).max(1),
})

export const replyOutputSchema = z.strictObject({
  decisions: z.array(replyDecisionSchema),
  overall: z.enum(['accept_all', 'partial', 'reject_all', 'unclear']),
  needs_clarification: z.array(z.string()),
})

export type ReplyOutput = z.infer<typeof replyOutputSchema>

function linesText(input: ReplyInput): string {
  return input.revision.lines
    .map((l) => `- L${l.line_no}: ${l.family} ${l.size} ${l.material}, ${l.length_mm} mm, ${l.quantity} pcs at ${l.unit_price.toFixed(2)} EUR per piece, total ${l.total_price.toFixed(2)} EUR`)
    .join('\n')
}

export const replyInterpret: StepDefinition<ReplyInput, ReplyOutput> = {
  name: 'reply_interpret',
  budget_ms: 25_000,
  temperature: 0.2,
  thinking: 'minimal',
  allowRevision: false,
  schema: replyOutputSchema,
  jsonSchema: toModelJsonSchema(replyOutputSchema),
  // Spec 4.1.1: the reply text plus line_no and quantity of each quoted line.
  replayFields: (input) => ({
    reply_text: input.reply_text,
    lines: input.revision.lines.map((l) => ({ line_no: l.line_no, quantity: l.quantity })),
  }),
  systemPrompt: PROMPTS.reply_interpret.system,
  userPrompt: (input) => renderTemplate(PROMPTS.reply_interpret.user, { revision_no: String(input.revision.revision_no), lines: linesText(input), reply_text: input.reply_text }),
  checks: (input, output) => [
    allLinesCovered(
      input.revision.lines.map((l) => l.line_no),
      output.decisions.map((d) => d.line_no),
    ),
    spanGrounded(input.reply_text, output.decisions.map((d) => d.source_span)),
    changesAreNumbers(output.decisions),
    noInstructionText(input.reply_text),
  ],
}
