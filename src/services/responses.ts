// Customer responses: recordResponse, applyResponse. Spec 2.9 and 4.3.
// interpretResponse (the AI step) arrives in phase 2. It never changes state.

import { applyEvent } from '@/domain/applyEvent'
import { CATALOG_PROFILES } from '@/domain/catalog'
import { configurationOf, MATERIALS, sameConfiguration, type Configuration, type CustomerResponse, type Decision, type Interpretation, type Line, type Quotation, type QuotationLine } from '@/domain/types'
import { assertRequestOpen, estimateCost, mustGetQuotation, mustGetRequest, ServiceError, type ServiceContext } from './context'
import { recheckAfterChange } from './lines'
import { prepareRevision } from './revisions'

/** Records the raw reply against a sent revision. */
export async function recordResponse(ctx: ServiceContext, quotation_id: string, raw_text: string): Promise<CustomerResponse> {
  const quotation = await mustGetQuotation(ctx, quotation_id)
  if (quotation.status === 'draft') {
    throw new ServiceError(`Revision R${quotation.revision_no} has not been sent.`, 'Send it before you record a reply.')
  }
  if (!raw_text.trim()) {
    throw new ServiceError('The reply is empty.', 'Paste the customer reply first.')
  }
  const request = await mustGetRequest(ctx, quotation.request_id)
  assertRequestOpen(request)
  const response = await ctx.repo.insertResponse({
    quotation_id,
    raw_text,
    interpretation: null,
    approved_by: null,
    approved_at: null,
    applied: false,
  })
  await ctx.repo.appendEvents([
    {
      request_id: request.id,
      line_id: null,
      actor_role: ctx.actor.role,
      actor_name: ctx.actor.name,
      type: 'response_recorded',
      payload: { response_id: response.id, quotation_id, revision_no: quotation.revision_no, length: raw_text.length },
    },
  ])
  return response
}

/** The configuration a change decision asks for: the line's own values where the reply gives none. */
function changedConfiguration(line: Line, d: Decision): Configuration {
  return {
    family: line.family,
    size: d.changes.size ?? line.size,
    material: d.changes.material ?? line.material,
    length_mm: d.changes.length_mm ?? line.length_mm,
    quantity: d.changes.quantity ?? line.quantity,
  }
}

/** Every problem with the decisions, one sentence each. Empty when they can all be applied. */
function decisionProblems(interpretation: Interpretation, snapshot: readonly QuotationLine[], lines: readonly Line[], revision_no: number): string[] {
  const problems: string[] = []
  const positive = (v: number | null) => v === null || (Number.isFinite(v) && v > 0)
  for (const d of interpretation.decisions) {
    const L = `L${d.line_no}`
    const snap = snapshot.find((s) => s.line_no === d.line_no)
    const line = snap ? lines.find((l) => l.id === snap.line_id) : undefined
    if (!snap) {
      problems.push(`${L} is not in revision R${revision_no}.`)
      continue
    }
    if (!line) {
      problems.push(`${L} no longer exists.`)
      continue
    }
    if (d.decision !== 'change') continue
    const c = d.changes
    if (c.material !== null && !MATERIALS.includes(c.material)) problems.push(`${L}: "${c.material}" is not a material Linea quotes (${MATERIALS.join(', ')}).`)
    if (!positive(c.quantity) || (c.quantity !== null && !Number.isInteger(c.quantity))) problems.push(`${L}: the quantity must be a whole number above zero.`)
    if (!positive(c.length_mm)) problems.push(`${L}: the length must be above zero.`)
    if (!positive(c.target_unit_price)) problems.push(`${L}: the target price must be above zero.`)
    if (c.size !== null && !CATALOG_PROFILES.some((p) => p.family === line.family && p.size === c.size)) problems.push(`${L}: ${line.family} ${c.size} is not in the catalog.`)
    if (sameConfiguration(configurationOf(line), changedConfiguration(line, d)) && c.target_unit_price === null) problems.push(`${L}: the change has no new value.`)
  }
  return problems
}

/**
 * Checks every decision against the revision and the catalog, and writes nothing. applyResponse
 * runs it before its first write; the dialog runs it before it records the reply, so a rejected
 * set of decisions leaves no trace.
 */
export async function validateInterpretation(ctx: ServiceContext, quotation_id: string, interpretation: Interpretation): Promise<void> {
  const quotation = await mustGetQuotation(ctx, quotation_id)
  const [snapshot, lines] = await Promise.all([ctx.repo.listQuotationLines(quotation.id), ctx.repo.listLines(quotation.request_id)])
  const problems = decisionProblems(interpretation, snapshot, lines, quotation.revision_no)
  if (problems.length > 0) {
    throw new ServiceError(`Nothing was applied. ${problems.join(' ')}`, 'Correct these lines, or mark them unclear, then apply again.')
  }
}

export type ApplyResponseResult = { response: CustomerResponse; lines: Line[]; draft: Quotation | null }

/**
 * Applies one event per approved decision. accept → customer_accept, reject → customer_reject,
 * change → line_changed + pre-check + customer_change, unclear → clarification_needed only.
 * If any decision is change, prepares the next draft revision. Spec 2.9.
 */
export type AiOrigin = { ai_run_id: string; mode: 'live' | 'replay' | 'revised' }

export async function applyResponse(ctx: ServiceContext, response_id: string, interpretation: Interpretation, approved_by: string, ai?: AiOrigin): Promise<ApplyResponseResult> {
  const response = await ctx.repo.getResponse(response_id)
  if (!response) throw new ServiceError('This reply does not exist.', 'Record the reply again.')
  if (response.applied) throw new ServiceError('This reply has already been applied.', 'Record a new reply for further changes.')

  const quotation = await mustGetQuotation(ctx, response.quotation_id)
  const request = await mustGetRequest(ctx, quotation.request_id)
  assertRequestOpen(request)
  // All or nothing: every decision is checked before the first write.
  await validateInterpretation(ctx, quotation.id, interpretation)

  if (ai) {
    await ctx.repo.appendEvents([
      {
        request_id: request.id,
        line_id: null,
        actor_role: ctx.actor.role,
        actor_name: ctx.actor.name,
        type: 'ai_run',
        payload: { step: 'reply_interpret', ai_run_id: ai.ai_run_id, mode: ai.mode, approved: true, response_id: response.id, revision_no: quotation.revision_no },
      },
    ])
  }
  const snapshot = await ctx.repo.listQuotationLines(quotation.id)
  const lines = await ctx.repo.listLines(request.id)
  const ref = { quotation_id: quotation.id, revision_no: quotation.revision_no }

  const touched: Line[] = []
  let anyChange = false

  for (const d of interpretation.decisions) {
    const snap = snapshot.find((s) => s.line_no === d.line_no)
    if (!snap) throw new ServiceError(`Line L${d.line_no} is not in revision R${quotation.revision_no}.`, 'Remove that decision or pick the right line.')
    const line = lines.find((l) => l.id === snap.line_id)
    if (!line) throw new ServiceError(`Line L${d.line_no} no longer exists.`, 'Reload the request.')

    if (d.decision === 'accept') {
      touched.push(await ctx.repo.commitLineTransition(applyEvent(line, { name: 'customer_accept', ...ref }, ctx.actor)))
    } else if (d.decision === 'reject') {
      touched.push(await ctx.repo.commitLineTransition(applyEvent(line, { name: 'customer_reject', ...ref, reason: d.source_span }, ctx.actor)))
    } else if (d.decision === 'change') {
      anyChange = true
      const before = configurationOf(line)
      const after = changedConfiguration(line, d)
      let current = line
      const configChanged = !sameConfiguration(before, after)
      if (configChanged) {
        current = await ctx.repo.updateLine(line.id, { ...after, cost_estimate: estimateCost(after, ctx.today()) })
        await ctx.repo.appendEvents([
          {
            request_id: request.id,
            line_id: line.id,
            actor_role: ctx.actor.role,
            actor_name: ctx.actor.name,
            type: 'line_changed',
            payload: { line_no: line.line_no, before, after, source: 'customer_response', response_id: response.id },
          },
        ])
        current = await recheckAfterChange(ctx, current)
      }
      const changes = { ...d.changes }
      if (!configChanged && changes.target_unit_price === null) {
        throw new ServiceError(`The change on L${d.line_no} has no new value.`, 'Enter a quantity, length, material, size or target price.')
      }
      touched.push(await ctx.repo.commitLineTransition(applyEvent(current, { name: 'customer_change', ...ref, changes }, ctx.actor)))
    } else {
      await ctx.repo.appendEvents([
        {
          request_id: request.id,
          line_id: line.id,
          actor_role: ctx.actor.role,
          actor_name: ctx.actor.name,
          type: 'clarification_needed',
          payload: { line_no: line.line_no, ...ref, note: d.source_span, needs_clarification: interpretation.needs_clarification },
        },
      ])
      touched.push(line)
    }
  }

  const updated = await ctx.repo.updateResponse(response.id, {
    interpretation,
    approved_by,
    approved_at: ctx.now(),
    applied: true,
  })

  const draft = anyChange ? await prepareRevision(ctx, request.id) : null
  return { response: updated, lines: touched, draft }
}
