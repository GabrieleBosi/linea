// Browser side of the AI steps. The full-stack build calls the Netlify functions; the static demo
// replays recorded outputs in the browser. Neither calls the model from the browser. Spec 12.3.

import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { intakeOutputSchema, type IntakeInput, type IntakeOutput } from '@/ai/steps/intake_extract'
import { replyOutputSchema, type ReplyInput, type ReplyOutput } from '@/ai/steps/reply_interpret'
import { memoOutputSchema, type MemoInput, type MemoOutput } from '@/ai/steps/price_memo'
import { coverOutputSchema, type CoverInput, type CoverOutput } from '@/ai/steps/cover_text'
import type { StepName } from '@/ai/types'
import { backend } from '@/lib/backend'
import type { AiResponse } from './backendTypes'
import { useSession } from './session'

export type { AiFailure, AiResponse, AiSuccess } from './backendTypes'

export function callIntake(input: IntakeInput & { request_id?: string | null }, replay: boolean, signal: AbortSignal): Promise<AiResponse<IntakeOutput>> {
  return backend.callStep('intake_extract', input, intakeOutputSchema, replay, signal)
}

export function callReply(input: ReplyInput & { request_id?: string | null }, replay: boolean, signal: AbortSignal): Promise<AiResponse<ReplyOutput>> {
  return backend.callStep('reply_interpret', input, replyOutputSchema, replay, signal)
}

export function callMemo(input: MemoInput & { request_id?: string | null; line_id?: string | null }, replay: boolean, signal: AbortSignal): Promise<AiResponse<MemoOutput>> {
  return backend.callStep('price_memo', input, memoOutputSchema, replay, signal)
}

export function callCover(input: CoverInput & { request_id?: string | null }, replay: boolean, signal: AbortSignal): Promise<AiResponse<CoverOutput>> {
  return backend.callStep('cover_text', input, coverOutputSchema, replay, signal)
}

/** Writes accepted and edited on the AI run. Failures are logged, never blocking. */
export function recordAiDecision(ai_run_id: string, accepted: boolean, edited: boolean): Promise<void> {
  return backend.recordAiDecision(ai_run_id, accepted, edited)
}

/** Static defaults before data exists. Spec 4.1 rule 9. */
// Measured p50 at LOW thinking (evals, 2026-09-22): price_memo 2.9 to 3.5 s, cover_text 2.6 to 3.6 s.
// The demo reset clears ai_runs, so on a fresh database these defaults are what the "AI working" state shows.
export const DEFAULT_EXPECTED_MS: Record<StepName, number> = { intake_extract: 6000, reply_interpret: 6000, price_memo: 4000, cover_text: 4000 }

/** Median latency of the last 20 runs of a step, from the traces. The static demo has a fixed pace. */
export function useExpectedDuration(step: StepName): number {
  const q = useQuery({
    queryKey: ['ai-latency', step],
    enabled: backend.ready && backend.fixedExpectedMs === null,
    staleTime: 60_000,
    queryFn: async () => {
      const data = await backend.repo.listAiRuns({ step, limit: 20 }).catch(() => [])
      if (data.length === 0) return null
      const s = data.map((r) => r.latency_ms).sort((a, b) => a - b)
      const mid = Math.floor(s.length / 2)
      return s.length % 2 === 0 ? ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2 : (s[mid] ?? 0)
    },
  })
  return backend.fixedExpectedMs ?? q.data ?? DEFAULT_EXPECTED_MS[step]
}

export type AiCallState = { status: 'idle' | 'running' | 'done' | 'failed' | 'cancelled'; elapsed_ms: number }

/** Runs one AI call with the "AI working" state: elapsed time, cancel, replay header from the session toggle. */
export function useAiCall<I, O>(fn: (input: I, replay: boolean, signal: AbortSignal) => Promise<AiResponse<O>>) {
  const { replay } = useSession()
  const [state, setState] = useState<AiCallState>({ status: 'idle', elapsed_ms: 0 })
  const controller = useRef<AbortController | null>(null)
  const started = useRef<number>(0)

  useEffect(() => {
    if (state.status !== 'running') return
    const t = setInterval(() => setState((s) => (s.status === 'running' ? { ...s, elapsed_ms: Date.now() - started.current } : s)), 250)
    return () => clearInterval(t)
  }, [state.status])

  const run = useCallback(
    async (input: I): Promise<AiResponse<O>> => {
      controller.current?.abort()
      const c = new AbortController()
      controller.current = c
      started.current = Date.now()
      setState({ status: 'running', elapsed_ms: 0 })
      const r = await fn(input, replay, c.signal)
      const elapsed = Date.now() - started.current
      setState({ status: c.signal.aborted ? 'cancelled' : r.ok ? 'done' : 'failed', elapsed_ms: elapsed })
      return r
    },
    [fn, replay],
  )

  const cancel = useCallback(() => {
    controller.current?.abort()
  }, [])

  return { run, cancel, state, replay }
}
