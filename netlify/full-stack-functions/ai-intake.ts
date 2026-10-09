import type { Config } from '@netlify/functions'
import { intakeExtract, intakeInputSchema, type IntakeInput } from '../../src/ai/steps/intake_extract'
import { handleStep } from './_lib/aiStep'

export default async (req: Request): Promise<Response> => handleStep(req, intakeExtract, intakeInputSchema as unknown as import('zod').ZodType<IntakeInput>)

export const config: Config = {
  path: '/api/ai/intake',
}
