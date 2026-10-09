// Supabase repository. The browser uses it with the anon key. Row Level Security has
// prototype-only permissive policies (spec 12.4). Status columns are written only through
// commit*Transition(), which take the result of applyEvent().

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiMode, Check, StepName } from '@/ai/types'
import type { LineTransition, RequestTransition } from '@/domain/applyEvent'
import { executableCount } from '@/domain/readiness'
import type {
  Alternative,
  CheckStatus,
  Customer,
  CustomerResponse,
  Event,
  EventPayload,
  EventRecord,
  EventType,
  FeasibilityCheck,
  FeasibilityRule,
  Interpretation,
  LegacyQuote,
  Line,
  Order,
  OrderLine,
  Quotation,
  QuotationLine,
  Request,
  Role,
  RuleHit,
} from '@/domain/types'
import type { Database, Json } from './database.types'
import type {
  AiRunRecord,
  CheckInsert,
  CheckPatch,
  CheckQueueItem,
  LineInsert,
  LinePatch,
  OrderInsert,
  QuotationInsert,
  QuotationLineInsert,
  QuotationPatch,
  Repo,
  RequestInsert,
  RequestPatch,
  RequestSummary,
  ResponseInsert,
  ResponsePatch,
  SentQuotationLine,
} from './Repo'

type Tables = Database['public']['Tables']
type Row<T extends keyof Tables> = Tables[T]['Row']

function unwrap<T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error) throw new Error(`${what}: ${result.error.message}`)
  if (result.data === null || result.data === undefined) throw new Error(`${what}: no data returned`)
  return result.data
}

function asStringArray(v: Json): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

const toRequest = (r: Row<'requests'>): Request => ({ ...r, open_questions: asStringArray(r.open_questions) })
const toLine = (r: Row<'lines'>): Line => ({ ...r })
const toQuotation = (r: Row<'quotations'>): Quotation => ({ ...r })
const toQuotationLine = (r: Row<'quotation_lines'>): QuotationLine => ({ ...r })
const toResponse = (r: Row<'customer_responses'>): CustomerResponse => ({ ...r, interpretation: r.interpretation as unknown as Interpretation | null })
const toCheck = (r: Row<'feasibility_checks'>): FeasibilityCheck => ({
  ...r,
  rule_hits: (Array.isArray(r.rule_hits) ? r.rule_hits : []) as unknown as RuleHit[],
  alternative: r.alternative as unknown as Alternative | null,
})
const toOrder = (r: Row<'orders'>): Order => ({ ...r, lines: (Array.isArray(r.lines) ? r.lines : []) as unknown as OrderLine[] })
const toEvent = (r: Row<'events'>): Event => ({
  ...r,
  type: r.type as EventType,
  actor_role: r.actor_role as Role,
  payload: (r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload) ? r.payload : {}) as EventPayload,
})
const toLegacy = (r: Row<'legacy_quotes'>): LegacyQuote => ({
  ...r,
  outcome: r.outcome === 'WON' ? 'WON' : 'LOST',
  source: r.source === 'given' ? 'given' : 'generated',
})
const toJson = (v: unknown): Json => JSON.parse(JSON.stringify(v)) as Json

export class SupabaseRepo implements Repo {
  private readonly db: SupabaseClient<Database>

  constructor(db: SupabaseClient<Database>) {
    this.db = db
  }

  // Reference data

  async listCustomers(): Promise<Customer[]> {
    return unwrap(await this.db.from('customers').select('id, name, segment, country').order('name'), 'customers')
  }

  async getCustomer(id: string): Promise<Customer | null> {
    const { data, error } = await this.db.from('customers').select('id, name, segment, country').eq('id', id).maybeSingle()
    if (error) throw new Error(`customer: ${error.message}`)
    return data
  }

  async listRules(): Promise<FeasibilityRule[]> {
    return unwrap(await this.db.from('feasibility_rules').select('*').order('id'), 'rules')
  }

  async listLegacyQuotes(): Promise<LegacyQuote[]> {
    const rows = unwrap(await this.db.from('legacy_quotes').select('*').order('quote_date').limit(5000), 'legacy_quotes')
    return rows.map(toLegacy)
  }

  async listSentQuotationLines(): Promise<SentQuotationLine[]> {
    const rows = unwrap(
      await this.db
        .from('quotation_lines')
        .select('*, quotations!inner(revision_no, status, sent_at, requests(ref, customers(name))), lines(commercial_status)')
        .neq('quotations.status', 'draft'),
      'sent quotation lines',
    )
    const out: SentQuotationLine[] = []
    for (const r of rows) {
      const { quotations, lines, ...ql } = r
      if (!quotations || !quotations.sent_at || !lines) continue
      out.push({
        quotation_line: toQuotationLine(ql),
        commercial_status: lines.commercial_status,
        customer_name: quotations.requests?.customers?.name ?? '',
        request_ref: quotations.requests?.ref ?? '',
        revision_no: quotations.revision_no,
        sent_at: quotations.sent_at,
      })
    }
    return out
  }

  // Requests

  async listRequestSummaries(): Promise<RequestSummary[]> {
    const rows = unwrap(
      await this.db
        .from('requests')
        .select('*, customers(name), lines(commercial_status, technical_status), quotations(revision_no, status)')
        .order('received_at', { ascending: false }),
      'requests',
    )
    return rows.map((r) => {
      const { customers, lines, quotations, ...request } = r
      const latest = quotations.length > 0 ? quotations.reduce((a, b) => (b.revision_no > a.revision_no ? b : a)) : null
      const { ready, open } = executableCount(lines as Line[])
      return {
        request: toRequest(request),
        customer_name: customers?.name ?? '',
        line_count: lines.length,
        ready_count: ready,
        open_count: open,
        latest_revision: latest ? { revision_no: latest.revision_no, status: latest.status } : null,
      }
    })
  }

  async getRequest(id: string): Promise<Request | null> {
    const { data, error } = await this.db.from('requests').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(`request: ${error.message}`)
    return data ? toRequest(data) : null
  }

  async insertRequest(row: RequestInsert): Promise<Request> {
    const data = unwrap(await this.db.from('requests').insert({ ...row, open_questions: toJson(row.open_questions) }).select('*').single(), 'insert request')
    return toRequest(data)
  }

  async updateRequest(id: string, patch: RequestPatch): Promise<Request> {
    const { open_questions, ...rest } = patch
    const data = unwrap(
      await this.db
        .from('requests')
        .update({ ...rest, ...(open_questions ? { open_questions: toJson(open_questions) } : {}) })
        .eq('id', id)
        .select('*')
        .single(),
      'update request',
    )
    return toRequest(data)
  }

  async countRequestsInYear(year: number): Promise<number> {
    const { count, error } = await this.db.from('requests').select('*', { count: 'exact', head: true }).like('ref', `R-${year}-%`)
    if (error) throw new Error(`count requests: ${error.message}`)
    return count ?? 0
  }

  async commitRequestTransition(t: RequestTransition): Promise<Request> {
    const data = unwrap(
      await this.db
        .from('requests')
        .update({ status: t.request.status, hold_reason: t.request.hold_reason, order_id: t.request.order_id })
        .eq('id', t.request.id)
        .select('*')
        .single(),
      'request transition',
    )
    await this.appendEvents(t.events)
    return toRequest(data)
  }

  // Lines

  async listLines(request_id: string): Promise<Line[]> {
    const rows = unwrap(await this.db.from('lines').select('*').eq('request_id', request_id).order('line_no'), 'lines')
    return rows.map(toLine)
  }

  async getLine(id: string): Promise<Line | null> {
    const { data, error } = await this.db.from('lines').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(`line: ${error.message}`)
    return data ? toLine(data) : null
  }

  async insertLine(row: LineInsert): Promise<Line> {
    return toLine(unwrap(await this.db.from('lines').insert(row).select('*').single(), 'insert line'))
  }

  async updateLine(id: string, patch: LinePatch): Promise<Line> {
    return toLine(unwrap(await this.db.from('lines').update(patch).eq('id', id).select('*').single(), 'update line'))
  }

  async commitLineTransition(t: LineTransition): Promise<Line> {
    const data = unwrap(
      await this.db
        .from('lines')
        .update({
          commercial_status: t.line.commercial_status,
          technical_status: t.line.technical_status,
          agreed_in_quotation_id: t.line.agreed_in_quotation_id,
        })
        .eq('id', t.line.id)
        .select('*')
        .single(),
      'line transition',
    )
    await this.appendEvents(t.events)
    return toLine(data)
  }

  // Quotations

  async listQuotations(request_id: string): Promise<Quotation[]> {
    const rows = unwrap(await this.db.from('quotations').select('*').eq('request_id', request_id).order('revision_no'), 'quotations')
    return rows.map(toQuotation)
  }

  async getQuotation(id: string): Promise<Quotation | null> {
    const { data, error } = await this.db.from('quotations').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(`quotation: ${error.message}`)
    return data ? toQuotation(data) : null
  }

  async insertQuotation(row: QuotationInsert): Promise<Quotation> {
    return toQuotation(unwrap(await this.db.from('quotations').insert(row).select('*').single(), 'insert quotation'))
  }

  async updateQuotation(id: string, patch: QuotationPatch): Promise<Quotation> {
    return toQuotation(unwrap(await this.db.from('quotations').update(patch).eq('id', id).select('*').single(), 'update quotation'))
  }

  async listQuotationLines(quotation_id: string): Promise<QuotationLine[]> {
    const rows = unwrap(await this.db.from('quotation_lines').select('*').eq('quotation_id', quotation_id).order('line_no'), 'quotation lines')
    return rows.map(toQuotationLine)
  }

  async insertQuotationLines(rows: QuotationLineInsert[]): Promise<QuotationLine[]> {
    if (rows.length === 0) return []
    const data = unwrap(await this.db.from('quotation_lines').insert(rows).select('*'), 'insert quotation lines')
    return data.map(toQuotationLine).sort((a, b) => a.line_no - b.line_no)
  }

  // Responses

  async listResponses(quotation_id: string): Promise<CustomerResponse[]> {
    const rows = unwrap(await this.db.from('customer_responses').select('*').eq('quotation_id', quotation_id).order('created_at'), 'responses')
    return rows.map(toResponse)
  }

  async getResponse(id: string): Promise<CustomerResponse | null> {
    const { data, error } = await this.db.from('customer_responses').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(`response: ${error.message}`)
    return data ? toResponse(data) : null
  }

  async insertResponse(row: ResponseInsert): Promise<CustomerResponse> {
    const data = unwrap(
      await this.db.from('customer_responses').insert({ ...row, interpretation: row.interpretation ? toJson(row.interpretation) : null }).select('*').single(),
      'insert response',
    )
    return toResponse(data)
  }

  async updateResponse(id: string, patch: ResponsePatch): Promise<CustomerResponse> {
    const { interpretation, ...rest } = patch
    const data = unwrap(
      await this.db
        .from('customer_responses')
        .update({ ...rest, ...(interpretation !== undefined ? { interpretation: interpretation ? toJson(interpretation) : null } : {}) })
        .eq('id', id)
        .select('*')
        .single(),
      'update response',
    )
    return toResponse(data)
  }

  // Checks

  async listChecks(filter: { line_id?: string; status?: CheckStatus[] }): Promise<FeasibilityCheck[]> {
    let q = this.db.from('feasibility_checks').select('*').order('requested_at')
    if (filter.line_id) q = q.eq('line_id', filter.line_id)
    if (filter.status) q = q.in('status', filter.status)
    return unwrap(await q, 'checks').map(toCheck)
  }

  async listCheckQueue(status: CheckStatus[]): Promise<CheckQueueItem[]> {
    const rows = unwrap(
      await this.db.from('feasibility_checks').select('*, lines!inner(*, requests!inner(*, customers(name)))').in('status', status).order('requested_at'),
      'check queue',
    )
    return rows.map((r) => {
      const { lines, ...check } = r
      const { requests, ...line } = lines
      const { customers, ...request } = requests
      return { check: toCheck(check), line: toLine(line), request: toRequest(request), customer_name: customers?.name ?? '' }
    })
  }

  async getCheck(id: string): Promise<FeasibilityCheck | null> {
    const { data, error } = await this.db.from('feasibility_checks').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(`check: ${error.message}`)
    return data ? toCheck(data) : null
  }

  async insertCheck(row: CheckInsert): Promise<FeasibilityCheck> {
    const data = unwrap(
      await this.db
        .from('feasibility_checks')
        .insert({ ...row, rule_hits: toJson(row.rule_hits), alternative: row.alternative ? toJson(row.alternative) : null })
        .select('*')
        .single(),
      'insert check',
    )
    return toCheck(data)
  }

  async updateCheck(id: string, patch: CheckPatch): Promise<FeasibilityCheck> {
    const { alternative, ...rest } = patch
    const data = unwrap(
      await this.db
        .from('feasibility_checks')
        .update({ ...rest, ...(alternative !== undefined ? { alternative: alternative ? toJson(alternative) : null } : {}) })
        .eq('id', id)
        .select('*')
        .single(),
      'update check',
    )
    return toCheck(data)
  }

  // Orders

  async getOrder(id: string): Promise<Order | null> {
    const { data, error } = await this.db.from('orders').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(`order: ${error.message}`)
    return data ? toOrder(data) : null
  }

  async getOrderByRequest(request_id: string): Promise<Order | null> {
    const { data, error } = await this.db.from('orders').select('*').eq('request_id', request_id).maybeSingle()
    if (error) throw new Error(`order: ${error.message}`)
    return data ? toOrder(data) : null
  }

  async insertOrder(row: OrderInsert): Promise<Order> {
    const data = unwrap(await this.db.from('orders').insert({ ...row, lines: toJson(row.lines) }).select('*').single(), 'insert order')
    return toOrder(data)
  }

  async countOrdersInYear(year: number): Promise<number> {
    const { count, error } = await this.db.from('orders').select('*', { count: 'exact', head: true }).like('order_ref', `O-${year}-%`)
    if (error) throw new Error(`count orders: ${error.message}`)
    return count ?? 0
  }

  // Events

  async appendEvents(events: EventRecord[]): Promise<Event[]> {
    if (events.length === 0) return []
    const out: Event[] = []
    // One insert per event keeps distinct timestamps, so the timeline order is the write order.
    for (const e of events) {
      const data = unwrap(await this.db.from('events').insert({ ...e, payload: toJson(e.payload) }).select('*').single(), 'insert event')
      out.push(toEvent(data))
    }
    return out
  }

  async listEvents(request_id: string): Promise<Event[]> {
    const rows = unwrap(await this.db.from('events').select('*').eq('request_id', request_id).order('created_at', { ascending: false }), 'events')
    return rows.map(toEvent)
  }

  async countEvents(type: EventType): Promise<number> {
    const { count, error } = await this.db.from('events').select('*', { count: 'exact', head: true }).eq('type', type)
    if (error) throw new Error(`events: ${error.message}`)
    return count ?? 0
  }

  // AI traces

  async getAiRun(id: string): Promise<AiRunRecord | null> {
    const { data, error } = await this.db.from('ai_runs').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(`ai_runs: ${error.message}`)
    return data ? toAiRun(data) : null
  }

  async listAiRuns(filter: { step?: StepName; limit: number }): Promise<AiRunRecord[]> {
    let q = this.db.from('ai_runs').select('*')
    if (filter.step) q = q.eq('step', filter.step)
    const rows = unwrap(await q.order('created_at', { ascending: false }).limit(filter.limit), 'ai_runs')
    return rows.map(toAiRun)
  }
}

function toAiRun(r: Row<'ai_runs'>): AiRunRecord {
  return {
    id: r.id,
    step: r.step as StepName,
    mode: r.mode as AiMode,
    model: r.model,
    request_id: r.request_id,
    line_id: r.line_id,
    input: r.input,
    raw_output: r.raw_output,
    output: r.output,
    checks: (Array.isArray(r.checks) ? r.checks : []) as unknown as Check[],
    latency_ms: r.latency_ms,
    tokens_in: r.tokens_in,
    tokens_out: r.tokens_out,
    accepted: r.accepted,
    edited: r.edited,
    created_at: r.created_at,
  }
}

export function createSupabaseRepo(db: SupabaseClient<Database>): SupabaseRepo {
  return new SupabaseRepo(db)
}
