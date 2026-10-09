// What the app needs from its backend. Two implementations, picked at build time by a Vite alias:
// `backend.ts` (full stack: Supabase and the Netlify functions) and `backend.static.ts` (the static
// demo: an in-memory store per tab and recorded model outputs, no network).

import type { z } from 'zod'
import type { AiMode, Check, StepName } from '@/ai/types'
import type { Repo } from '@/repo/Repo'

export type AiSuccess<T> = { ok: true; ai_run_id: string; output: T; checks: Check[]; mode: AiMode; model: string; latency_ms: number }
export type AiFailure = { ok: false; ai_run_id?: string; error: string; next: string; checks: Check[] }
export type AiResponse<T> = AiSuccess<T> | AiFailure

export type ResetResult = { ok: true; deleted: Record<string, number> } | { ok: false; error: string; next: string; status: number }

export type Backend = {
  kind: 'live' | 'static'
  /** False when the full-stack build has no database variables. The screens then say how to start the app. */
  ready: boolean
  repo: Repo
  /** Runs one AI step. `body` is the step input plus `request_id` and `line_id` for the trace. */
  callStep<T>(step: StepName, body: unknown, output: z.ZodType<T>, replay: boolean, signal: AbortSignal): Promise<AiResponse<T>>
  /** Writes accepted and edited on the trace. Never blocks the user. */
  recordAiDecision(ai_run_id: string, accepted: boolean, edited: boolean): Promise<void>
  /** Full stack: deletes the transactional rows with the reset token. Static: clears this tab's data. */
  resetDemo(token: string): Promise<ResetResult>
  /** The "AI working" expectation when it is fixed (static replays), else null: measured from the traces. */
  fixedExpectedMs: number | null
}
