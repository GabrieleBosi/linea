// In-memory repository for tests, scenario runs and the static demo. No IO: the static demo
// persists it through snapshot() and restore().

import type { StepName } from '@/ai/types'
import type { LineTransition, RequestTransition } from '@/domain/applyEvent'
import { CATALOG_PROFILES, FEASIBILITY_RULES } from '@/domain/catalog'
import { executableCount } from '@/domain/readiness'
import type {
  CheckStatus,
  Customer,
  CustomerResponse,
  Event,
  EventRecord,
  EventType,
  FeasibilityCheck,
  FeasibilityRule,
  LegacyQuote,
  Line,
  Order,
  Quotation,
  QuotationLine,
  Request,
} from '@/domain/types'
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

export type MemoryRepoOptions = {
  customers?: Array<Omit<Customer, 'id'> & { id?: string }>
  legacyQuotes?: LegacyQuote[]
  rules?: FeasibilityRule[]
  /** Recorded AI traces shown next to the ones of the session. Read only; not part of a snapshot. */
  recordedAiRuns?: AiRunRecord[]
  /** Clock for created_at. Defaults to the real time. */
  now?: () => string
}

export type AiRunInsertRecord = Omit<AiRunRecord, 'id' | 'created_at' | 'accepted' | 'edited'>

/** Everything a session writes. Reference data and recorded traces are not in it. */
export type MemorySnapshot = {
  customers: Customer[]
  requests: Request[]
  lines: Line[]
  quotations: Quotation[]
  quotationLines: QuotationLine[]
  responses: CustomerResponse[]
  checks: FeasibilityCheck[]
  orders: Order[]
  events: Event[]
  aiRuns: AiRunRecord[]
}

let counter = 0
function newId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter.toString(36).padStart(6, '0')}`
}

/** After a restore, new ids must not repeat the restored ones. */
function bumpCounterPast(ids: Iterable<string>): void {
  for (const id of ids) {
    const m = /-([0-9a-z]{6})$/.exec(id)
    if (m) counter = Math.max(counter, parseInt(m[1]!, 36))
  }
}

function clone<T>(v: T): T {
  return structuredClone(v)
}

export class MemoryRepo implements Repo {
  readonly customers = new Map<string, Customer>()
  readonly requests = new Map<string, Request>()
  readonly lines = new Map<string, Line>()
  readonly quotations = new Map<string, Quotation>()
  readonly quotationLines = new Map<string, QuotationLine>()
  readonly responses = new Map<string, CustomerResponse>()
  readonly checks = new Map<string, FeasibilityCheck>()
  readonly orders = new Map<string, Order>()
  readonly events: Event[] = []
  readonly aiRuns: AiRunRecord[] = []
  readonly recordedAiRuns: AiRunRecord[]
  readonly legacy: LegacyQuote[]
  readonly rules: FeasibilityRule[]
  private readonly now: () => string

  constructor(options: MemoryRepoOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString())
    this.legacy = clone(options.legacyQuotes ?? [])
    this.rules = clone(options.rules ?? [...FEASIBILITY_RULES])
    this.recordedAiRuns = clone(options.recordedAiRuns ?? [])
    for (const c of options.customers ?? []) {
      const id = c.id ?? newId('cust')
      this.customers.set(id, { id, name: c.name, segment: c.segment, country: c.country })
    }
    void CATALOG_PROFILES
  }

  /** Deletes every transactional row. Reference data stays. */
  reset(): void {
    this.requests.clear()
    this.lines.clear()
    this.quotations.clear()
    this.quotationLines.clear()
    this.responses.clear()
    this.checks.clear()
    this.orders.clear()
    this.events.length = 0
    this.aiRuns.length = 0
  }

  /** The session's rows, for the static demo's per-tab storage. */
  snapshot(): MemorySnapshot {
    return clone({
      customers: [...this.customers.values()],
      requests: [...this.requests.values()],
      lines: [...this.lines.values()],
      quotations: [...this.quotations.values()],
      quotationLines: [...this.quotationLines.values()],
      responses: [...this.responses.values()],
      checks: [...this.checks.values()],
      orders: [...this.orders.values()],
      events: this.events,
      aiRuns: this.aiRuns,
    })
  }

  /** Replaces the session's rows with a snapshot. Reference data and recorded traces stay. */
  restore(snap: MemorySnapshot): void {
    const s = clone(snap)
    const fill = <T extends { id: string }>(map: Map<string, T>, rows: T[]) => {
      map.clear()
      for (const r of rows) map.set(r.id, r)
    }
    fill(this.customers, s.customers)
    fill(this.requests, s.requests)
    fill(this.lines, s.lines)
    fill(this.quotations, s.quotations)
    fill(this.quotationLines, s.quotationLines)
    fill(this.responses, s.responses)
    fill(this.checks, s.checks)
    fill(this.orders, s.orders)
    this.events.splice(0, this.events.length, ...s.events)
    this.aiRuns.splice(0, this.aiRuns.length, ...s.aiRuns)
    bumpCounterPast([...s.customers, ...s.requests, ...s.lines, ...s.quotations, ...s.quotationLines, ...s.responses, ...s.checks, ...s.orders, ...s.events, ...s.aiRuns].map((r) => r.id))
  }

  // Reference data

  async listCustomers(): Promise<Customer[]> {
    return [...this.customers.values()].map(clone).sort((a, b) => a.name.localeCompare(b.name))
  }

  async getCustomer(id: string): Promise<Customer | null> {
    const c = this.customers.get(id)
    return c ? clone(c) : null
  }

  async listRules(): Promise<FeasibilityRule[]> {
    return clone(this.rules)
  }

  async listLegacyQuotes(): Promise<LegacyQuote[]> {
    return clone(this.legacy)
  }

  async listSentQuotationLines(): Promise<SentQuotationLine[]> {
    const out: SentQuotationLine[] = []
    for (const ql of this.quotationLines.values()) {
      const q = this.quotations.get(ql.quotation_id)
      if (!q || q.sent_at === null || q.status === 'draft') continue
      const line = this.lines.get(ql.line_id)
      const req = this.requests.get(q.request_id)
      if (!line || !req) continue
      const customer = this.customers.get(req.customer_id)
      out.push({
        quotation_line: clone(ql),
        commercial_status: line.commercial_status,
        customer_name: customer?.name ?? '',
        request_ref: req.ref,
        revision_no: q.revision_no,
        sent_at: q.sent_at,
      })
    }
    return out
  }

  // Requests

  async listRequestSummaries(): Promise<RequestSummary[]> {
    const out: RequestSummary[] = []
    for (const request of this.requests.values()) {
      const lines = [...this.lines.values()].filter((l) => l.request_id === request.id)
      const quotations = [...this.quotations.values()].filter((q) => q.request_id === request.id)
      const latest = quotations.length > 0 ? quotations.reduce((a, b) => (b.revision_no > a.revision_no ? b : a)) : null
      const { ready, open } = executableCount(lines)
      out.push({
        request: clone(request),
        customer_name: this.customers.get(request.customer_id)?.name ?? '',
        line_count: lines.length,
        ready_count: ready,
        open_count: open,
        latest_revision: latest ? { revision_no: latest.revision_no, status: latest.status } : null,
      })
    }
    return out.sort((a, b) => (b.request.received_at < a.request.received_at ? -1 : 1))
  }

  async getRequest(id: string): Promise<Request | null> {
    const r = this.requests.get(id)
    return r ? clone(r) : null
  }

  async insertRequest(row: RequestInsert): Promise<Request> {
    const request: Request = { ...clone(row), id: newId('req'), created_at: this.now() }
    this.requests.set(request.id, request)
    return clone(request)
  }

  async updateRequest(id: string, patch: RequestPatch): Promise<Request> {
    const r = this.must(this.requests, id, 'request')
    const next = { ...r, ...clone(patch) }
    this.requests.set(id, next)
    return clone(next)
  }

  async countRequestsInYear(year: number): Promise<number> {
    return [...this.requests.values()].filter((r) => r.ref.startsWith(`R-${year}-`)).length
  }

  async commitRequestTransition(t: RequestTransition): Promise<Request> {
    const r = this.must(this.requests, t.request.id, 'request')
    const next: Request = { ...r, status: t.request.status, hold_reason: t.request.hold_reason, order_id: t.request.order_id }
    this.requests.set(r.id, next)
    await this.appendEvents(t.events)
    return clone(next)
  }

  // Lines

  async listLines(request_id: string): Promise<Line[]> {
    return [...this.lines.values()]
      .filter((l) => l.request_id === request_id)
      .sort((a, b) => a.line_no - b.line_no)
      .map(clone)
  }

  async getLine(id: string): Promise<Line | null> {
    const l = this.lines.get(id)
    return l ? clone(l) : null
  }

  async insertLine(row: LineInsert): Promise<Line> {
    const line: Line = { ...clone(row), id: newId('line'), created_at: this.now() }
    this.lines.set(line.id, line)
    return clone(line)
  }

  async updateLine(id: string, patch: LinePatch): Promise<Line> {
    const l = this.must(this.lines, id, 'line')
    const next = { ...l, ...clone(patch) }
    this.lines.set(id, next)
    return clone(next)
  }

  async commitLineTransition(t: LineTransition): Promise<Line> {
    const l = this.must(this.lines, t.line.id, 'line')
    const next: Line = {
      ...l,
      commercial_status: t.line.commercial_status,
      technical_status: t.line.technical_status,
      agreed_in_quotation_id: t.line.agreed_in_quotation_id,
    }
    this.lines.set(l.id, next)
    await this.appendEvents(t.events)
    return clone(next)
  }

  // Quotations

  async listQuotations(request_id: string): Promise<Quotation[]> {
    return [...this.quotations.values()]
      .filter((q) => q.request_id === request_id)
      .sort((a, b) => a.revision_no - b.revision_no)
      .map(clone)
  }

  async getQuotation(id: string): Promise<Quotation | null> {
    const q = this.quotations.get(id)
    return q ? clone(q) : null
  }

  async insertQuotation(row: QuotationInsert): Promise<Quotation> {
    const q: Quotation = { ...clone(row), id: newId('quo'), created_at: this.now() }
    this.quotations.set(q.id, q)
    return clone(q)
  }

  async updateQuotation(id: string, patch: QuotationPatch): Promise<Quotation> {
    const q = this.must(this.quotations, id, 'quotation')
    const next = { ...q, ...clone(patch) }
    this.quotations.set(id, next)
    return clone(next)
  }

  async listQuotationLines(quotation_id: string): Promise<QuotationLine[]> {
    return [...this.quotationLines.values()]
      .filter((l) => l.quotation_id === quotation_id)
      .sort((a, b) => a.line_no - b.line_no)
      .map(clone)
  }

  async insertQuotationLines(rows: QuotationLineInsert[]): Promise<QuotationLine[]> {
    return rows.map((row) => {
      const ql: QuotationLine = { ...clone(row), id: newId('ql'), created_at: this.now() }
      this.quotationLines.set(ql.id, ql)
      return clone(ql)
    })
  }

  // Responses

  async listResponses(quotation_id: string): Promise<CustomerResponse[]> {
    return [...this.responses.values()].filter((r) => r.quotation_id === quotation_id).map(clone)
  }

  async getResponse(id: string): Promise<CustomerResponse | null> {
    const r = this.responses.get(id)
    return r ? clone(r) : null
  }

  async insertResponse(row: ResponseInsert): Promise<CustomerResponse> {
    const r: CustomerResponse = { ...clone(row), id: newId('resp'), created_at: this.now() }
    this.responses.set(r.id, r)
    return clone(r)
  }

  async updateResponse(id: string, patch: ResponsePatch): Promise<CustomerResponse> {
    const r = this.must(this.responses, id, 'response')
    const next = { ...r, ...clone(patch) }
    this.responses.set(id, next)
    return clone(next)
  }

  // Checks

  async listChecks(filter: { line_id?: string; status?: CheckStatus[] }): Promise<FeasibilityCheck[]> {
    return [...this.checks.values()]
      .filter((c) => (filter.line_id ? c.line_id === filter.line_id : true))
      .filter((c) => (filter.status ? filter.status.includes(c.status) : true))
      .sort((a, b) => (a.requested_at < b.requested_at ? -1 : 1))
      .map(clone)
  }

  async listCheckQueue(status: CheckStatus[]): Promise<CheckQueueItem[]> {
    const out: CheckQueueItem[] = []
    for (const check of await this.listChecks({ status })) {
      const line = this.lines.get(check.line_id)
      const request = line ? this.requests.get(line.request_id) : undefined
      if (!line || !request) continue
      out.push({ check, line: clone(line), request: clone(request), customer_name: this.customers.get(request.customer_id)?.name ?? '' })
    }
    return out
  }

  async getCheck(id: string): Promise<FeasibilityCheck | null> {
    const c = this.checks.get(id)
    return c ? clone(c) : null
  }

  async insertCheck(row: CheckInsert): Promise<FeasibilityCheck> {
    const c: FeasibilityCheck = { ...clone(row), id: newId('chk'), created_at: this.now() }
    this.checks.set(c.id, c)
    return clone(c)
  }

  async updateCheck(id: string, patch: CheckPatch): Promise<FeasibilityCheck> {
    const c = this.must(this.checks, id, 'check')
    const next = { ...c, ...clone(patch) }
    this.checks.set(id, next)
    return clone(next)
  }

  // Orders

  async getOrder(id: string): Promise<Order | null> {
    const o = this.orders.get(id)
    return o ? clone(o) : null
  }

  async getOrderByRequest(request_id: string): Promise<Order | null> {
    const o = [...this.orders.values()].find((x) => x.request_id === request_id)
    return o ? clone(o) : null
  }

  async insertOrder(row: OrderInsert): Promise<Order> {
    const o: Order = { ...clone(row), id: newId('ord'), created_at: this.now() }
    this.orders.set(o.id, o)
    return clone(o)
  }

  async countOrdersInYear(year: number): Promise<number> {
    return [...this.orders.values()].filter((o) => o.order_ref.startsWith(`O-${year}-`)).length
  }

  // Events

  async appendEvents(events: EventRecord[]): Promise<Event[]> {
    const out = events.map((e) => {
      const ev: Event = { ...clone(e), id: newId('evt'), created_at: this.now() }
      this.events.push(ev)
      return clone(ev)
    })
    return out
  }

  async listEvents(request_id: string): Promise<Event[]> {
    // Newest first. Equal timestamps keep insertion order reversed.
    return this.events
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.request_id === request_id)
      .sort((a, b) => (b.e.created_at < a.e.created_at ? -1 : b.e.created_at > a.e.created_at ? 1 : b.i - a.i))
      .map(({ e }) => clone(e))
  }

  async countEvents(type: EventType): Promise<number> {
    return this.events.filter((e) => e.type === type).length
  }

  // AI traces. The static demo writes them next to the replayed call; the full stack writes them in the functions.

  async insertAiRun(row: AiRunInsertRecord): Promise<AiRunRecord> {
    const run: AiRunRecord = { ...clone(row), id: newId('run'), accepted: null, edited: null, created_at: this.now() }
    this.aiRuns.push(run)
    return clone(run)
  }

  async decideAiRun(id: string, accepted: boolean, edited: boolean): Promise<void> {
    const run = this.aiRuns.find((r) => r.id === id)
    if (!run) throw new Error(`Unknown AI run ${id}`)
    run.accepted = accepted
    run.edited = edited
  }

  async getAiRun(id: string): Promise<AiRunRecord | null> {
    const run = this.aiRuns.find((r) => r.id === id) ?? this.recordedAiRuns.find((r) => r.id === id)
    return run ? clone(run) : null
  }

  async listAiRuns(filter: { step?: StepName; limit: number }): Promise<AiRunRecord[]> {
    // The session's runs first, newest first, then the recorded ones, newest first.
    const newest = (rows: AiRunRecord[]) => rows.map((r, i) => ({ r, i })).sort((a, b) => (b.r.created_at < a.r.created_at ? -1 : b.r.created_at > a.r.created_at ? 1 : b.i - a.i)).map(({ r }) => r)
    return [...newest(this.aiRuns), ...newest(this.recordedAiRuns)]
      .filter((r) => !filter.step || r.step === filter.step)
      .slice(0, filter.limit)
      .map(clone)
  }

  private must<T>(map: Map<string, T>, id: string, what: string): T {
    const v = map.get(id)
    if (!v) throw new Error(`Unknown ${what} ${id}`)
    return v
  }
}

export function createMemoryRepo(options: MemoryRepoOptions = {}): MemoryRepo {
  return new MemoryRepo(options)
}
