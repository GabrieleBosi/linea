// Shared AI types. Spec 4.1. No browser, no Netlify imports.

import type { z } from 'zod'
import type { Check } from '@/domain/types'

export type { Check }

export type AiMode = 'live' | 'replay' | 'revised'

export type StepName = 'intake_extract' | 'reply_interpret' | 'price_memo' | 'cover_text'

export type ThinkingLevel = 'minimal' | 'medium'

/** Spec 4.1 common contract. */
export type StepResult<T> = {
  output: T
  checks: Check[]
  mode: AiMode
  model: string
  latency_ms: number
  tokens_in?: number
  tokens_out?: number
  /** First model output before revision, or the raw text when the schema failed. */
  raw?: string
}

export type StepFailure = {
  /** What happened. */
  error: string
  /** What to do next, for the UI. */
  next: string
  checks: Check[]
  model: string
  latency_ms: number
  raw?: string
}

export type StepOutcome<T> = ({ ok: true; result: StepResult<T> } | { ok: false; failure: StepFailure }) & { replay_key: string }

export type StepDefinition<I, O> = {
  name: StepName
  budget_ms: number
  temperature: number
  thinking: ThinkingLevel
  /** Steps 6 and 7 get one revision round on a failed check. */
  allowRevision: boolean
  schema: z.ZodType<O>
  /** JSON schema for the model. Derived from `schema`. */
  jsonSchema: unknown
  /** The fields that make the replay key. Spec 4.1.1. */
  replayFields: (input: I) => unknown
  systemPrompt: string
  userPrompt: (input: I) => string
  /** Code checks after schema validation. */
  checks: (input: I, output: O) => Check[]
}

export type ModelRequest = {
  model: string
  system: string
  user: string
  jsonSchema: unknown
  temperature: number
  thinking: ThinkingLevel
  signal: AbortSignal
}

export type ModelResponse = {
  text: string
  tokens_in?: number
  tokens_out?: number
}

/** The only thing the client needs from the model provider. Injectable for tests. */
export type ModelClient = (req: ModelRequest) => Promise<ModelResponse>

export interface ReplayStore {
  get(step: StepName, key: string): Promise<unknown | null>
  put(step: StepName, key: string, output: unknown): Promise<void>
}

/** Row written for every call, live or replay. Spec 2.1 AiRun. */
export type AiRunInsert = {
  step: StepName
  mode: AiMode
  model: string
  request_id: string | null
  line_id: string | null
  input: unknown
  raw_output: string | null
  output: unknown | null
  checks: Check[]
  latency_ms: number
  tokens_in: number | null
  tokens_out: number | null
}
