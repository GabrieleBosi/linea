// Shared handler for the AI step functions. Spec 12.3: validate, run the step, write the
// AiRun row from the server side, return the StepResult.

import { z } from 'zod'
import { runStep } from '../../../src/ai/client'
import { createGeminiClient } from '../../../src/ai/gemini'
import { createSupabaseReplayStore, insertAiRun } from '../../../src/ai/store'
import type { StepDefinition } from '../../../src/ai/types'
import { runtimeModel } from '../../../src/config/models'
import { supabaseAdmin } from './supabaseAdmin'

const envelope = z.object({ request_id: z.string().uuid().nullable().optional(), line_id: z.string().uuid().nullable().optional() })

export function jsonError(status: number, error: string, next: string): Response {
  return Response.json({ ok: false, error, next }, { status })
}

export async function handleStep<I, O>(req: Request, def: StepDefinition<I, O>, inputSchema: z.ZodType<I>): Promise<Response> {
  try {
    return await runHandledStep(req, def, inputSchema)
  } catch (e) {
    // Anything unexpected (a database write, a network error) still answers with what happened and what to do.
    const message = e instanceof Error ? e.message : String(e)
    return jsonError(500, `The AI step failed on the server: ${message}.`, 'Try again in a moment, or continue by hand.')
  }
}

async function runHandledStep<I, O>(req: Request, def: StepDefinition<I, O>, inputSchema: z.ZodType<I>): Promise<Response> {
  if (req.method !== 'POST') return jsonError(405, 'Use POST.', 'Send the input as JSON in a POST request.')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'The request body is not JSON.', 'Send the input as JSON.')
  }
  const meta = envelope.safeParse(body)
  const input = inputSchema.safeParse(body)
  if (!meta.success) {
    return jsonError(400, `The input is not valid: ${meta.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, 'Check the fields and try again.')
  }
  if (!input.success) {
    return jsonError(400, `The input is not valid: ${input.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, 'Check the fields and try again.')
  }

  const apiKey = Netlify.env.get('GEMINI_API_KEY')
  if (!apiKey) return jsonError(500, 'The AI key is not configured on the server.', 'Add the lines manually and tell the administrator.')

  const model = runtimeModel({ GEMINI_MODEL_RUNTIME: Netlify.env.get('GEMINI_MODEL_RUNTIME') })
  const mode = req.headers.get('x-ai-mode') === 'replay' ? 'replay' : 'live'
  const db = supabaseAdmin()
  const outcome = await runStep(def, input.data, { model, client: createGeminiClient(apiKey), replay: createSupabaseReplayStore(db), mode })

  const request_id = meta.data.request_id ?? null
  const line_id = meta.data.line_id ?? null

  if (outcome.ok) {
    const r = outcome.result
    const ai_run_id = await insertAiRun(db, {
      step: def.name,
      mode: r.mode,
      model: r.model,
      request_id,
      line_id,
      input: input.data,
      raw_output: r.raw ?? JSON.stringify(r.output),
      output: r.output,
      checks: r.checks,
      latency_ms: r.latency_ms,
      tokens_in: r.tokens_in ?? null,
      tokens_out: r.tokens_out ?? null,
    })
    return Response.json({ ok: true, ai_run_id, replay_key: outcome.replay_key, ...r })
  }

  const f = outcome.failure
  const ai_run_id = await insertAiRun(db, {
    step: def.name,
    mode: 'live',
    model: f.model,
    request_id,
    line_id,
    input: input.data,
    raw_output: f.raw ?? null,
    output: null,
    checks: f.checks,
    latency_ms: f.latency_ms,
    tokens_in: null,
    tokens_out: null,
  })
  return Response.json({ ok: false, ai_run_id, replay_key: outcome.replay_key, error: f.error, next: f.next, checks: f.checks, model: f.model, latency_ms: f.latency_ms, raw: f.raw ?? null }, { status: 200 })
}
