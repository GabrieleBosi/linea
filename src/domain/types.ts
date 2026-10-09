// Domain types. Spec section 2. Pure TypeScript, no IO, no framework imports.

export type Family = 'HEA' | 'HEB' | 'IPE'
export const FAMILIES: readonly Family[] = ['HEA', 'HEB', 'IPE'] as const

export type Material = 'S235' | 'S355' | 'S460'
export const MATERIALS: readonly Material[] = ['S235', 'S355', 'S460'] as const

export type CommercialStatus =
  | 'draft'
  | 'quoted'
  | 'negotiating'
  | 'agreed'
  | 'declined'
  | 'withdrawn'
  | 'superseded'

export type TechnicalStatus = 'not_required' | 'pending' | 'feasible' | 'not_feasible'

export type RequestStatus = 'open' | 'on_hold' | 'rejected' | 'converted'

export type QuotationStatus = 'draft' | 'sent' | 'superseded'

export type CheckStatus = 'pending' | 'feasible' | 'not_feasible' | 'waived'

export type Role = 'sales' | 'ops' | 'sales_lead' | 'system' | 'customer'

export type Actor = { role: Role; name: string }

export type Configuration = {
  family: Family
  size: number
  material: Material
  length_mm: number
  quantity: number
}

export type Customer = {
  id: string
  name: string
  segment: string
  country: string
}

export type Request = {
  id: string
  ref: string
  customer_id: string
  title: string
  source_text: string
  open_questions: string[]
  stated_date: string | null
  requested_delivery_date: string | null
  delivery_hint: string | null
  status: RequestStatus
  hold_reason: string | null
  owner: string
  received_at: string
  order_id: string | null
  created_at: string
}

export type Line = Configuration & {
  id: string
  request_id: string
  line_no: number
  notes: string
  commercial_status: CommercialStatus
  technical_status: TechnicalStatus
  alternative_of_line_id: string | null
  cost_estimate: number | null
  unit_price: number | null
  /** The kept price memo (P1). Copied into the snapshot at send time. */
  price_memo: string | null
  reference_ids: string[]
  agreed_in_quotation_id: string | null
  created_at: string
}

export type Quotation = {
  id: string
  request_id: string
  revision_no: number
  status: QuotationStatus
  valid_until: string | null
  cover_text: string | null
  sent_at: string | null
  created_at: string
}

export type QuotationLine = Configuration & {
  id: string
  quotation_id: string
  line_id: string
  line_no: number
  unit_price: number
  total_price: number
  cost_estimate: number
  margin: number
  price_memo: string | null
  reference_ids: string[]
  subject_to_feasibility: boolean
  created_at: string
}

export type DecisionKind = 'accept' | 'change' | 'reject' | 'unclear'

export type LineChanges = {
  quantity: number | null
  length_mm: number | null
  material: Material | null
  size: number | null
  target_unit_price: number | null
}

export type Decision = {
  line_no: number
  decision: DecisionKind
  changes: LineChanges
  source_span: string
  confidence: number
}

export type Interpretation = {
  decisions: Decision[]
  overall: 'accept_all' | 'partial' | 'reject_all' | 'unclear'
  needs_clarification: string[]
}

export type CustomerResponse = {
  id: string
  quotation_id: string
  raw_text: string
  interpretation: Interpretation | null
  approved_by: string | null
  approved_at: string | null
  applied: boolean
  created_at: string
}

export type RuleHit = { rule_id: string; note: string }

export type Alternative = Configuration & { notes: string }

export type FeasibilityCheck = {
  id: string
  line_id: string
  status: CheckStatus
  requested_by: string
  requested_at: string
  decided_by: string | null
  decided_at: string | null
  notes: string | null
  rule_hits: RuleHit[]
  alternative: Alternative | null
  created_at: string
}

export type OrderLine = Configuration & {
  line_id: string
  line_no: number
  unit_price: number
  total_price: number
  cost_estimate: number
  margin: number
  agreed_in_quotation_id: string
  agreed_in_revision_no: number
}

export type Order = {
  id: string
  request_id: string
  order_ref: string
  lines: OrderLine[]
  created_at: string
}

export type EventType =
  | 'request_created'
  | 'line_added'
  | 'line_changed'
  | 'line_withdrawn'
  | 'line_reopened'
  | 'check_requested'
  | 'check_decided'
  | 'check_waived'
  | 'alternative_proposed'
  | 'revision_prepared'
  | 'revision_sent'
  | 'response_recorded'
  | 'decision_applied'
  | 'clarification_needed'
  | 'request_held'
  | 'request_rejected'
  | 'request_reopened'
  | 'order_created'
  | 'override'
  | 'ai_run'

export type EventPayload = Record<string, unknown>

/** An event to append. The repository assigns id and created_at. */
export type EventRecord = {
  request_id: string
  line_id: string | null
  actor_role: Role
  actor_name: string
  type: EventType
  payload: EventPayload
}

export type Event = EventRecord & { id: string; created_at: string }

export type LegacyOutcome = 'WON' | 'LOST'

export type LegacyQuote = {
  quote_id: string
  quote_date: string
  customer: string
  product: string
  material: string
  quantity: number
  production_cost: number
  quoted_price: number
  margin: number
  outcome: LegacyOutcome
  revision: number
  source: 'given' | 'generated'
}

export type CatalogProfile = { family: Family; size: number; kg_per_m: number }

export type CatalogMaterial = { grade: Material; eur_per_kg_base: number }

export type FeasibilityRule = {
  id: string
  family: Family | null
  size_min: number | null
  size_max: number | null
  material: Material | null
  max_length_mm: number | null
  min_quantity: number | null
  not_offered: boolean
  note: string
}

export type AiMode = 'live' | 'replay' | 'revised'

export type Check = { name: string; pass: boolean; detail: string }

export type AiRun = {
  id: string
  step: string
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

// Derived line state. Spec 2.2. Never stored.

export function isExecutable(line: Pick<Line, 'commercial_status' | 'technical_status'>): boolean {
  return (
    line.commercial_status === 'agreed' &&
    (line.technical_status === 'feasible' || line.technical_status === 'not_required')
  )
}

export function isOpen(line: Pick<Line, 'commercial_status'>): boolean {
  return (
    line.commercial_status !== 'declined' &&
    line.commercial_status !== 'withdrawn' &&
    line.commercial_status !== 'superseded'
  )
}

export function configurationOf(line: Configuration): Configuration {
  return {
    family: line.family,
    size: line.size,
    material: line.material,
    length_mm: line.length_mm,
    quantity: line.quantity,
  }
}

export function sameConfiguration(a: Configuration, b: Configuration): boolean {
  return (
    a.family === b.family &&
    a.size === b.size &&
    a.material === b.material &&
    a.length_mm === b.length_mm &&
    a.quantity === b.quantity
  )
}

/** Margin as a fraction of the price. Null when the price or the cost is missing. */
export function marginOf(unit_price: number | null, cost_estimate: number | null, quantity: number): number | null {
  if (unit_price === null || cost_estimate === null || unit_price <= 0 || quantity <= 0) {
    return null
  }
  const total = unit_price * quantity
  return (total - cost_estimate) / total
}
