// The transition table as data. Spec section 2.3.
// applyEvent() looks up a row here, runs the guard from applyEvent.ts and returns the new state.
// The design pages render this table. Adding an exception is one row here and one test.

import type { CommercialStatus, EventType, RequestStatus, Role, TechnicalStatus } from './types'

export type CommercialEventName =
  | 'quote'
  | 'customer_accept'
  | 'customer_change'
  | 'customer_reject'
  | 'withdraw'
  | 'reopen_line'
  | 'supersede'
  | 'change_after_acceptance'

export type TechnicalEventName = 'request_check' | 'feasible' | 'not_feasible' | 'propose_alternative' | 'waive_check'

export type RequestEventName = 'hold' | 'reopen' | 'reject_request' | 'convert'

export type TransitionName = CommercialEventName | TechnicalEventName | RequestEventName

export type Track = 'commercial' | 'technical' | 'request'

export type ChangeClassification = 'within_agreement' | 'new_quotation_required' | 'approval_required'

type BaseRow = {
  /** Guard text for the design pages. The code guard lives in applyEvent.ts under the same event name. */
  guard: string
  roles: Role[]
  /** Timeline event type written when the row applies. */
  eventType: EventType
  /** Extra timeline events written with the main one. */
  extraEventTypes?: EventType[]
  /** The row applies only when the payload has these values. Used for classification rows. */
  when?: Record<string, string>
  /** Out of scope for the prototype UI. The row exists in the model. */
  p2?: boolean
}

export type CommercialRow = BaseRow & {
  track: 'commercial'
  from: CommercialStatus[]
  event: CommercialEventName
  to: CommercialStatus
}

export type TechnicalRow = BaseRow & {
  track: 'technical'
  from: TechnicalStatus[]
  event: TechnicalEventName
  to: TechnicalStatus
}

export type RequestRow = BaseRow & {
  track: 'request'
  from: RequestStatus[]
  event: RequestEventName
  to: RequestStatus
}

export type TransitionRow = CommercialRow | TechnicalRow | RequestRow

export const OPEN_COMMERCIAL_STATES: CommercialStatus[] = ['draft', 'quoted', 'negotiating', 'agreed']

export const COMMERCIAL_ROWS: readonly CommercialRow[] = [
  { track: 'commercial', from: ['draft'], event: 'quote', to: 'quoted', guard: 'Line is in the revision that is sent.', roles: ['sales'], eventType: 'revision_sent' },
  { track: 'commercial', from: ['quoted'], event: 'customer_accept', to: 'agreed', guard: '—', roles: ['sales'], eventType: 'decision_applied' },
  { track: 'commercial', from: ['quoted'], event: 'customer_change', to: 'negotiating', guard: 'Payload has a change.', roles: ['sales'], eventType: 'decision_applied' },
  { track: 'commercial', from: ['quoted'], event: 'customer_reject', to: 'declined', guard: '—', roles: ['sales'], eventType: 'decision_applied' },
  { track: 'commercial', from: ['quoted'], event: 'quote', to: 'quoted', guard: 'The line is in the newly sent revision (re-quote of an undecided line).', roles: ['sales'], eventType: 'revision_sent' },
  { track: 'commercial', from: ['negotiating'], event: 'quote', to: 'quoted', guard: 'A new revision is sent.', roles: ['sales'], eventType: 'revision_sent' },
  { track: 'commercial', from: ['negotiating'], event: 'customer_accept', to: 'agreed', guard: 'Accepted as last quoted.', roles: ['sales'], eventType: 'decision_applied' },
  { track: 'commercial', from: ['negotiating'], event: 'customer_reject', to: 'declined', guard: '—', roles: ['sales'], eventType: 'decision_applied' },
  { track: 'commercial', from: ['draft', 'quoted', 'negotiating'], event: 'withdraw', to: 'withdrawn', guard: 'Reason given.', roles: ['sales'], eventType: 'line_withdrawn' },
  { track: 'commercial', from: ['declined'], event: 'reopen_line', to: 'draft', guard: 'Request is open.', roles: ['sales'], eventType: 'line_reopened' },
  { track: 'commercial', from: OPEN_COMMERCIAL_STATES, event: 'supersede', to: 'superseded', guard: 'An alternative line exists.', roles: ['ops', 'sales'], eventType: 'line_changed' },
  { track: 'commercial', from: ['agreed'], event: 'change_after_acceptance', to: 'agreed', guard: 'Guard selects the row: classification = within_agreement (P2).', roles: ['sales'], eventType: 'decision_applied', when: { classification: 'within_agreement' }, p2: true },
  { track: 'commercial', from: ['agreed'], event: 'change_after_acceptance', to: 'negotiating', guard: 'Guard selects the row: classification = new_quotation_required (P2).', roles: ['sales'], eventType: 'decision_applied', when: { classification: 'new_quotation_required' }, p2: true },
  { track: 'commercial', from: ['agreed'], event: 'change_after_acceptance', to: 'agreed', guard: 'Guard selects the row: classification = approval_required (P2). Writes an approval_required override event.', roles: ['sales_lead'], eventType: 'decision_applied', extraEventTypes: ['override'], when: { classification: 'approval_required' }, p2: true },
]

export const TECHNICAL_ROWS: readonly TechnicalRow[] = [
  { track: 'technical', from: ['not_required', 'feasible'], event: 'request_check', to: 'pending', guard: 'Reason or rule hit.', roles: ['sales', 'ops'], eventType: 'check_requested' },
  { track: 'technical', from: ['pending'], event: 'feasible', to: 'feasible', guard: 'Notes given.', roles: ['ops'], eventType: 'check_decided' },
  { track: 'technical', from: ['pending'], event: 'not_feasible', to: 'not_feasible', guard: 'Notes given.', roles: ['ops'], eventType: 'check_decided' },
  { track: 'technical', from: ['not_feasible'], event: 'propose_alternative', to: 'not_feasible', guard: 'Alternative configuration given. A new line is created with technical_status = feasible.', roles: ['ops'], eventType: 'alternative_proposed' },
  { track: 'technical', from: ['pending'], event: 'waive_check', to: 'not_required', guard: 'Reason given. Logged as override.', roles: ['ops'], eventType: 'check_waived', extraEventTypes: ['override'] },
]

export const REQUEST_ROWS: readonly RequestRow[] = [
  { track: 'request', from: ['open'], event: 'hold', to: 'on_hold', guard: 'Reason given.', roles: ['sales'], eventType: 'request_held' },
  { track: 'request', from: ['on_hold'], event: 'reopen', to: 'open', guard: '—', roles: ['sales'], eventType: 'request_reopened' },
  { track: 'request', from: ['open'], event: 'reject_request', to: 'rejected', guard: 'Reason given.', roles: ['sales'], eventType: 'request_rejected' },
  { track: 'request', from: ['rejected'], event: 'reopen', to: 'open', guard: '—', roles: ['sales'], eventType: 'request_reopened' },
  { track: 'request', from: ['open'], event: 'convert', to: 'converted', guard: 'Conversion guard: at least one open line, every open line executable, latest sent revision not expired.', roles: ['sales'], eventType: 'order_created' },
]

export const TRANSITION_ROWS: readonly TransitionRow[] = [...COMMERCIAL_ROWS, ...TECHNICAL_ROWS, ...REQUEST_ROWS]

export function trackOf(event: TransitionName): Track {
  if (COMMERCIAL_ROWS.some((r) => r.event === event)) return 'commercial'
  if (TECHNICAL_ROWS.some((r) => r.event === event)) return 'technical'
  return 'request'
}

/** Finds the rows for an event, in table order. Classification rows filter on `when`. */
export function rowsFor(event: TransitionName, payload: Record<string, unknown>): TransitionRow[] {
  return TRANSITION_ROWS.filter((row) => {
    if (row.event !== event) return false
    if (!row.when) return true
    return Object.entries(row.when).every(([k, v]) => payload[k] === v)
  })
}
