import type { Config } from '@netlify/functions'
import { memoInputSchema, priceMemo } from '../../src/ai/steps/price_memo'
import { handleStep } from './_lib/aiStep'

export default async (req: Request): Promise<Response> => handleStep(req, priceMemo, memoInputSchema)

export const config: Config = {
  path: '/api/ai/memo',
}
