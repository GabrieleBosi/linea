// Repository interface. Two implementations: memoryRepo (tests, scenarios, the static demo) and
// supabaseRepo (the full-stack app). Status columns are written only through commit*Transition(),
// which take the result of applyEvent().

import type { AiMode, Check, StepName } from '@/ai/types'
import type { LineTransition, RequestTransition } from '@/domain/applyEvent'
import type {
  CheckStatus,
  CommercialStatus,
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
  RequestStatus,
} from '@/domain/types'

export type RequestInsert = Omit<Request, 'id' | 'created_at'>
export type RequestPatch = Partial<Pick<Request, 'title' | 'source_text' | 'open_questions' | 'stated_date' | 'requested_delivery_date' | 'delivery_hint' | 'owner' | 'received_at'>>

export type LineInsert = Omit<Line, 'id' | 'created_at'>
/** Editable fields. Status fields are not here on purpose. */
export type LinePatch = Partial<Pick<Line, 'family' | 'size' | 'material' | 'length_mm' | 'quantity' | 'notes' | 'cost_estimate' | 'unit_price' | 'price_memo' | 'reference_ids'>>

export type QuotationInsert = Omit<Quotation, 'id' | 'created_at'>
export type QuotationPatch = Partial<Pick<Quotation, 'status' | 'valid_until' | 'cover_text' | 'sent_at'>>

export type QuotationLineInsert = Omit<QuotationLine, 'id' | 'created_at'>

export type ResponseInsert = Omit<CustomerResponse, 'id' | 'created_at'>
export type ResponsePatch = Partial<Pick<CustomerResponse, 'interpretation' | 'approved_by' | 'approved_at' | 'applied'>>

export type CheckInsert = Omit<FeasibilityCheck, 'id' | 'created_at'>
export type CheckPatch = Partial<Pick<FeasibilityCheck, 'status' | 'decided_by' | 'decided_at' | 'notes' | 'alternative'>>

export type OrderInsert = Omit<Order, 'id' | 'created_at'>

/** One row of the requests list. Spec screen 0. */
export type RequestSummary = {
  request: Request
  customer_name: string
  line_count: number
  ready_count: number
  open_count: number
  latest_revision: { revision_no: number; status: Quotation['status'] } | null
}

/** One row of the Operations queue. Spec screen 4. */
export type CheckQueueItem = {
  check: FeasibilityCheck
  line: Line
  request: Request
  customer_name: string
}

/** A snapshot line of a sent revision with the context the reference pool needs. */
export type SentQuotationLine = {
  quotation_line: QuotationLine
  commercial_status: CommercialStatus
  customer_name: string
  request_ref: string
  revision_no: number
  sent_at: string
}

/** One traced AI call. Spec 2.1 AiRun. Written by the AI functions (full stack) or the static demo. */
export type AiRunRecord = {
  id: string
  step: StepName
  mode: AiMode
  model: string
  request_id: string | null
  line_id: string | null
  input: unknown
  raw_output: string | null
  output: unknown
  checks: Check[]
  latency_ms: number
  tokens_in: number | null
  tokens_out: number | null
  accepted: boolean | null
  edited: boolean | null
  created_at: string
}

export interface Repo {
  // Reference data
  listCustomers(): Promise<Customer[]>
  getCustomer(id: string): Promise<Customer | null>
  listRules(): Promise<FeasibilityRule[]>
  listLegacyQuotes(): Promise<LegacyQuote[]>
  listSentQuotationLines(): Promise<SentQuotationLine[]>

  // Requests
  listRequestSummaries(): Promise<RequestSummary[]>
  getRequest(id: string): Promise<Request | null>
  insertRequest(row: RequestInsert): Promise<Request>
  updateRequest(id: string, patch: RequestPatch): Promise<Request>
  countRequestsInYear(year: number): Promise<number>
  commitRequestTransition(t: RequestTransition): Promise<Request>

  // Lines
  listLines(request_id: string): Promise<Line[]>
  getLine(id: string): Promise<Line | null>
  insertLine(row: LineInsert): Promise<Line>
  updateLine(id: string, patch: LinePatch): Promise<Line>
  commitLineTransition(t: LineTransition): Promise<Line>

  // Quotations
  listQuotations(request_id: string): Promise<Quotation[]>
  getQuotation(id: string): Promise<Quotation | null>
  insertQuotation(row: QuotationInsert): Promise<Quotation>
  updateQuotation(id: string, patch: QuotationPatch): Promise<Quotation>
  listQuotationLines(quotation_id: string): Promise<QuotationLine[]>
  insertQuotationLines(rows: QuotationLineInsert[]): Promise<QuotationLine[]>

  // Customer responses
  listResponses(quotation_id: string): Promise<CustomerResponse[]>
  getResponse(id: string): Promise<CustomerResponse | null>
  insertResponse(row: ResponseInsert): Promise<CustomerResponse>
  updateResponse(id: string, patch: ResponsePatch): Promise<CustomerResponse>

  // Feasibility checks
  listChecks(filter: { line_id?: string; status?: CheckStatus[] }): Promise<FeasibilityCheck[]>
  listCheckQueue(status: CheckStatus[]): Promise<CheckQueueItem[]>
  getCheck(id: string): Promise<FeasibilityCheck | null>
  insertCheck(row: CheckInsert): Promise<FeasibilityCheck>
  updateCheck(id: string, patch: CheckPatch): Promise<FeasibilityCheck>

  // Orders
  getOrder(id: string): Promise<Order | null>
  getOrderByRequest(request_id: string): Promise<Order | null>
  insertOrder(row: OrderInsert): Promise<Order>
  countOrdersInYear(year: number): Promise<number>

  // Events
  appendEvents(events: EventRecord[]): Promise<Event[]>
  listEvents(request_id: string): Promise<Event[]>
  countEvents(type: EventType): Promise<number>

  // AI traces (read only here: the runs are written next to the model call)
  getAiRun(id: string): Promise<AiRunRecord | null>
  /** Newest first. */
  listAiRuns(filter: { step?: StepName; limit: number }): Promise<AiRunRecord[]>
}

export type { RequestStatus }
