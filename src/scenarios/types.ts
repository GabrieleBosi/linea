// Scenarios are data with executable steps. Spec section 7.
// The same steps drive the Vitest scenario tests (memoryRepo), the step player on the
// design pages (supabaseRepo) and the replay recorder.

import type { IntakeInput, IntakeOutput } from '@/ai/steps/intake_extract'
import type { ReplyInput, ReplyOutput } from '@/ai/steps/reply_interpret'
import type { StepResult } from '@/ai/types'
import type { Actor, Interpretation, Role } from '@/domain/types'
import type { Repo } from '@/repo/Repo'
import type { Clock, ServiceContext } from '@/services/context'

/** The AI calls a runner provides in live or replay mode. Absent in scripted mode. */
export type ScenarioAi = {
  mode: AiMode
  intake?: (input: IntakeInput) => Promise<(StepResult<IntakeOutput> & { ai_run_id: string | null }) | null>
  interpret?: (input: ReplyInput) => Promise<(StepResult<ReplyOutput> & { ai_run_id: string | null }) | null>
  /** Records the human decision on a run, as the screens do after approval. Optional; the tests do not need it. */
  decide?: (ai_run_id: string, accepted: boolean, edited: boolean) => Promise<void>
}

export type ScenarioActor = 'sales' | 'ops' | 'customer' | 'system'

export type AiMode = 'live' | 'replay' | 'scripted'

/** The scripted extraction that the AI step is compared against. Spec 4.2 output shape, simplified. */
export type ScriptedIntake = {
  customer_name_guess: string | null
  lines: Array<{
    family: 'HEA' | 'HEB' | 'IPE'
    size: number
    material: 'S235' | 'S355' | 'S460'
    length_mm: number
    quantity: number
    notes: string
    flags: string[]
  }>
  open_questions: string[]
  stated_date: string | null
  requested_delivery_date: string | null
  delivery_hint: string | null
}

export type ScenarioContext = {
  repo: Repo
  clock: Clock
  role: Role
  setRole: (role: Role) => void
  /** A service context for the current role. */
  as: (role: Role) => ServiceContext
  ai: ScenarioAi
  /** Ids and drafts captured across steps. */
  state: Record<string, unknown>
  customerIdByName: (name: string) => Promise<string>
}

export type Step = {
  id: string
  actor: ScenarioActor
  title: string
  /** What happens and why. Shown on the design page. */
  narrative: string
  /** Where to look in the prototype after the step. Placeholders like :requestId resolve from the state. */
  route: string
  /** True for the AI steps: run() stores a draft in the state and changes nothing. */
  ai?: boolean
  run: (ctx: ScenarioContext) => Promise<void>
  expect: (ctx: ScenarioContext) => Promise<void>
}

export type Scenario = {
  id: 'a' | 'b'
  title: string
  customer: string
  situations: string[]
  steps: Step[]
}

export const PERSONAS: Record<Role, Actor> = {
  sales: { role: 'sales', name: 'Marta Keller' },
  ops: { role: 'ops', name: 'Jonas Weber' },
  sales_lead: { role: 'sales_lead', name: 'Sales lead' },
  system: { role: 'system', name: 'Linea' },
  customer: { role: 'customer', name: 'Customer' },
}

export class ScenarioAssertion extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScenarioAssertion'
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ScenarioAssertion(message)
}

export function assertEqual<T>(actual: T, expected: T, what: string): void {
  if (actual !== expected) throw new ScenarioAssertion(`${what}: expected ${String(expected)}, got ${String(actual)}`)
}

export function stateOf<T>(ctx: ScenarioContext, key: string): T {
  const v = ctx.state[key]
  if (v === undefined) throw new ScenarioAssertion(`Missing state '${key}'. Run the earlier steps first.`)
  return v as T
}

export function resolveRoute(route: string, state: Record<string, unknown>): string {
  return route.replace(/:([a-zA-Z0-9]+)/g, (_, key: string) => {
    const v = state[key]
    return typeof v === 'string' || typeof v === 'number' ? String(v) : `:${key}`
  })
}

export function scriptedInterpretation(decisions: Interpretation['decisions'], overall: Interpretation['overall'], needs_clarification: string[] = []): Interpretation {
  return { decisions, overall, needs_clarification }
}
