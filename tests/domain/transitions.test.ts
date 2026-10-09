import { describe, expect, it } from 'vitest'
import { applyEvent, IllegalTransition } from '@/domain/applyEvent'
import { COMMERCIAL_ROWS, REQUEST_ROWS, TECHNICAL_ROWS, TRANSITION_ROWS } from '@/domain/transitions'
import { line, OPS, quotation, request, SALES, SALES_LEAD, TODAY } from './fixtures'

const R1 = { quotation_id: 'quo-1', revision_no: 1 }

describe('transition table', () => {
  it('has 24 rows: 14 commercial, 5 technical, 5 request', () => {
    expect(COMMERCIAL_ROWS).toHaveLength(14)
    expect(TECHNICAL_ROWS).toHaveLength(5)
    expect(REQUEST_ROWS).toHaveLength(5)
    expect(TRANSITION_ROWS).toHaveLength(24)
  })
})

describe('commercial track, one test per row', () => {
  it('draft --quote--> quoted when the line is in the sent revision', () => {
    const r = applyEvent(line(), { name: 'quote', ...R1, included_line_ids: ['line-1'] }, SALES)
    expect(r.line.commercial_status).toBe('quoted')
    expect(r.events[0]?.type).toBe('revision_sent')
    expect(r.events[0]?.payload).toMatchObject({ transition: 'quote', from: 'draft', to: 'quoted' })
  })

  it('quoted --customer_accept--> agreed and records the revision', () => {
    const r = applyEvent(line({ commercial_status: 'quoted' }), { name: 'customer_accept', ...R1 }, SALES)
    expect(r.line.commercial_status).toBe('agreed')
    expect(r.line.agreed_in_quotation_id).toBe('quo-1')
    expect(r.events[0]?.type).toBe('decision_applied')
  })

  it('quoted --customer_change--> negotiating when the payload has a change', () => {
    const r = applyEvent(line({ commercial_status: 'quoted' }), { name: 'customer_change', ...R1, changes: { quantity: 60 } }, SALES)
    expect(r.line.commercial_status).toBe('negotiating')
  })

  it('quoted --customer_reject--> declined', () => {
    const r = applyEvent(line({ commercial_status: 'quoted' }), { name: 'customer_reject', ...R1 }, SALES)
    expect(r.line.commercial_status).toBe('declined')
  })

  it('quoted --quote--> quoted re-quotes an undecided line in a new revision', () => {
    const r = applyEvent(line({ commercial_status: 'quoted' }), { name: 'quote', quotation_id: 'quo-2', revision_no: 2, included_line_ids: ['line-1'] }, SALES)
    expect(r.line.commercial_status).toBe('quoted')
    expect(r.events[0]?.payload).toMatchObject({ from: 'quoted', to: 'quoted', revision_no: 2 })
  })

  it('negotiating --quote--> quoted when a new revision is sent', () => {
    const r = applyEvent(line({ commercial_status: 'negotiating' }), { name: 'quote', quotation_id: 'quo-2', revision_no: 2, included_line_ids: ['line-1'] }, SALES)
    expect(r.line.commercial_status).toBe('quoted')
  })

  it('negotiating --customer_accept--> agreed as last quoted', () => {
    const r = applyEvent(line({ commercial_status: 'negotiating' }), { name: 'customer_accept', ...R1 }, SALES)
    expect(r.line.commercial_status).toBe('agreed')
  })

  it('negotiating --customer_reject--> declined', () => {
    const r = applyEvent(line({ commercial_status: 'negotiating' }), { name: 'customer_reject', ...R1 }, SALES)
    expect(r.line.commercial_status).toBe('declined')
  })

  it('draft, quoted, negotiating --withdraw--> withdrawn with a reason', () => {
    for (const from of ['draft', 'quoted', 'negotiating'] as const) {
      const r = applyEvent(line({ commercial_status: from }), { name: 'withdraw', reason: 'Customer no longer needs it' }, SALES)
      expect(r.line.commercial_status).toBe('withdrawn')
      expect(r.events[0]?.type).toBe('line_withdrawn')
    }
  })

  it('declined --reopen_line--> draft when the request is open', () => {
    const r = applyEvent(line({ commercial_status: 'declined' }), { name: 'reopen_line', request_status: 'open' }, SALES)
    expect(r.line.commercial_status).toBe('draft')
    expect(r.events[0]?.type).toBe('line_reopened')
  })

  it('any open state --supersede--> superseded when an alternative exists, by ops or sales', () => {
    for (const from of ['draft', 'quoted', 'negotiating', 'agreed'] as const) {
      const r = applyEvent(line({ commercial_status: from }), { name: 'supersede', alternative_line_id: 'line-3' }, OPS)
      expect(r.line.commercial_status).toBe('superseded')
    }
    const bySales = applyEvent(line({ commercial_status: 'quoted' }), { name: 'supersede', alternative_line_id: 'line-3' }, SALES)
    expect(bySales.line.commercial_status).toBe('superseded')
  })

  it('agreed --change_after_acceptance (within_agreement)--> agreed (P2 row)', () => {
    const r = applyEvent(line({ commercial_status: 'agreed' }), { name: 'change_after_acceptance', classification: 'within_agreement', description: '+5 pieces' }, SALES)
    expect(r.line.commercial_status).toBe('agreed')
    expect(r.events).toHaveLength(1)
  })

  it('agreed --change_after_acceptance (new_quotation_required)--> negotiating (P2 row)', () => {
    const r = applyEvent(line({ commercial_status: 'agreed' }), { name: 'change_after_acceptance', classification: 'new_quotation_required', description: 'new material' }, SALES)
    expect(r.line.commercial_status).toBe('negotiating')
  })

  it('agreed --change_after_acceptance (approval_required)--> agreed plus an override event, by a sales lead (P2 row)', () => {
    const r = applyEvent(line({ commercial_status: 'agreed' }), { name: 'change_after_acceptance', classification: 'approval_required', description: '+15 percent' }, SALES_LEAD)
    expect(r.line.commercial_status).toBe('agreed')
    expect(r.events.map((e) => e.type)).toEqual(['decision_applied', 'override'])
  })
})

describe('technical track, one test per row', () => {
  it('not_required, feasible --request_check--> pending with a reason or a rule hit', () => {
    const byHit = applyEvent(line(), { name: 'request_check', rule_hits: [{ rule_id: 'F1a', note: 'S460 in this size rolls to 12 m maximum.' }] }, SALES)
    expect(byHit.line.technical_status).toBe('pending')
    expect(byHit.events[0]?.type).toBe('check_requested')
    const byReason = applyEvent(line({ technical_status: 'feasible' }), { name: 'request_check', reason: 'Customer changed the length', rule_hits: [] }, OPS)
    expect(byReason.line.technical_status).toBe('pending')
  })

  it('pending --feasible--> feasible with notes', () => {
    const r = applyEvent(line({ technical_status: 'pending' }), { name: 'feasible', notes: 'Standard rolling.', check_id: 'chk-1' }, OPS)
    expect(r.line.technical_status).toBe('feasible')
    expect(r.events[0]?.type).toBe('check_decided')
  })

  it('pending --not_feasible--> not_feasible with notes', () => {
    const r = applyEvent(line({ technical_status: 'pending' }), { name: 'not_feasible', notes: '14 m in S460 is not producible.', check_id: 'chk-1' }, OPS)
    expect(r.line.technical_status).toBe('not_feasible')
  })

  it('not_feasible --propose_alternative--> not_feasible on this line, with the alternative recorded', () => {
    const alt = { family: 'HEA' as const, size: 260, material: 'S355' as const, length_mm: 14000, quantity: 100, notes: 'Equivalent capacity.' }
    const r = applyEvent(line({ technical_status: 'not_feasible' }), { name: 'propose_alternative', alternative: alt, alternative_line_id: 'line-3' }, OPS)
    expect(r.line.technical_status).toBe('not_feasible')
    expect(r.events[0]?.type).toBe('alternative_proposed')
    expect(r.events[0]?.payload).toMatchObject({ alternative_line_id: 'line-3' })
  })

  it('pending --waive_check--> not_required with a reason, logged as an override', () => {
    const r = applyEvent(line({ technical_status: 'pending' }), { name: 'waive_check', reason: 'Known configuration from last year.', check_id: 'chk-1' }, OPS)
    expect(r.line.technical_status).toBe('not_required')
    expect(r.events.map((e) => e.type)).toEqual(['check_waived', 'override'])
  })
})

describe('request status, one test per row', () => {
  const agg = (status: 'open' | 'on_hold' | 'rejected' | 'converted') => ({ request: request({ status }), lines: [], quotations: [] })

  it('open --hold--> on_hold with a reason', () => {
    const r = applyEvent(agg('open'), { name: 'hold', reason: 'Customer paused the project.' }, SALES)
    expect(r.request.status).toBe('on_hold')
    expect(r.request.hold_reason).toBe('Customer paused the project.')
    expect(r.events[0]?.type).toBe('request_held')
  })

  it('on_hold --reopen--> open', () => {
    const r = applyEvent(agg('on_hold'), { name: 'reopen' }, SALES)
    expect(r.request.status).toBe('open')
    expect(r.request.hold_reason).toBeNull()
  })

  it('open --reject_request--> rejected with a reason', () => {
    const r = applyEvent(agg('open'), { name: 'reject_request', reason: 'Out of our range.' }, SALES)
    expect(r.request.status).toBe('rejected')
    expect(r.events[0]?.type).toBe('request_rejected')
  })

  it('rejected --reopen--> open', () => {
    const r = applyEvent(agg('rejected'), { name: 'reopen' }, SALES)
    expect(r.request.status).toBe('open')
  })

  it('open --convert--> converted when the conversion guard passes', () => {
    const state = {
      request: request(),
      lines: [line({ commercial_status: 'agreed', agreed_in_quotation_id: 'quo-1' })],
      quotations: [quotation()],
    }
    const r = applyEvent(state, { name: 'convert', order_id: 'ord-1', order_ref: 'O-2026-0088' }, SALES, { today: TODAY })
    expect(r.request.status).toBe('converted')
    expect(r.request.order_id).toBe('ord-1')
    expect(r.events[0]?.type).toBe('order_created')
  })
})

describe('illegal transitions of note', () => {
  it('agreed --quote is not a row', () => {
    expect(() => applyEvent(line({ commercial_status: 'agreed' }), { name: 'quote', ...R1, included_line_ids: ['line-1'] }, SALES)).toThrow(IllegalTransition)
  })

  it('draft --customer_accept is not a row', () => {
    expect(() => applyEvent(line(), { name: 'customer_accept', ...R1 }, SALES)).toThrowError(/No transition 'customer_accept' from 'draft'/)
  })

  it('quote fails the guard when the line is not in the sent revision', () => {
    expect(() => applyEvent(line(), { name: 'quote', ...R1, included_line_ids: ['other'] }, SALES)).toThrowError(/not in the revision/)
  })

  it('customer_change without a change fails the guard', () => {
    expect(() => applyEvent(line({ commercial_status: 'quoted' }), { name: 'customer_change', ...R1, changes: { quantity: null } }, SALES)).toThrowError(/no change/)
  })

  it('withdraw without a reason fails the guard', () => {
    expect(() => applyEvent(line(), { name: 'withdraw', reason: '  ' }, SALES)).toThrowError(/reason/)
  })

  it('reopen_line fails when the request is on hold', () => {
    expect(() => applyEvent(line({ commercial_status: 'declined' }), { name: 'reopen_line', request_status: 'on_hold' }, SALES)).toThrowError(/not open/)
  })

  it('a decided check cannot be decided again (feasible --feasible)', () => {
    expect(() => applyEvent(line({ technical_status: 'feasible' }), { name: 'feasible', notes: 'x', check_id: 'c' }, OPS)).toThrow(IllegalTransition)
  })

  it('sales cannot decide a check', () => {
    try {
      applyEvent(line({ technical_status: 'pending' }), { name: 'feasible', notes: 'ok', check_id: 'c' }, SALES)
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalTransition)
      expect((e as IllegalTransition).code).toBe('role')
    }
  })

  it('convert fails while an open line is pending a check', () => {
    const state = {
      request: request(),
      lines: [
        line({ commercial_status: 'agreed' }),
        line({ id: 'line-2', line_no: 2, commercial_status: 'agreed', technical_status: 'pending' }),
      ],
      quotations: [quotation()],
    }
    expect(() => applyEvent(state, { name: 'convert', order_id: 'o', order_ref: 'O-2026-0088' }, SALES, { today: TODAY })).toThrowError(/waiting for feasibility: L2/)
  })

  it('convert fails while an open line is not agreed', () => {
    const state = { request: request(), lines: [line({ commercial_status: 'quoted' })], quotations: [quotation()] }
    expect(() => applyEvent(state, { name: 'convert', order_id: 'o', order_ref: 'O-2026-0088' }, SALES, { today: TODAY })).toThrowError(/not agreed: L1/)
  })

  it('convert fails when the latest sent revision is expired', () => {
    const state = { request: request(), lines: [line({ commercial_status: 'agreed' })], quotations: [quotation({ valid_until: '2026-09-01' })] }
    expect(() => applyEvent(state, { name: 'convert', order_id: 'o', order_ref: 'O-2026-0088' }, SALES, { today: TODAY })).toThrowError(/expired on 2026-09-01/)
  })

  it('convert fails with no open line', () => {
    const state = { request: request(), lines: [line({ commercial_status: 'withdrawn' })], quotations: [quotation()] }
    expect(() => applyEvent(state, { name: 'convert', order_id: 'o', order_ref: 'O-2026-0088' }, SALES, { today: TODAY })).toThrowError(/no open line/)
  })

  it('a line event does not apply to a request and the reverse', () => {
    expect(() => applyEvent({ request: request(), lines: [], quotations: [] }, { name: 'withdraw', reason: 'x' } as never, SALES)).toThrow(IllegalTransition)
    expect(() => applyEvent(line(), { name: 'hold', reason: 'x' } as never, SALES)).toThrow(IllegalTransition)
  })
})

describe('override (force)', () => {
  it('forces a transition with a reason and logs it as an override', () => {
    const r = applyEvent(line({ technical_status: 'pending' }), { name: 'feasible', notes: '', check_id: 'c' }, SALES, { force: true, reason: 'Plant manager confirmed by phone.' })
    expect(r.line.technical_status).toBe('feasible')
    expect(r.events).toHaveLength(1)
    expect(r.events[0]?.type).toBe('override')
    expect(r.events[0]?.payload).toMatchObject({ forced: true, reason: 'Plant manager confirmed by phone.', transition: 'feasible' })
  })

  it('refuses a forced transition without a reason', () => {
    expect(() => applyEvent(line(), { name: 'customer_accept', ...R1 }, SALES, { force: true })).toThrowError(/needs a reason/)
  })

  it('forces a row from a state that has no row, taking the target of the event', () => {
    const r = applyEvent(line(), { name: 'customer_accept', ...R1 }, SALES, { force: true, reason: 'Verbal agreement before the offer.' })
    expect(r.line.commercial_status).toBe('agreed')
  })
})
