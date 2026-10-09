// Feasibility use cases: decideCheck, waiveCheck, proposeAlternative. Spec 2.9, screen 4.

import { applyEvent } from '@/domain/applyEvent'
import type { Alternative, FeasibilityCheck, Line } from '@/domain/types'
import { estimateCost, mustGetLine, ServiceError, type ServiceContext } from './context'

async function mustGetCheck(ctx: ServiceContext, id: string): Promise<FeasibilityCheck> {
  const c = await ctx.repo.getCheck(id)
  if (!c) throw new ServiceError('This check does not exist.', 'Go back to the queue.')
  return c
}

export type CheckDecision = 'feasible' | 'not_feasible'

/** Operations decides. Notes are required. */
export async function decideCheck(ctx: ServiceContext, check_id: string, decision: CheckDecision, notes: string): Promise<{ check: FeasibilityCheck; line: Line }> {
  const check = await mustGetCheck(ctx, check_id)
  if (check.status !== 'pending') {
    throw new ServiceError(`This check is already ${check.status.replace('_', ' ')}.`, 'Open the request to see the current state.')
  }
  const line = await mustGetLine(ctx, check.line_id)
  const t = applyEvent(line, { name: decision, notes, check_id }, ctx.actor)
  const committed = await ctx.repo.commitLineTransition(t)
  const updated = await ctx.repo.updateCheck(check.id, { status: decision, decided_by: ctx.actor.name, decided_at: ctx.now(), notes })
  return { check: updated, line: committed }
}

/** Waives a pending check with a reason. Logged as an override. */
export async function waiveCheck(ctx: ServiceContext, check_id: string, reason: string): Promise<{ check: FeasibilityCheck; line: Line }> {
  const check = await mustGetCheck(ctx, check_id)
  if (check.status !== 'pending') {
    throw new ServiceError(`This check is already ${check.status.replace('_', ' ')}.`, 'Open the request to see the current state.')
  }
  const line = await mustGetLine(ctx, check.line_id)
  const t = applyEvent(line, { name: 'waive_check', reason, check_id }, ctx.actor)
  const committed = await ctx.repo.commitLineTransition(t)
  const updated = await ctx.repo.updateCheck(check.id, { status: 'waived', decided_by: ctx.actor.name, decided_at: ctx.now(), notes: reason })
  return { check: updated, line: committed }
}

/**
 * Three things in sequence (spec 2.9): create the alternative line as a copy with the new
 * configuration (draft, feasible, pre-check skipped), apply supersede to the original, write
 * alternative_proposed. No transaction: the prototype writes sequentially.
 */
export async function proposeAlternative(ctx: ServiceContext, check_id: string, alternative: Alternative): Promise<{ original: Line; alternative: Line; check: FeasibilityCheck }> {
  const check = await mustGetCheck(ctx, check_id)
  if (check.status !== 'not_feasible') {
    throw new ServiceError('An alternative follows a "not feasible" decision.', 'Decide the check first.')
  }
  const original = await mustGetLine(ctx, check.line_id)
  if (original.technical_status !== 'not_feasible') {
    throw new ServiceError(`Line L${original.line_no} is ${original.technical_status.replace('_', ' ')}.`, 'Only a not feasible line takes an alternative.')
  }
  if (original.commercial_status === 'superseded') {
    throw new ServiceError(`Line L${original.line_no} already has an alternative.`, 'Open the request to see it.')
  }

  const siblings = await ctx.repo.listLines(original.request_id)
  const line_no = siblings.reduce((m, l) => Math.max(m, l.line_no), 0) + 1
  const { notes, ...config } = alternative
  const created = await ctx.repo.insertLine({
    request_id: original.request_id,
    line_no,
    ...config,
    notes,
    commercial_status: 'draft',
    technical_status: 'feasible',
    alternative_of_line_id: original.id,
    cost_estimate: estimateCost(config, ctx.today()),
    unit_price: null,
    price_memo: null,
    reference_ids: [],
    agreed_in_quotation_id: null,
  })
  await ctx.repo.appendEvents([
    {
      request_id: original.request_id,
      line_id: created.id,
      actor_role: ctx.actor.role,
      actor_name: ctx.actor.name,
      type: 'line_added',
      payload: { line_no, ...config, notes, alternative_of_line_no: original.line_no },
    },
  ])

  const superseded = await ctx.repo.commitLineTransition(applyEvent(original, { name: 'supersede', alternative_line_id: created.id }, ctx.actor))
  const proposed = await ctx.repo.commitLineTransition(
    applyEvent(superseded, { name: 'propose_alternative', alternative, alternative_line_id: created.id, check_id }, ctx.actor),
  )
  const updated = await ctx.repo.updateCheck(check.id, { alternative })
  return { original: proposed, alternative: created, check: updated }
}
