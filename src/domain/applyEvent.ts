// applyEvent(state, event, actorRole): the only way a status changes. Spec 2.3.
// Looks up the row in transitions.ts, runs the guard, returns the new state and the
// timeline events to append. Unknown rows throw IllegalTransition.

import { computeReadiness } from './readiness'
import {
  rowsFor,
  trackOf,
  type ChangeClassification,
  type TransitionName,
  type TransitionRow,
} from './transitions'
import type {
  Actor,
  Alternative,
  EventPayload,
  EventRecord,
  EventType,
  Line,
  LineChanges,
  Quotation,
  Request,
  RuleHit,
} from './types'

export type IllegalTransitionCode = 'no_row' | 'guard' | 'role' | 'track'

export class IllegalTransition extends Error {
  readonly code: IllegalTransitionCode
  readonly event: string
  readonly from: string

  constructor(code: IllegalTransitionCode, event: string, from: string, message: string) {
    super(message)
    this.name = 'IllegalTransition'
    this.code = code
    this.event = event
    this.from = from
  }
}

// Events carry their payload. The name selects the row.

export type LineEvent =
  | { name: 'quote'; quotation_id: string; revision_no: number; included_line_ids: string[] }
  | { name: 'customer_accept'; quotation_id: string; revision_no: number }
  | { name: 'customer_change'; quotation_id: string; revision_no: number; changes: Partial<LineChanges> }
  | { name: 'customer_reject'; quotation_id: string; revision_no: number; reason?: string }
  | { name: 'withdraw'; reason: string }
  | { name: 'reopen_line'; request_status: Request['status'] }
  | { name: 'supersede'; alternative_line_id: string }
  | { name: 'change_after_acceptance'; classification: ChangeClassification; description: string }
  | { name: 'request_check'; reason?: string; rule_hits: RuleHit[]; check_id?: string }
  | { name: 'feasible'; notes: string; check_id: string }
  | { name: 'not_feasible'; notes: string; check_id: string }
  | { name: 'propose_alternative'; alternative: Alternative; alternative_line_id: string; check_id?: string }
  | { name: 'waive_check'; reason: string; check_id: string }

export type RequestEvent =
  | { name: 'hold'; reason: string }
  | { name: 'reopen' }
  | { name: 'reject_request'; reason: string }
  | { name: 'convert'; order_id: string; order_ref: string }

export type DomainEvent = LineEvent | RequestEvent

export type ApplyOptions = {
  /** Override (P1): skip the guard and the role check. Needs a reason. Logged as an override. */
  force?: boolean
  reason?: string
  /** ISO date for guards that look at validity. Defaults to today. */
  today?: string
}

export type RequestAggregate = { request: Request; lines: Line[]; quotations: Quotation[] }

export type LineTransition = { line: Line; events: EventRecord[]; row: TransitionRow }
export type RequestTransition = { request: Request; events: EventRecord[]; row: TransitionRow }

type GuardContext = {
  line: Line | null
  aggregate: RequestAggregate | null
  payload: EventPayload
  today: string
}

type Guard = (ctx: GuardContext) => string | null

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

const GUARDS: Partial<Record<TransitionName, Guard>> = {
  quote: ({ line, payload }) => {
    const ids = payload.included_line_ids
    return Array.isArray(ids) && line && ids.includes(line.id) ? null : 'The line is not in the revision that is sent.'
  },
  customer_change: ({ payload }) => {
    const changes = payload.changes
    if (!changes || typeof changes !== 'object') return 'The change decision has no change.'
    const some = Object.values(changes as Record<string, unknown>).some((v) => v !== null && v !== undefined)
    return some ? null : 'The change decision has no change.'
  },
  withdraw: ({ payload }) => (nonEmpty(payload.reason) ? null : 'A reason is needed to withdraw a line.'),
  reopen_line: ({ payload }) => (payload.request_status === 'open' ? null : 'The request is not open.'),
  supersede: ({ payload }) => (nonEmpty(payload.alternative_line_id) ? null : 'An alternative line is needed.'),
  request_check: ({ payload }) => {
    const hits = payload.rule_hits
    const hasHit = Array.isArray(hits) && hits.length > 0
    return hasHit || nonEmpty(payload.reason) ? null : 'A reason or a rule hit is needed to request a check.'
  },
  feasible: ({ payload }) => (nonEmpty(payload.notes) ? null : 'Notes are needed for a decision.'),
  not_feasible: ({ payload }) => (nonEmpty(payload.notes) ? null : 'Notes are needed for a decision.'),
  propose_alternative: ({ payload }) => {
    const alt = payload.alternative as Partial<Alternative> | undefined
    const ok =
      alt &&
      typeof alt.family === 'string' &&
      typeof alt.material === 'string' &&
      typeof alt.size === 'number' &&
      typeof alt.length_mm === 'number' &&
      alt.length_mm > 0 &&
      typeof alt.quantity === 'number' &&
      alt.quantity > 0
    if (!ok) return 'A complete alternative configuration is needed.'
    return nonEmpty(payload.alternative_line_id) ? null : 'The alternative line must exist.'
  },
  waive_check: ({ payload }) => (nonEmpty(payload.reason) ? null : 'A reason is needed to waive a check.'),
  hold: ({ payload }) => (nonEmpty(payload.reason) ? null : 'A reason is needed to put a request on hold.'),
  reject_request: ({ payload }) => (nonEmpty(payload.reason) ? null : 'A reason is needed to reject a request.'),
  convert: ({ aggregate, today }) => {
    if (!aggregate) return 'No request state.'
    const r = computeReadiness(aggregate.lines, aggregate.quotations, today)
    return r.ready ? null : r.blockers.join(' ')
  },
}

function currentState(state: Line | RequestAggregate, track: ReturnType<typeof trackOf>): string {
  if ('line_no' in state) {
    return track === 'commercial' ? state.commercial_status : state.technical_status
  }
  return state.request.status
}

function isLine(state: Line | RequestAggregate): state is Line {
  return 'line_no' in state
}

export function applyEvent(state: Line, event: LineEvent, actor: Actor, options?: ApplyOptions): LineTransition
export function applyEvent(state: RequestAggregate, event: RequestEvent, actor: Actor, options?: ApplyOptions): RequestTransition
export function applyEvent(
  state: Line | RequestAggregate,
  event: DomainEvent,
  actor: Actor,
  options: ApplyOptions = {},
): LineTransition | RequestTransition {
  const { name, ...rest } = event
  const payload = rest as EventPayload
  const track = trackOf(name)
  const lineState = isLine(state)

  if (lineState === (track === 'request')) {
    throw new IllegalTransition('track', name, '-', `Event '${name}' does not apply to this object.`)
  }

  const from = currentState(state, track)
  const matchingRows = rowsFor(name, payload)
  let row = matchingRows.find((r) => (r.from as string[]).includes(from))

  if (!row) {
    const first = matchingRows[0]
    if (options.force && first) {
      row = first
    } else {
      throw new IllegalTransition('no_row', name, from, `No transition '${name}' from '${from}'.`)
    }
  }

  if (options.force) {
    if (!nonEmpty(options.reason)) {
      throw new IllegalTransition('guard', name, from, 'A forced transition needs a reason.')
    }
  } else {
    if (!row.roles.includes(actor.role)) {
      throw new IllegalTransition('role', name, from, `Role '${actor.role}' cannot apply '${name}'. Allowed: ${row.roles.join(', ')}.`)
    }
    const guard = GUARDS[name]
    const problem = guard
      ? guard({
          line: lineState ? state : null,
          aggregate: lineState ? null : state,
          payload,
          today: options.today ?? new Date().toISOString().slice(0, 10),
        })
      : null
    if (problem) {
      throw new IllegalTransition('guard', name, from, problem)
    }
  }

  const basePayload: EventPayload = {
    transition: name,
    track,
    from,
    to: row.to,
    ...payload,
    ...(options.force ? { forced: true, reason: options.reason } : {}),
  }

  const request_id = lineState ? state.request_id : state.request.id
  const line_id = lineState ? state.id : null

  const mainType: EventType = options.force ? 'override' : row.eventType
  const events: EventRecord[] = [
    { request_id, line_id, actor_role: actor.role, actor_name: actor.name, type: mainType, payload: basePayload },
  ]
  if (!options.force) {
    for (const extra of row.extraEventTypes ?? []) {
      events.push({ request_id, line_id, actor_role: actor.role, actor_name: actor.name, type: extra, payload: basePayload })
    }
  }

  if (lineState) {
    const next: Line = { ...state }
    if (row.track === 'commercial') {
      next.commercial_status = row.to
      if (name === 'customer_accept' && typeof payload.quotation_id === 'string') {
        next.agreed_in_quotation_id = payload.quotation_id
      }
    } else if (row.track === 'technical') {
      next.technical_status = row.to
    }
    return { line: next, events, row }
  }

  const next: Request = { ...state.request }
  if (row.track === 'request') {
    next.status = row.to
    if (name === 'hold' && typeof payload.reason === 'string') next.hold_reason = payload.reason
    if (name === 'reopen') next.hold_reason = null
    if (name === 'convert' && typeof payload.order_id === 'string') next.order_id = payload.order_id
  }
  return { request: next, events, row }
}
