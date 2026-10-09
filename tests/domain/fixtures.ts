import type { Actor, Line, Quotation, Request } from '@/domain/types'

export const SALES: Actor = { role: 'sales', name: 'Marta Keller' }
export const OPS: Actor = { role: 'ops', name: 'Jonas Weber' }
export const SALES_LEAD: Actor = { role: 'sales_lead', name: 'Lead' }

export const TODAY = '2026-09-22'

export function line(overrides: Partial<Line> = {}): Line {
  return {
    id: 'line-1',
    request_id: 'req-1',
    line_no: 1,
    family: 'HEA',
    size: 200,
    material: 'S355',
    length_mm: 12000,
    quantity: 120,
    notes: '',
    commercial_status: 'draft',
    technical_status: 'not_required',
    alternative_of_line_id: null,
    cost_estimate: 60000,
    unit_price: 625,
    price_memo: null,
    reference_ids: [],
    agreed_in_quotation_id: null,
    created_at: '2026-09-01T09:00:00Z',
    ...overrides,
  }
}

export function request(overrides: Partial<Request> = {}): Request {
  return {
    id: 'req-1',
    ref: 'R-2026-0143',
    customer_id: 'cust-1',
    title: 'Linz warehouse extension',
    source_text: '',
    open_questions: [],
    stated_date: null,
    requested_delivery_date: null,
    delivery_hint: null,
    status: 'open',
    hold_reason: null,
    owner: 'Marta Keller',
    received_at: '2026-09-01T09:00:00Z',
    order_id: null,
    created_at: '2026-09-01T09:00:00Z',
    ...overrides,
  }
}

export function quotation(overrides: Partial<Quotation> = {}): Quotation {
  return {
    id: 'quo-1',
    request_id: 'req-1',
    revision_no: 1,
    status: 'sent',
    valid_until: '2026-10-15',
    cover_text: null,
    sent_at: '2026-09-15T09:00:00Z',
    created_at: '2026-09-15T09:00:00Z',
    ...overrides,
  }
}
