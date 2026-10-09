// Request use cases: convertToOrder, holdRequest, rejectRequest, reopenRequest. Spec 2.9.

import { applyEvent } from '@/domain/applyEvent'
import { orderRef, yearOf } from '@/domain/ids'
import { computeReadiness, type Readiness } from '@/domain/readiness'
import { isOpen, type Line, type Order, type OrderLine, type Quotation, type Request } from '@/domain/types'
import { mustGetRequest, ServiceError, type ServiceContext } from './context'

export type RequestAggregateView = { request: Request; lines: Line[]; quotations: Quotation[]; readiness: Readiness }

export async function loadRequestAggregate(ctx: ServiceContext, request_id: string): Promise<RequestAggregateView> {
  const request = await mustGetRequest(ctx, request_id)
  const [lines, quotations] = await Promise.all([ctx.repo.listLines(request_id), ctx.repo.listQuotations(request_id)])
  return { request, lines, quotations, readiness: computeReadiness(lines, quotations, ctx.today()) }
}

/** The human click after the code guard. Spec step 12. */
export async function convertToOrder(ctx: ServiceContext, request_id: string): Promise<{ order: Order; request: Request }> {
  const { request, lines, quotations, readiness } = await loadRequestAggregate(ctx, request_id)
  if (!readiness.ready) {
    throw new ServiceError('The request is not ready for an order.', readiness.blockers.join(' '))
  }
  const existing = await ctx.repo.getOrderByRequest(request_id)
  if (existing) throw new ServiceError(`Order ${existing.order_ref} already exists for this request.`, 'Open the order from the workspace.')

  const orderLines: OrderLine[] = []
  for (const line of lines.filter(isOpen)) {
    const qid = line.agreed_in_quotation_id
    const quotation = quotations.find((q) => q.id === qid)
    if (!qid || !quotation) throw new ServiceError(`Line L${line.line_no} has no agreed revision.`, 'Record the customer acceptance first.')
    const snap = (await ctx.repo.listQuotationLines(qid)).find((s) => s.line_id === line.id)
    if (!snap) throw new ServiceError(`Line L${line.line_no} is missing from revision R${quotation.revision_no}.`, 'Contact support.')
    orderLines.push({
      line_id: line.id,
      line_no: line.line_no,
      family: snap.family,
      size: snap.size,
      material: snap.material,
      length_mm: snap.length_mm,
      quantity: snap.quantity,
      unit_price: snap.unit_price,
      total_price: snap.total_price,
      cost_estimate: snap.cost_estimate,
      margin: snap.margin,
      agreed_in_quotation_id: qid,
      agreed_in_revision_no: quotation.revision_no,
    })
  }

  const today = ctx.today()
  const year = yearOf(today)
  const order = await ctx.repo.insertOrder({
    request_id,
    order_ref: orderRef(year, await ctx.repo.countOrdersInYear(year)),
    lines: orderLines,
  })
  const t = applyEvent({ request, lines, quotations }, { name: 'convert', order_id: order.id, order_ref: order.order_ref }, ctx.actor, { today })
  const converted = await ctx.repo.commitRequestTransition(t)
  return { order, request: converted }
}

export async function holdRequest(ctx: ServiceContext, request_id: string, reason: string): Promise<Request> {
  const agg = await loadRequestAggregate(ctx, request_id)
  return ctx.repo.commitRequestTransition(applyEvent(agg, { name: 'hold', reason }, ctx.actor))
}

export async function rejectRequest(ctx: ServiceContext, request_id: string, reason: string): Promise<Request> {
  const agg = await loadRequestAggregate(ctx, request_id)
  return ctx.repo.commitRequestTransition(applyEvent(agg, { name: 'reject_request', reason }, ctx.actor))
}

export async function reopenRequest(ctx: ServiceContext, request_id: string): Promise<Request> {
  const agg = await loadRequestAggregate(ctx, request_id)
  return ctx.repo.commitRequestTransition(applyEvent(agg, { name: 'reopen' }, ctx.actor))
}
