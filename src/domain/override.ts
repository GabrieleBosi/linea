// Override (P1). Spec 2.3: any row can be forced with `force: true` and a reason; the event
// gets `type = override`. This module lists the events the UI offers for a forced transition
// and builds their payload from the state at hand. No IO.

import type { DomainEvent } from './applyEvent'
import type { FeasibilityCheck, Quotation, Request } from './types'

export type ForceableEventName = 'customer_accept' | 'customer_reject' | 'withdraw' | 'reopen_line' | 'feasible' | 'not_feasible' | 'hold' | 'reject_request' | 'reopen'

export type ForceableEvent = {
  name: ForceableEventName
  target: 'line' | 'request'
  track: 'commercial' | 'technical' | 'request'
  /** The state the event leads to, as the transition table spells it. */
  to: string
  label: string
}

/**
 * The events a person can force from the workspace. Events that create rows on their own
 * (quote, request_check, propose_alternative, supersede, convert) are not here: forcing them
 * would move a status without the row the status refers to.
 */
export const FORCEABLE_EVENTS: readonly ForceableEvent[] = [
  { name: 'customer_accept', target: 'line', track: 'commercial', to: 'agreed', label: 'Agreed (customer accept)' },
  { name: 'customer_reject', target: 'line', track: 'commercial', to: 'declined', label: 'Declined (customer reject)' },
  { name: 'withdraw', target: 'line', track: 'commercial', to: 'withdrawn', label: 'Withdrawn' },
  { name: 'reopen_line', target: 'line', track: 'commercial', to: 'draft', label: 'Back to draft (reopen line)' },
  { name: 'feasible', target: 'line', track: 'technical', to: 'feasible', label: 'Feasible' },
  { name: 'not_feasible', target: 'line', track: 'technical', to: 'not_feasible', label: 'Not feasible' },
  { name: 'hold', target: 'request', track: 'request', to: 'on_hold', label: 'On hold' },
  { name: 'reject_request', target: 'request', track: 'request', to: 'rejected', label: 'Rejected' },
  { name: 'reopen', target: 'request', track: 'request', to: 'open', label: 'Open (reopen)' },
]

export function forceableEvent(name: string): ForceableEvent | undefined {
  return FORCEABLE_EVENTS.find((e) => e.name === name)
}

export type ForcedEventInput = {
  reason: string
  request: Request
  /** The latest sent revision, for the customer decisions. */
  quotation: Quotation | null
  /** The latest check on the line, for the technical decisions. */
  check: FeasibilityCheck | null
}

/** Builds the event a forced transition applies. The reason travels in the payload where the row expects one. */
export function buildForcedEvent(name: ForceableEventName, input: ForcedEventInput): DomainEvent {
  const q = input.quotation
  switch (name) {
    case 'customer_accept':
      return { name, quotation_id: q?.id ?? '', revision_no: q?.revision_no ?? 0 }
    case 'customer_reject':
      return { name, quotation_id: q?.id ?? '', revision_no: q?.revision_no ?? 0, reason: input.reason }
    case 'withdraw':
      return { name, reason: input.reason }
    case 'reopen_line':
      return { name, request_status: input.request.status }
    case 'feasible':
      return { name, notes: input.reason, check_id: input.check?.id ?? '' }
    case 'not_feasible':
      return { name, notes: input.reason, check_id: input.check?.id ?? '' }
    case 'hold':
      return { name, reason: input.reason }
    case 'reject_request':
      return { name, reason: input.reason }
    case 'reopen':
      return { name }
  }
}
