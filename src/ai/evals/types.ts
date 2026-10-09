// Eval case shapes. Spec 9.1 and 4.8. Cases live in evals/*.jsonl, one JSON object per line.

import type { IntakeInput } from '../steps/intake_extract'
import type { ReplyInput } from '../steps/reply_interpret'
import type { MemoInput } from '../steps/price_memo'
import type { CoverInput } from '../steps/cover_text'
import type { Verdict } from '../judge'
import type { StepName } from '../types'

export type ExpectedIntakeLine = { family: string; size: number | null; material: string; length_mm: number | null; quantity: number | null }

export type ExpectedIntake = {
  lines: ExpectedIntakeLine[]
  /** At least this many open questions. */
  open_questions_min?: number
  stated_date?: string | null
  requested_delivery_date?: string | null
  /** The delivery hint contains this text, case-insensitive. */
  delivery_hint_contains?: string
}

export type ExpectedDecision = { line_no: number; decision: 'accept' | 'change' | 'reject' | 'unclear'; quantity?: number | null }

export type ExpectedReply = { decisions: ExpectedDecision[]; overall?: 'accept_all' | 'partial' | 'reject_all' | 'unclear' }

export type AttackTag =
  | 'direct_instruction'
  | 'role_injection'
  | 'hidden_in_signature'
  | 'obfuscated'
  | 'multilingual'
  | 'code_payload'
  | 'exfiltration'
  | 'schema_break'
  | 'oversize'

/** What must not take effect. Graded by code. */
export type AttackIntent =
  | { type: 'extra_line'; max_lines: number }
  | { type: 'quantity'; line: number; injected: number }
  | { type: 'extra_field'; name: string }
  | { type: 'decision'; line_no: number; injected: 'accept' | 'change' | 'reject' | 'unclear' }
  | { type: 'price'; injected: number }
  | { type: 'none' }

export type QualityCase<I> = { id: string; kind: 'objective'; tags: string[]; input: I; expected: ExpectedIntake | ExpectedReply }

export type AdversarialCase<I> = {
  id: string
  kind: 'adversarial'
  attack: AttackTag
  tags: string[]
  input: I
  /** Must never appear in the output. */
  marker: string
  intent: AttackIntent
  /** For the contamination check on lines or decisions. */
  expected: ExpectedIntake | ExpectedReply
  /** Oversize cases: pad the text with this many characters of noise around the request. */
  pad?: number
}

export type ControlCase<I> = { id: string; kind: 'control'; step: StepName; tags: string[]; input: I; expected: ExpectedIntake | ExpectedReply }

/** Text steps (P1): graded by the code checks plus the judge rubric. Spec 9.1. */
export type JudgedCase<I> = { id: string; kind: 'judged'; tags: string[]; input: I }

export type EvalCase =
  | QualityCase<IntakeInput>
  | QualityCase<ReplyInput>
  | AdversarialCase<IntakeInput>
  | AdversarialCase<ReplyInput>
  | ControlCase<IntakeInput>
  | ControlCase<ReplyInput>
  | JudgedCase<MemoInput>
  | JudgedCase<CoverInput>

export type CaseResult = {
  id: string
  kind: 'objective' | 'adversarial' | 'control' | 'judged'
  tags: string[]
  pass: boolean
  detail: string
  latency_ms: number
  mode: string
  checks_failed: string[]
  /** Adversarial metrics. */
  contaminated?: boolean
  flagged?: boolean
  schema_valid?: boolean
  /** Objective metrics for intake. */
  precision?: number
  recall?: number
  f1?: number
  output: unknown
  error?: string
  /** Judge verdict for the text steps. */
  judge?: Verdict
}

export type QualitySummary = { cases: number; pass: number; fail: number; pass_rate: number; results: CaseResult[] }

export type StepSummary = {
  step: StepName
  model: string
  /** The judge model for the text steps. */
  judge_model?: string
  quality: QualitySummary | null
  adversarial: { cases: number; contamination_rate: number; flag_recall: number; schema_validity: number; results: CaseResult[] } | null
  control: { cases: number; false_positive_rate: number; pass: number; results: CaseResult[] } | null
  /** Held-out cases, run once, never used for tuning. */
  heldout?: QualitySummary | null
  /** One entry per run when the suite ran several times. */
  runs?: RunMetrics[]
  /** Mean and range over `runs`. */
  aggregate?: Partial<Record<MetricName, MetricStats>>
}

export type MetricName = 'quality_pass_rate' | 'contamination_rate' | 'flag_recall' | 'schema_validity' | 'control_false_positive_rate'

export type RunMetrics = { run: number; at: string } & Partial<Record<MetricName, number>>

export type MetricStats = { mean: number; min: number; max: number; n: number }

export type EvalResults = { generated_at: string; steps: Partial<Record<StepName, StepSummary>> }
