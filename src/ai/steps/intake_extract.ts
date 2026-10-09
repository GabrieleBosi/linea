// Step intake_extract. Spec 4.2. No browser, no Netlify imports.

import { z } from 'zod'
import { CATALOG_PROFILES, sizesOf } from '@/domain/catalog'
import { FAMILIES, MATERIALS, type Family, type Material } from '@/domain/types'
import { datesGrounded, noInstructionText, quantityPositive, sizeInCatalog, spanGrounded, unitsNormalized } from '../checks'
import { PROMPTS } from '../prompts/generated'
import { renderTemplate } from '../prompts/render'
import type { StepDefinition } from '../types'
import { toModelJsonSchema } from './jsonSchema'

export type IntakeCatalog = { families: Family[]; sizes: Record<Family, number[]>; materials: Material[] }

export const DEFAULT_INTAKE_CATALOG: IntakeCatalog = {
  families: [...FAMILIES],
  sizes: { HEA: sizesOf('HEA', CATALOG_PROFILES), HEB: sizesOf('HEB', CATALOG_PROFILES), IPE: sizesOf('IPE', CATALOG_PROFILES) },
  materials: [...MATERIALS],
}

export const intakeInputSchema = z.object({
  text: z.string().min(1),
  customer_hint: z.string().nullable().optional(),
  catalog: z
    .object({
      families: z.array(z.enum(['HEA', 'HEB', 'IPE'])),
      sizes: z.record(z.string(), z.array(z.number())),
      materials: z.array(z.enum(['S235', 'S355', 'S460'])),
    })
    .optional(),
})

export type IntakeInput = { text: string; customer_hint?: string | null; catalog?: IntakeCatalog }

export const intakeLineSchema = z.strictObject({
  family: z.enum(['HEA', 'HEB', 'IPE', 'UNKNOWN']),
  size: z.number().nullable(),
  material: z.enum(['S235', 'S355', 'S460', 'UNKNOWN']),
  length_mm: z.number().nullable(),
  quantity: z.number().nullable(),
  notes: z.string(),
  source_span: z.string(),
  confidence: z.number().min(0).max(1),
})

export const intakeOutputSchema = z.strictObject({
  customer_name_guess: z.string().nullable(),
  lines: z.array(intakeLineSchema),
  open_questions: z.array(z.string()),
  stated_date: z.string().nullable(),
  requested_delivery_date: z.string().nullable(),
  delivery_hint: z.string().nullable(),
})

export type IntakeLine = z.infer<typeof intakeLineSchema>
export type IntakeOutput = z.infer<typeof intakeOutputSchema>

export const LOW_CONFIDENCE = 0.7

/** UI flags per line. Spec 6.3. */
export function intakeLineFlags(line: IntakeLine, ruleHitCount: number): string[] {
  const flags: string[] = []
  const known = line.family !== 'UNKNOWN' && line.size !== null && (DEFAULT_INTAKE_CATALOG.sizes[line.family] ?? []).includes(line.size)
  if (!known || line.material === 'UNKNOWN') flags.push('unknown configuration')
  if (ruleHitCount > 0) flags.push('check needed')
  if (line.confidence < LOW_CONFIDENCE) flags.push('low confidence')
  return flags
}

function catalogText(catalog: IntakeCatalog): string {
  return catalog.families.map((f) => `- ${f}: ${(catalog.sizes[f] ?? []).join(', ')}`).join('\n')
}

export const intakeExtract: StepDefinition<IntakeInput, IntakeOutput> = {
  name: 'intake_extract',
  budget_ms: 25_000,
  temperature: 0.2,
  thinking: 'minimal',
  allowRevision: false,
  schema: intakeOutputSchema,
  jsonSchema: toModelJsonSchema(intakeOutputSchema),
  replayFields: (input) => ({ text: input.text }),
  systemPrompt: PROMPTS.intake_extract.system,
  userPrompt: (input) => {
    const catalog = input.catalog ?? DEFAULT_INTAKE_CATALOG
    return renderTemplate(PROMPTS.intake_extract.user, {
      catalog: catalogText(catalog),
      materials: catalog.materials.join(', '),
      customer_hint: input.customer_hint ? `Customer, as selected by Sales: ${input.customer_hint}.` : 'Customer: not selected yet.',
      text: input.text,
    })
  },
  checks: (input, output) => [
    sizeInCatalog(output.lines),
    quantityPositive(output.lines),
    spanGrounded(input.text, output.lines.map((l) => l.source_span)),
    unitsNormalized(input.text, output.lines),
    noInstructionText(input.text),
    datesGrounded(input.text, output),
  ],
}
