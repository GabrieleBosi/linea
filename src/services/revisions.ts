// Quotation revisions: prepareRevision, sendRevision. Spec 2.4.

import { applyEvent } from '@/domain/applyEvent'
import { sumAsShown } from '@/domain/money'
import { marginOf, type Line, type Quotation, type QuotationLine } from '@/domain/types'
import type { QuotationLineInsert } from '@/repo/Repo'
import { addDays, assertRequestOpen, mustGetQuotation, mustGetRequest, revisionLines, ServiceError, type ServiceContext } from './context'

export const VALIDITY_DAYS = 30

/** Creates draft revision N+1, or returns the existing draft. A draft is a live view of the included lines. */
export async function prepareRevision(ctx: ServiceContext, request_id: string): Promise<Quotation> {
  const request = await mustGetRequest(ctx, request_id)
  assertRequestOpen(request)
  const quotations = await ctx.repo.listQuotations(request_id)
  const draft = quotations.find((q) => q.status === 'draft')
  if (draft) return draft

  const lines = await ctx.repo.listLines(request_id)
  const included = revisionLines(lines)
  if (included.length === 0) {
    throw new ServiceError('There is no open line to quote.', 'Add a line or reopen a declined one first.')
  }
  const revision_no = quotations.reduce((m, q) => Math.max(m, q.revision_no), 0) + 1
  const quotation = await ctx.repo.insertQuotation({
    request_id,
    revision_no,
    status: 'draft',
    valid_until: null,
    cover_text: null,
    sent_at: null,
  })
  await ctx.repo.appendEvents([
    {
      request_id,
      line_id: null,
      actor_role: ctx.actor.role,
      actor_name: ctx.actor.name,
      type: 'revision_prepared',
      payload: { quotation_id: quotation.id, revision_no, line_nos: included.map((l) => l.line_no) },
    },
  ])
  return quotation
}

export type SendRevisionResult = { quotation: Quotation; snapshot: QuotationLine[]; lines: Line[] }

/**
 * Snapshots the included lines, sets sent and valid_until, applies quote to the lines,
 * marks the previous sent revision superseded. Spec 2.4.
 */
export async function sendRevision(ctx: ServiceContext, quotation_id: string, options: { valid_days?: number } = {}): Promise<SendRevisionResult> {
  const quotation = await mustGetQuotation(ctx, quotation_id)
  if (quotation.status !== 'draft') {
    throw new ServiceError(`Revision R${quotation.revision_no} is already ${quotation.status}.`, 'Prepare a new revision to send changes.')
  }
  const request = await mustGetRequest(ctx, quotation.request_id)
  assertRequestOpen(request)

  const lines = await ctx.repo.listLines(request.id)
  const included = revisionLines(lines)
  if (included.length === 0) {
    throw new ServiceError('The revision has no line to send.', 'Add or reopen a line first.')
  }
  const unpriced = included.filter((l) => l.unit_price === null || l.unit_price <= 0 || l.cost_estimate === null)
  if (unpriced.length > 0) {
    throw new ServiceError(
      `${unpriced.map((l) => `L${l.line_no}`).join(', ')} ${unpriced.length === 1 ? 'has' : 'have'} no unit price.`,
      'Open the line and set a price before you send.',
    )
  }

  const rows: QuotationLineInsert[] = included.map((l) => {
    const unit_price = l.unit_price as number
    const cost_estimate = l.cost_estimate as number
    return {
      quotation_id: quotation.id,
      line_id: l.id,
      line_no: l.line_no,
      family: l.family,
      size: l.size,
      material: l.material,
      length_mm: l.length_mm,
      quantity: l.quantity,
      unit_price,
      total_price: Math.round(unit_price * l.quantity * 100) / 100,
      cost_estimate,
      margin: marginOf(unit_price, cost_estimate, l.quantity) ?? 0,
      price_memo: l.price_memo,
      reference_ids: l.reference_ids,
      subject_to_feasibility: l.technical_status === 'pending',
    }
  })
  const snapshot = await ctx.repo.insertQuotationLines(rows)

  const today = ctx.today()
  const sent = await ctx.repo.updateQuotation(quotation.id, {
    status: 'sent',
    valid_until: addDays(today, options.valid_days ?? VALIDITY_DAYS),
    sent_at: ctx.now(),
  })

  const previous = (await ctx.repo.listQuotations(request.id)).filter((q) => q.status === 'sent' && q.id !== quotation.id)
  for (const p of previous) {
    await ctx.repo.updateQuotation(p.id, { status: 'superseded' })
  }

  const included_line_ids = included.map((l) => l.id)
  const updatedLines: Line[] = []
  for (const l of included) {
    const t = applyEvent(l, { name: 'quote', quotation_id: quotation.id, revision_no: quotation.revision_no, included_line_ids }, ctx.actor)
    updatedLines.push(await ctx.repo.commitLineTransition(t))
  }

  // The timeline shows this total next to the revision page's: both are the sum as shown.
  const total = sumAsShown(rows.map((r) => r.total_price))
  await ctx.repo.appendEvents([
    {
      request_id: request.id,
      line_id: null,
      actor_role: ctx.actor.role,
      actor_name: ctx.actor.name,
      type: 'revision_sent',
      payload: { quotation_id: quotation.id, revision_no: quotation.revision_no, valid_until: sent.valid_until, line_count: rows.length, total, superseded: previous.map((p) => p.revision_no) },
    },
  ])

  return { quotation: sent, snapshot, lines: updatedLines }
}

/** Keeps the cover text a human approved on a draft revision. Spec 6.7 (P1). The snapshot at send time carries it. */
export async function saveCoverText(ctx: ServiceContext, quotation_id: string, text: string | null): Promise<Quotation> {
  const quotation = await mustGetQuotation(ctx, quotation_id)
  if (quotation.status !== 'draft') {
    throw new ServiceError(`Revision R${quotation.revision_no} is already ${quotation.status}.`, 'The cover text of a sent revision does not change.')
  }
  return ctx.repo.updateQuotation(quotation.id, { cover_text: text === null || text.trim() === '' ? null : text.trim() })
}
