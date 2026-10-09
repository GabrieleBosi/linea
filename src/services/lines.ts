// Line use cases: saveLine, withdrawLine, reopenLine, requestCheck. Spec 2.9.

import { applyEvent } from '@/domain/applyEvent'
import { configurationOf, sameConfiguration, type Configuration, type Line } from '@/domain/types'
import { assertRequestOpen, estimateCost, mustGetLine, mustGetRequest, runPreCheck, ServiceError, type ServiceContext } from './context'

export type SaveLineInput = Partial<Configuration> & {
  notes?: string
  unit_price?: number | null
  price_memo?: string | null
  reference_ids?: string[]
}

const EDITABLE_STATES = new Set(['draft', 'negotiating'])

/**
 * Saves configuration, notes, price and references. A configuration change recomputes the
 * cost estimate, writes line_changed and re-runs the pre-check. On a rule hit the service
 * applies request_check. Spec 2.7 and screen 3.
 */
export async function saveLine(ctx: ServiceContext, line_id: string, input: SaveLineInput): Promise<Line> {
  const line = await mustGetLine(ctx, line_id)
  const request = await mustGetRequest(ctx, line.request_id)
  assertRequestOpen(request)
  if (!EDITABLE_STATES.has(line.commercial_status)) {
    throw new ServiceError(
      `Line L${line.line_no} is ${line.commercial_status} and cannot be edited.`,
      'Record the customer reply to change a quoted line, or withdraw it.',
    )
  }

  const before = configurationOf(line)
  const after: Configuration = {
    family: input.family ?? line.family,
    size: input.size ?? line.size,
    material: input.material ?? line.material,
    length_mm: input.length_mm ?? line.length_mm,
    quantity: input.quantity ?? line.quantity,
  }
  if (after.quantity <= 0 || after.length_mm <= 0) {
    throw new ServiceError('Quantity and length must be positive.', 'Correct the values and save again.')
  }
  const configChanged = !sameConfiguration(before, after)
  const unit_price = input.unit_price === undefined ? line.unit_price : input.unit_price
  if (unit_price !== null && unit_price < 0) {
    throw new ServiceError('The unit price cannot be negative.', 'Enter a price of zero or more.')
  }

  const patch = {
    ...after,
    notes: input.notes ?? line.notes,
    unit_price,
    price_memo: input.price_memo === undefined ? line.price_memo : input.price_memo,
    reference_ids: input.reference_ids ?? line.reference_ids,
    cost_estimate: configChanged ? estimateCost(after, ctx.today()) : line.cost_estimate,
  }
  let saved = await ctx.repo.updateLine(line.id, patch)

  if (configChanged) {
    await ctx.repo.appendEvents([
      {
        request_id: line.request_id,
        line_id: line.id,
        actor_role: ctx.actor.role,
        actor_name: ctx.actor.name,
        type: 'line_changed',
        payload: { line_no: line.line_no, before, after, source: 'composer' },
      },
    ])
    saved = await recheckAfterChange(ctx, saved)
  }
  return saved
}

/** Re-runs the pre-check after a configuration change. Applies request_check on a rule hit. */
export async function recheckAfterChange(ctx: ServiceContext, line: Line): Promise<Line> {
  const pre = await runPreCheck(ctx, configurationOf(line))
  if (pre.hits.length === 0) return line
  if (line.technical_status !== 'not_required' && line.technical_status !== 'feasible') return line
  const t = applyEvent(line, { name: 'request_check', rule_hits: pre.hits }, ctx.actor)
  const committed = await ctx.repo.commitLineTransition(t)
  await ctx.repo.insertCheck({
    line_id: line.id,
    status: 'pending',
    requested_by: ctx.actor.name,
    requested_at: ctx.now(),
    decided_by: null,
    decided_at: null,
    notes: 'Configuration changed.',
    rule_hits: pre.hits,
    alternative: null,
  })
  return committed
}

export async function withdrawLine(ctx: ServiceContext, line_id: string, reason: string): Promise<Line> {
  const line = await mustGetLine(ctx, line_id)
  const request = await mustGetRequest(ctx, line.request_id)
  assertRequestOpen(request)
  const t = applyEvent(line, { name: 'withdraw', reason }, ctx.actor)
  return ctx.repo.commitLineTransition(t)
}

export async function reopenLine(ctx: ServiceContext, line_id: string): Promise<Line> {
  const line = await mustGetLine(ctx, line_id)
  const request = await mustGetRequest(ctx, line.request_id)
  const t = applyEvent(line, { name: 'reopen_line', request_status: request.status }, ctx.actor)
  return ctx.repo.commitLineTransition(t)
}

/** Sales or Operations asks for a feasibility check on any line. Spec 2.7. */
export async function requestCheck(ctx: ServiceContext, line_id: string, reason: string): Promise<Line> {
  const line = await mustGetLine(ctx, line_id)
  const request = await mustGetRequest(ctx, line.request_id)
  assertRequestOpen(request)
  const pre = await runPreCheck(ctx, configurationOf(line), undefined, undefined, request.ref)
  const t = applyEvent(line, { name: 'request_check', reason, rule_hits: pre.hits }, ctx.actor)
  const committed = await ctx.repo.commitLineTransition(t)
  await ctx.repo.insertCheck({
    line_id: line.id,
    status: 'pending',
    requested_by: ctx.actor.name,
    requested_at: ctx.now(),
    decided_by: null,
    decided_at: null,
    notes: reason,
    rule_hits: pre.hits,
    alternative: null,
  })
  return committed
}
