import type { Config } from '@netlify/functions'
import { replyInputSchema, replyInterpret } from '../../src/ai/steps/reply_interpret'
import { handleStep } from './_lib/aiStep'

export default async (req: Request): Promise<Response> => handleStep(req, replyInterpret, replyInputSchema)

export const config: Config = {
  path: '/api/ai/reply',
}
