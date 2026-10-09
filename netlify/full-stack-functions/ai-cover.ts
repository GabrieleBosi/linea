import type { Config } from '@netlify/functions'
import { coverInputSchema, coverText } from '../../src/ai/steps/cover_text'
import { handleStep } from './_lib/aiStep'

export default async (req: Request): Promise<Response> => handleStep(req, coverText, coverInputSchema)

export const config: Config = {
  path: '/api/ai/cover',
}
