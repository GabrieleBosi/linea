// Records the human decision on an AI run: accepted, edited. Spec 4.1 rule 8.

import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { recordDecision } from '../../src/ai/store'
import { jsonError } from './_lib/aiStep'
import { supabaseAdmin } from './_lib/supabaseAdmin'

const schema = z.object({ ai_run_id: z.string().uuid(), accepted: z.boolean(), edited: z.boolean() })

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return jsonError(405, 'Use POST.', 'Send the decision as JSON in a POST request.')
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'The request body is not JSON.', 'Send the decision as JSON.')
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return jsonError(400, 'The decision is not valid.', 'Send ai_run_id, accepted and edited.')
  try {
    await recordDecision(supabaseAdmin(), parsed.data.ai_run_id, parsed.data.accepted, parsed.data.edited)
  } catch (e) {
    return jsonError(500, e instanceof Error ? e.message : String(e), 'The decision was applied; only the trace record failed. Try again later.')
  }
  return Response.json({ ok: true })
}

export const config: Config = {
  path: '/api/ai/decision',
}
