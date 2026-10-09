// Full-stack backend: Supabase with the anon key for the data, the Netlify functions for the AI
// steps, the decisions and the reset. The browser never calls the model. Spec 12.3.
// The static demo build replaces this module with backend.static.ts (see vite.config.ts).

import { z } from 'zod'
import type { StepName } from '@/ai/types'
import { createSupabaseRepo } from '@/repo/supabaseRepo'
import type { AiFailure, AiResponse, Backend, ResetResult } from './backendTypes'
import { supabase, supabaseConfigured } from './supabase'

const checkSchema = z.object({ name: z.string(), pass: z.boolean(), detail: z.string() })

function envelope<T extends z.ZodType>(output: T) {
  return z.discriminatedUnion('ok', [
    z.object({
      ok: z.literal(true),
      ai_run_id: z.string(),
      replay_key: z.string(),
      output,
      checks: z.array(checkSchema),
      mode: z.enum(['live', 'replay', 'revised']),
      model: z.string(),
      latency_ms: z.number(),
      tokens_in: z.number().optional(),
      tokens_out: z.number().optional(),
      raw: z.string().optional(),
    }),
    z.object({
      ok: z.literal(false),
      ai_run_id: z.string().optional(),
      error: z.string(),
      next: z.string(),
      checks: z.array(checkSchema).optional(),
      model: z.string().optional(),
      latency_ms: z.number().optional(),
      raw: z.string().nullable().optional(),
    }),
  ])
}

const PATHS: Record<StepName, string> = {
  intake_extract: '/api/ai/intake',
  reply_interpret: '/api/ai/reply',
  price_memo: '/api/ai/memo',
  cover_text: '/api/ai/cover',
}

async function callStep<T>(step: StepName, body: unknown, output: z.ZodType<T>, replay: boolean, signal: AbortSignal): Promise<AiResponse<T>> {
  let res: Response
  try {
    res = await fetch(PATHS[step], {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ai-mode': replay ? 'replay' : 'live' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if (signal.aborted) return { ok: false, error: 'Cancelled.', next: 'Run it again or continue by hand.', checks: [] }
    return { ok: false, error: `The AI service could not be reached: ${e instanceof Error ? e.message : String(e)}`, next: 'Check the connection, or continue by hand.', checks: [] }
  }
  let json: unknown
  try {
    json = await res.json()
  } catch {
    return { ok: false, error: `The AI service answered with status ${res.status} and no JSON.`, next: 'Try again, or continue by hand.', checks: [] }
  }
  const parsed = envelope(output).safeParse(json)
  if (!parsed.success) {
    return { ok: false, error: 'The AI service answered in an unexpected shape.', next: 'Try again, or continue by hand.', checks: [] }
  }
  const d = parsed.data
  if (d.ok) {
    return { ok: true, ai_run_id: d.ai_run_id, output: d.output as T, checks: d.checks, mode: d.mode, model: d.model, latency_ms: d.latency_ms }
  }
  const failure: AiFailure = { ok: false, error: d.error, next: d.next, checks: d.checks ?? [] }
  if (d.ai_run_id) failure.ai_run_id = d.ai_run_id
  return failure
}

async function recordAiDecision(ai_run_id: string, accepted: boolean, edited: boolean): Promise<void> {
  try {
    await fetch('/api/ai/decision', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ai_run_id, accepted, edited }) })
  } catch (e) {
    console.warn('AI decision not recorded', e)
  }
}

async function resetDemo(token: string): Promise<ResetResult> {
  let res: Response
  try {
    res = await fetch('/api/demo/reset', { method: 'POST', headers: { 'x-demo-reset-token': token } })
  } catch (e) {
    return { ok: false, status: 0, error: `The reset service could not be reached: ${e instanceof Error ? e.message : String(e)}`, next: 'Check the connection and try again.' }
  }
  const json = (await res.json().catch(() => null)) as { ok?: boolean; deleted?: Record<string, number>; error?: string; next?: string } | null
  if (!json) return { ok: false, status: res.status, error: `The reset service answered with status ${res.status}.`, next: 'Try again.' }
  if (json.ok && json.deleted) return { ok: true, deleted: json.deleted }
  return { ok: false, status: res.status, error: json.error ?? 'The reset failed.', next: json.next ?? 'Try again.' }
}

export const backend: Backend = {
  kind: 'live',
  ready: supabaseConfigured,
  repo: createSupabaseRepo(supabase),
  callStep,
  recordAiDecision,
  resetDemo,
  fixedExpectedMs: null,
}
