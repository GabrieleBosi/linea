import { applyEvent } from '@/domain/applyEvent'
import { requestRef, yearOf } from '@/domain/ids'
import type { Configuration, Line, Request } from '@/domain/types'
import { assertRequestOpen, estimateCost, loadReferencePool, mustGetRequest, runPreCheck, ServiceError, type ServiceContext } from './context'

export type NewLineInput = Configuration & { notes?: string }

export type CreateRequestInput = {
  customer_id: string
  title: string
  source_text?: string
  open_questions?: string[]
  stated_date?: string | null
  requested_delivery_date?: string | null
  delivery_hint?: string | null
  /** Defaults to stated_date, then now. Editable by Sales. Spec 4.2. */
  received_at?: string | null
  lines: NewLineInput[]
  /** Where the lines came from. Shown in the timeline. */
  source?: 'manual' | 'ai'
  ai_run_id?: string | null
  ai_mode?: 'live' | 'replay' | 'revised' | null
}

export type CreateRequestResult = { request: Request; lines: Line[] }

/** Creates the request, its lines with the pre-check applied, and the events. Spec screen 1. */
export async function createRequest(ctx: ServiceContext, input: CreateRequestInput): Promise<CreateRequestResult> {
  const customer = await ctx.repo.getCustomer(input.customer_id)
  if (!customer) throw new ServiceError('Select a customer first.', 'Pick a customer from the list.')
  if (input.lines.length === 0) throw new ServiceError('A request needs at least one line.', 'Add a line before you create the request.')
  if (!input.title.trim()) throw new ServiceError('A request needs a title.', 'Give the request a short title.')

  const received_at = input.received_at ?? (input.stated_date ? `${input.stated_date}T09:00:00.000Z` : ctx.now())
  const year = yearOf(received_at)
  const ref = requestRef(year, await ctx.repo.countRequestsInYear(year))

  const request = await ctx.repo.insertRequest({
    ref,
    customer_id: input.customer_id,
    title: input.title.trim(),
    source_text: input.source_text ?? '',
    open_questions: input.open_questions ?? [],
    stated_date: input.stated_date ?? null,
    requested_delivery_date: input.requested_delivery_date ?? null,
    delivery_hint: input.delivery_hint ?? null,
    status: 'open',
    hold_reason: null,
    owner: ctx.actor.name,
    received_at,
    order_id: null,
  })

  await ctx.repo.appendEvents([
    {
      request_id: request.id,
      line_id: null,
      actor_role: ctx.actor.role,
      actor_name: ctx.actor.name,
      type: 'request_created',
      payload: { ref, title: request.title, customer: customer.name, line_count: input.lines.length, source: input.source ?? 'manual', ai_run_id: input.ai_run_id ?? null, mode: input.ai_mode ?? null },
    },
    ...(input.ai_run_id
      ? [
          {
            request_id: request.id,
            line_id: null,
            actor_role: ctx.actor.role,
            actor_name: ctx.actor.name,
            type: 'ai_run' as const,
            payload: { step: 'intake_extract', ai_run_id: input.ai_run_id, mode: input.ai_mode ?? 'live', approved: true },
          },
        ]
      : []),
  ])

  const lines = await addLines(ctx, request, input.lines)
  return { request, lines }
}

/** Adds lines to an existing request with the pre-check applied. Used at creation and by the composer. */
export async function addLines(ctx: ServiceContext, request: Request, inputs: NewLineInput[]): Promise<Line[]> {
  assertRequestOpen(request)
  const pool = await loadReferencePool(ctx.repo)
  const rules = await ctx.repo.listRules()
  const existing = await ctx.repo.listLines(request.id)
  let nextNo = existing.reduce((m, l) => Math.max(m, l.line_no), 0) + 1
  const today = ctx.today()
  const out: Line[] = []

  for (const input of inputs) {
    const config: Configuration = { family: input.family, size: input.size, material: input.material, length_mm: input.length_mm, quantity: input.quantity }
    const line = await ctx.repo.insertLine({
      request_id: request.id,
      line_no: nextNo,
      ...config,
      notes: input.notes ?? '',
      commercial_status: 'draft',
      technical_status: 'not_required',
      alternative_of_line_id: null,
      cost_estimate: estimateCost(config, today),
      unit_price: null,
      price_memo: null,
      reference_ids: [],
      agreed_in_quotation_id: null,
    })
    nextNo += 1
    await ctx.repo.appendEvents([
      {
        request_id: request.id,
        line_id: line.id,
        actor_role: ctx.actor.role,
        actor_name: ctx.actor.name,
        type: 'line_added',
        payload: { line_no: line.line_no, ...config, notes: line.notes },
      },
    ])

    const pre = await runPreCheck(ctx, config, pool, rules, request.ref)
    if (pre.needs_check) {
      const reason = pre.hits.length > 0 ? undefined : 'New configuration: no comparable quotation in history.'
      const t = applyEvent(line, { name: 'request_check', rule_hits: pre.hits, ...(reason ? { reason } : {}) }, ctx.actor)
      const committed = await ctx.repo.commitLineTransition(t)
      await ctx.repo.insertCheck({
        line_id: line.id,
        status: 'pending',
        requested_by: ctx.actor.name,
        requested_at: ctx.now(),
        decided_by: null,
        decided_at: null,
        notes: reason ?? null,
        rule_hits: pre.hits,
        alternative: null,
      })
      out.push(committed)
    } else {
      out.push(line)
    }
  }
  return out
}

export async function addLineToRequest(ctx: ServiceContext, request_id: string, input: NewLineInput): Promise<Line> {
  const request = await mustGetRequest(ctx, request_id)
  const [line] = await addLines(ctx, request, [input])
  if (!line) throw new ServiceError('The line could not be added.', 'Try again.')
  return line
}
