// AI path of the scenario steps. Spec 7: an AI step only produces a draft and stores it in the
// context; the next step applies the scripted decisions. The player shows whether the draft
// matched the script, field by field.

import { intakeLineFlags, type IntakeInput, type IntakeOutput } from '@/ai/steps/intake_extract'
import type { ReplyOutput } from '@/ai/steps/reply_interpret'
import { ruleHits } from '@/domain/preCheck'
import type { Interpretation, Material } from '@/domain/types'
import { revisionInput } from './aiInputs'
import { ScenarioAssertion, type ScenarioContext, type ScriptedIntake } from './types'

export type FieldComparison = { field: string; expected: string; actual: string; match: boolean }

export function intakeToScripted(o: IntakeOutput): ScriptedIntake {
  return {
    customer_name_guess: o.customer_name_guess,
    lines: o.lines.map((l) => {
      const complete = l.family !== 'UNKNOWN' && l.size !== null && l.material !== 'UNKNOWN' && l.length_mm !== null && l.quantity !== null
      const hits = complete ? ruleHits({ family: l.family as 'HEA' | 'HEB' | 'IPE', size: l.size as number, material: l.material as 'S235' | 'S355' | 'S460', length_mm: l.length_mm as number, quantity: l.quantity as number }).length : 0
      return {
        family: (l.family === 'UNKNOWN' ? 'HEA' : l.family) as ScriptedIntake['lines'][number]['family'],
        size: l.size ?? 0,
        material: (l.material === 'UNKNOWN' ? 'S355' : l.material) as ScriptedIntake['lines'][number]['material'],
        length_mm: l.length_mm ?? 0,
        quantity: l.quantity ?? 0,
        notes: l.notes,
        flags: intakeLineFlags(l, hits),
      }
    }),
    open_questions: o.open_questions,
    stated_date: o.stated_date,
    requested_delivery_date: o.requested_delivery_date,
    delivery_hint: o.delivery_hint,
  }
}

/** Field-by-field comparison of an intake draft with the script. Only the fields that drive state. */
export function compareIntake(draft: ScriptedIntake, script: ScriptedIntake): FieldComparison[] {
  const out: FieldComparison[] = []
  out.push({ field: 'line count', expected: String(script.lines.length), actual: String(draft.lines.length), match: draft.lines.length === script.lines.length })
  script.lines.forEach((s, i) => {
    const d = draft.lines[i]
    for (const f of ['family', 'size', 'material', 'length_mm', 'quantity'] as const) {
      const expected = String(s[f])
      const actual = d ? String(d[f]) : 'missing'
      out.push({ field: `L${i + 1}.${f}`, expected, actual, match: expected === actual })
    }
  })
  return out
}

function asMaterial(v: string | null): Material | null {
  return v === 'S235' || v === 'S355' || v === 'S460' ? v : null
}

export function replyToInterpretation(o: ReplyOutput): Interpretation {
  return {
    decisions: o.decisions.map((d) => ({ ...d, changes: { ...d.changes, material: asMaterial(d.changes.material) } })),
    overall: o.overall,
    needs_clarification: [...o.needs_clarification],
  }
}

/** Runs the intake AI step when the context provides it, else takes the script. Stores the draft, the comparison, the run id. */
export async function draftIntake(ctx: ScenarioContext, input: IntakeInput, script: ScriptedIntake): Promise<void> {
  if (ctx.ai.mode !== 'scripted' && ctx.ai.intake) {
    const r = await ctx.ai.intake(input)
    if (r) {
      const draft = intakeToScripted(r.output)
      ctx.state.intakeDraft = draft
      ctx.state.intakeComparison = compareIntake(draft, script)
      ctx.state.intakeAiRunId = r.ai_run_id
      ctx.state.intakeMode = r.mode
      ctx.state.intakeChecks = r.checks
      return
    }
    ctx.state.intakeFailed = true
  }
  ctx.state.intakeDraft = script
  ctx.state.intakeComparison = compareIntake(script, script)
  ctx.state.intakeAiRunId = null
  ctx.state.intakeMode = 'scripted'
}

/** Runs the reply AI step on the snapshot of a sent revision when the context provides it, else takes the script. */
export async function draftInterpretation(ctx: ScenarioContext, quotationId: string, revisionNo: number, replyText: string, script: Interpretation, prefix: string): Promise<void> {
  if (ctx.ai.mode !== 'scripted' && ctx.ai.interpret) {
    const snapshot = await ctx.repo.listQuotationLines(quotationId)
    const r = await ctx.ai.interpret({ reply_text: replyText, revision: revisionInput(revisionNo, snapshot) })
    if (r) {
      const draft = replyToInterpretation(r.output)
      ctx.state[`${prefix}Draft`] = draft
      ctx.state[`${prefix}Comparison`] = compareDecisions(draft, script)
      ctx.state[`${prefix}AiRunId`] = r.ai_run_id
      ctx.state[`${prefix}Mode`] = r.mode
      ctx.state[`${prefix}Checks`] = r.checks
      return
    }
    ctx.state[`${prefix}Failed`] = true
  }
  ctx.state[`${prefix}Draft`] = script
  ctx.state[`${prefix}Comparison`] = compareDecisions(script, script)
  ctx.state[`${prefix}AiRunId`] = null
  ctx.state[`${prefix}Mode`] = 'scripted'
}

/** The AI origin for applyResponse when the draft came from a run. */
export function aiOrigin(ctx: ScenarioContext, prefix: string): { ai_run_id: string; mode: 'live' | 'replay' | 'revised' } | undefined {
  const id = ctx.state[`${prefix}AiRunId`]
  const mode = ctx.state[`${prefix}Mode`]
  if (typeof id === 'string' && (mode === 'live' || mode === 'replay' || mode === 'revised')) return { ai_run_id: id, mode }
  return undefined
}

/**
 * Records the approval of a draft on its run, as the screens do. The scripted decisions are what
 * gets applied, so a draft that differs from the script counts as edited by the human.
 */
export async function approveDraft(ctx: ScenarioContext, prefix: string): Promise<void> {
  const id = ctx.state[`${prefix}AiRunId`]
  if (typeof id !== 'string' || !ctx.ai.decide) return
  const c = ctx.state[`${prefix}Comparison`] as FieldComparison[] | undefined
  const edited = Boolean(c?.some((x) => !x.match))
  await ctx.ai.decide(id, true, edited)
}

export function assertMatches(ctx: ScenarioContext, key: string, what: string): void {
  const c = ctx.state[key] as FieldComparison[] | undefined
  if (!c) return
  const bad = c.filter((x) => !x.match)
  if (bad.length > 0) {
    throw new ScenarioAssertion(`${what}: ${bad.map((b) => `${b.field} expected ${b.expected}, got ${b.actual}`).join('; ')}`)
  }
}

/** Decision and changed quantity per line, plus overall. */
export function compareDecisions(draft: Interpretation, script: Interpretation): FieldComparison[] {
  const out: FieldComparison[] = []
  for (const s of script.decisions) {
    const d = draft.decisions.find((x) => x.line_no === s.line_no)
    out.push({ field: `L${s.line_no}.decision`, expected: s.decision, actual: d?.decision ?? 'missing', match: d?.decision === s.decision })
    if (s.changes.quantity !== null) {
      out.push({ field: `L${s.line_no}.quantity`, expected: String(s.changes.quantity), actual: String(d?.changes.quantity ?? 'missing'), match: d?.changes.quantity === s.changes.quantity })
    }
  }
  out.push({ field: 'overall', expected: script.overall, actual: draft.overall, match: draft.overall === script.overall })
  return out
}

export function allMatch(c: FieldComparison[]): boolean {
  return c.every((x) => x.match)
}
