// Scenario A — Ebrecht Fabrication: two lines, partial acceptance, one revision. Spec 7.1.

import { isExecutable, type Interpretation, type Line, type Quotation } from '@/domain/types'
import { applyResponse, convertToOrder, createRequest, lineInsight, loadRequestAggregate, prepareRevision, recordResponse, saveLine, sendRevision } from '@/services'
import { aiOrigin, approveDraft, assertMatches, draftIntake, draftInterpretation } from './ai'
import { assert, assertEqual, stateOf, type Scenario, type ScenarioContext, type ScriptedIntake } from './types'

import { A_REPLY_1, A_REPLY_2, A_SOURCE_TEXT } from './texts'
export { A_REPLY_1, A_REPLY_2, A_SOURCE_TEXT }

/** The scripted extraction. The AI draft in phase 2 is compared against it field by field. */
/** Scenario A's request title. The Data page finds scenario A's request by it. */
export const A_REQUEST_TITLE = 'Linz warehouse extension'

export const A_INTAKE: ScriptedIntake = {
  customer_name_guess: 'Ebrecht Fabrication',
  lines: [
    { family: 'HEA', size: 200, material: 'S355', length_mm: 12000, quantity: 120, notes: 'same as our order from last year', flags: [] },
    { family: 'HEA', size: 220, material: 'S355', length_mm: 10000, quantity: 40, notes: '', flags: [] },
  ],
  open_questions: ['Which order from last year does "same as our order from last year" refer to?'],
  stated_date: null,
  requested_delivery_date: null,
  delivery_hint: 'by the end of November',
}

export const A_DECISIONS_1: Interpretation = {
  decisions: [
    { line_no: 1, decision: 'accept', changes: { quantity: null, length_mm: null, material: null, size: null, target_unit_price: null }, source_span: 'Line 1 (HEA 200) is fine, please go ahead at the quoted price.', confidence: 0.95 },
    { line_no: 2, decision: 'change', changes: { quantity: 60, length_mm: null, material: null, size: null, target_unit_price: null }, source_span: 'For line 2 we now need 60 pieces instead of 40.', confidence: 0.9 },
  ],
  overall: 'partial',
  needs_clarification: [],
}

export const A_DECISIONS_2: Interpretation = {
  decisions: [{ line_no: 2, decision: 'accept', changes: { quantity: null, length_mm: null, material: null, size: null, target_unit_price: null }, source_span: 'Line 2 at 60 pieces is accepted at the revised price.', confidence: 0.95 }],
  overall: 'accept_all',
  needs_clarification: [],
}

async function lines(ctx: ScenarioContext): Promise<Line[]> {
  return ctx.repo.listLines(stateOf<string>(ctx, 'requestId'))
}

function lineNo(all: Line[], no: number): Line {
  const l = all.find((x) => x.line_no === no)
  assert(l, `Line L${no} exists`)
  return l
}

async function revision(ctx: ScenarioContext, no: number): Promise<Quotation> {
  const q = (await ctx.repo.listQuotations(stateOf<string>(ctx, 'requestId'))).find((x) => x.revision_no === no)
  assert(q, `Revision R${no} exists`)
  return q
}

function roundPrice(v: number): number {
  return Math.round(v * 100) / 100
}

export const scenarioA: Scenario = {
  id: 'a',
  title: 'Scenario A — Ebrecht Fabrication: two lines, partial acceptance, one revision',
  customer: 'Ebrecht Fabrication',
  situations: [
    'One request with several lines, a repeat product and a variation',
    'References from history',
    'A customer who accepts one line and asks a change on another',
    'A revision',
    'An executable order',
  ],
  steps: [
    {
      id: 'A1',
      actor: 'sales',
      title: 'Paste the request and extract lines (AI draft)',
      narrative: 'Sales pastes the customer email. The AI step proposes structured lines and open questions. Nothing is saved yet.',
      route: '/requests/new',
      ai: true,
      run: async (ctx) => {
        await draftIntake(ctx, { text: A_SOURCE_TEXT, customer_hint: 'Ebrecht Fabrication' }, A_INTAKE)
      },
      expect: async (ctx) => {
        const draft = stateOf<ScriptedIntake>(ctx, 'intakeDraft')
        assertEqual(draft.lines.length, 2, 'Lines found')
        assertEqual(`${draft.lines[0]?.family} ${draft.lines[0]?.size} ${draft.lines[0]?.material} ${draft.lines[0]?.length_mm} × ${draft.lines[0]?.quantity}`, 'HEA 200 S355 12000 × 120', 'Line 1')
        assertEqual(`${draft.lines[1]?.family} ${draft.lines[1]?.size} ${draft.lines[1]?.material} ${draft.lines[1]?.length_mm} × ${draft.lines[1]?.quantity}`, 'HEA 220 S355 10000 × 40', 'Line 2')
        assert(draft.open_questions.some((q) => /last year/i.test(q)), 'One open question about the order from last year')
        assertMatches(ctx, 'intakeComparison', 'The AI draft matches the script')
      },
    },
    {
      id: 'A2',
      actor: 'sales',
      title: 'Approve the scripted lines and create the request',
      narrative: 'The human approves the draft. Code creates the request, the lines with the pre-check, and the events.',
      route: '/requests/:requestId',
      run: async (ctx) => {
        const customer_id = await ctx.customerIdByName('Ebrecht Fabrication')
        const { request } = await createRequest(ctx.as('sales'), {
          customer_id,
          title: A_REQUEST_TITLE,
          source_text: A_SOURCE_TEXT,
          open_questions: A_INTAKE.open_questions,
          delivery_hint: A_INTAKE.delivery_hint,
          lines: A_INTAKE.lines.map((l) => ({ family: l.family, size: l.size, material: l.material, length_mm: l.length_mm, quantity: l.quantity, notes: l.notes })),
          source: typeof ctx.state.intakeAiRunId === 'string' ? 'ai' : 'manual',
          ai_run_id: typeof ctx.state.intakeAiRunId === 'string' ? ctx.state.intakeAiRunId : null,
          ai_mode: aiOrigin(ctx, 'intake')?.mode ?? null,
        })
        ctx.state.requestId = request.id
        ctx.state.requestRef = request.ref
        await approveDraft(ctx, 'intake')
      },
      expect: async (ctx) => {
        const request = await ctx.repo.getRequest(stateOf<string>(ctx, 'requestId'))
        assert(request, 'Request exists')
        assert(/^R-\d{4}-\d{4}$/.test(request.ref), `Request ref ${request.ref} has the R-<year>-<4 digits> format`)
        assertEqual(request.status, 'open', 'Request status')
        const all = await lines(ctx)
        assertEqual(all.length, 2, 'Line count')
        for (const no of [1, 2]) {
          const l = lineNo(all, no)
          assertEqual(l.commercial_status, 'draft', `L${no} commercial`)
          assertEqual(l.technical_status, 'not_required', `L${no} technical`)
          assertEqual((await ctx.repo.listChecks({ line_id: l.id })).length, 0, `No check for L${no}`)
        }
        const events = await ctx.repo.listEvents(request.id)
        const created = events.find((e) => e.type === 'request_created')
        assert(created, 'Timeline has the intake event')
        assert('source' in created.payload, 'The intake event carries its mode')
      },
    },
    {
      id: 'A3',
      actor: 'sales',
      title: 'Open L1, read the references, set the unit price at the suggested price',
      narrative: 'The reference engine ranks past quotations. FS-25-0117 and Q-G0200 are direct matches from the same customer; FS-25-0512 is the same profile in S460. Sales takes the suggested price.',
      route: '/requests/:requestId?line=1',
      run: async (ctx) => {
        const l1 = lineNo(await lines(ctx), 1)
        const insight = await lineInsight(ctx.as('sales'), l1)
        assert(insight.price, 'A price suggestion exists')
        const top5 = insight.references.slice(0, 5)
        await saveLine(ctx.as('sales'), l1.id, { unit_price: roundPrice(insight.price.unit.suggested), reference_ids: top5.map((r) => r.ref_id) })
        ctx.state.l1Insight = insight
      },
      expect: async (ctx) => {
        const l1 = lineNo(await lines(ctx), 1)
        const ids = l1.reference_ids
        assert(ids.includes('FS-25-0117'), `Top 5 includes FS-25-0117 (got ${ids.join(', ')})`)
        assert(ids.includes('FS-25-0512'), `Top 5 includes FS-25-0512 (got ${ids.join(', ')})`)
        assert(l1.unit_price !== null && l1.unit_price > 0, 'unit_price saved on L1')
        assert(l1.cost_estimate !== null, 'L1 has a cost estimate')
        const margin = (l1.unit_price * l1.quantity - l1.cost_estimate) / (l1.unit_price * l1.quantity)
        assert(margin > 0.17 && margin < 0.23, `Margin about 20 percent (got ${(margin * 100).toFixed(1)})`)
      },
    },
    {
      id: 'A4',
      actor: 'sales',
      title: 'Open L2, read the references, set the price',
      narrative: "The top four references are Ebrecht's own HEA 200 and HEA 240 rows, scored with the next-size chip; the first exact HEA 220 match, from another customer, ranks fifth.",
      route: '/requests/:requestId',
      run: async (ctx) => {
        const l2 = lineNo(await lines(ctx), 2)
        const insight = await lineInsight(ctx.as('sales'), l2)
        assert(insight.price, 'A price suggestion exists')
        await saveLine(ctx.as('sales'), l2.id, { unit_price: roundPrice(insight.price.unit.suggested), reference_ids: insight.references.slice(0, 5).map((r) => r.ref_id) })
        ctx.state.l2Insight = insight
      },
      expect: async (ctx) => {
        const l2 = lineNo(await lines(ctx), 2)
        assert(l2.unit_price !== null && l2.unit_price > 0, 'unit_price saved on L2')
        const insight = await lineInsight(ctx.as('sales'), l2)
        const top = insight.references.slice(0, 5)
        assert(top.some((r) => r.family === 'HEA' && r.size === 220 && r.customer !== 'Ebrecht Fabrication'), 'References include HEA 220 rows from other customers')
        assert(top.some((r) => r.customer === 'Ebrecht Fabrication' && r.score.product_adjacent), 'References include Ebrecht rows with the next-size chip')
      },
    },
    {
      id: 'A5',
      actor: 'sales',
      title: 'Prepare revision R1 and mark it as sent',
      narrative: 'The revision snapshots both lines. Sending is a human action. The lines move to quoted.',
      route: '/requests/:requestId/revisions/1',
      run: async (ctx) => {
        const draft = await prepareRevision(ctx.as('sales'), stateOf<string>(ctx, 'requestId'))
        const { quotation } = await sendRevision(ctx.as('sales'), draft.id)
        ctx.state.r1Id = quotation.id
      },
      expect: async (ctx) => {
        const r1 = await revision(ctx, 1)
        assertEqual(r1.status, 'sent', 'R1 status')
        assert(r1.valid_until !== null && r1.sent_at !== null, 'R1 has validity and sent date')
        const sent = r1.sent_at.slice(0, 10)
        const days = Math.round((Date.parse(r1.valid_until + 'T00:00:00Z') - Date.parse(sent + 'T00:00:00Z')) / 86400000)
        assertEqual(days, 30, 'Validity in days')
        const all = await lines(ctx)
        assertEqual(lineNo(all, 1).commercial_status, 'quoted', 'L1 commercial')
        assertEqual(lineNo(all, 2).commercial_status, 'quoted', 'L2 commercial')
        const snapshot = await ctx.repo.listQuotationLines(r1.id)
        assertEqual(snapshot.length, 2, 'R1 snapshot lines')
      },
    },
    {
      id: 'A6',
      actor: 'sales',
      title: 'Record the first customer reply and interpret it (AI draft)',
      narrative: 'The reply is recorded as data. The AI step proposes one decision per quoted line. Nothing changes state.',
      route: '/requests/:requestId/revisions/1',
      ai: true,
      run: async (ctx) => {
        const response = await recordResponse(ctx.as('sales'), stateOf<string>(ctx, 'r1Id'), A_REPLY_1)
        ctx.state.response1Id = response.id
        await draftInterpretation(ctx, stateOf<string>(ctx, 'r1Id'), 1, A_REPLY_1, A_DECISIONS_1, 'reply1')
      },
      expect: async (ctx) => {
        const draft = stateOf<Interpretation>(ctx, 'reply1Draft')
        assertEqual(draft.decisions.find((d) => d.line_no === 1)?.decision, 'accept', 'L1 decision')
        const d2 = draft.decisions.find((d) => d.line_no === 2)
        assertEqual(d2?.decision, 'change', 'L2 decision')
        assertEqual(d2?.changes.quantity, 60, 'L2 new quantity')
        const all = await lines(ctx)
        assertEqual(lineNo(all, 1).commercial_status, 'quoted', 'L1 unchanged until approval')
        assertMatches(ctx, 'reply1Comparison', 'The AI draft matches the script')
      },
    },
    {
      id: 'A7',
      actor: 'sales',
      title: 'Apply the scripted decisions',
      narrative: 'The human approves. Code applies one event per line and prepares draft R2 because a line changed.',
      route: '/requests/:requestId',
      run: async (ctx) => {
        const result = await applyResponse(ctx.as('sales'), stateOf<string>(ctx, 'response1Id'), A_DECISIONS_1, 'Marta Keller', aiOrigin(ctx, 'reply1'))
        await approveDraft(ctx, 'reply1')
        ctx.state.r2Id = result.draft?.id
      },
      expect: async (ctx) => {
        const all = await lines(ctx)
        const l1 = lineNo(all, 1)
        const l2 = lineNo(all, 2)
        assertEqual(l1.commercial_status, 'agreed', 'L1 commercial')
        assertEqual(l1.agreed_in_quotation_id, stateOf<string>(ctx, 'r1Id'), 'L1 agreed in R1')
        assertEqual(l2.quantity, 60, 'L2 quantity')
        assertEqual(l2.commercial_status, 'negotiating', 'L2 commercial')
        const r2 = await revision(ctx, 2)
        assertEqual(r2.status, 'draft', 'R2 is a draft')
        const events = await ctx.repo.listEvents(stateOf<string>(ctx, 'requestId'))
        assert(events.some((e) => e.type === 'line_changed' && e.line_id === l2.id), 'line_changed on L2')
        const r1Snapshot = await ctx.repo.listQuotationLines(stateOf<string>(ctx, 'r1Id'))
        const l2Before = r1Snapshot.find((s) => s.line_no === 2)
        assert(l2Before && l2.cost_estimate !== null && l2.cost_estimate > l2Before.cost_estimate, 'L2 has a new, higher cost estimate')
      },
    },
    {
      id: 'A8',
      actor: 'sales',
      title: 'Price L2 in R2 three percent under the R1 unit price and send R2',
      narrative: 'Sales gives the volume discount the customer asked for. R2 supersedes R1. The diff shows the quantity and the price.',
      route: '/requests/:requestId/revisions/2',
      run: async (ctx) => {
        const r1Snapshot = await ctx.repo.listQuotationLines(stateOf<string>(ctx, 'r1Id'))
        const before = r1Snapshot.find((s) => s.line_no === 2)
        assert(before, 'L2 in R1')
        const l2 = lineNo(await lines(ctx), 2)
        await saveLine(ctx.as('sales'), l2.id, { unit_price: roundPrice(before.unit_price * 0.97) })
        await sendRevision(ctx.as('sales'), stateOf<string>(ctx, 'r2Id'))
      },
      expect: async (ctx) => {
        assertEqual((await revision(ctx, 2)).status, 'sent', 'R2 status')
        assertEqual((await revision(ctx, 1)).status, 'superseded', 'R1 status')
        assertEqual(lineNo(await lines(ctx), 2).commercial_status, 'quoted', 'L2 commercial')
        const s1 = (await ctx.repo.listQuotationLines(stateOf<string>(ctx, 'r1Id'))).find((s) => s.line_no === 2)
        const s2 = (await ctx.repo.listQuotationLines(stateOf<string>(ctx, 'r2Id'))).find((s) => s.line_no === 2)
        assert(s1 && s2, 'L2 in both snapshots')
        assertEqual(`${s1.quantity} → ${s2.quantity}`, '40 → 60', 'Diff quantity')
        assert(s2.unit_price < s1.unit_price, 'Diff unit price decreased')
        assert(Math.abs(s2.unit_price / s1.unit_price - 0.97) < 0.001, 'Three percent under R1')
      },
    },
    {
      id: 'A9',
      actor: 'sales',
      title: 'Record the second reply and interpret it (AI draft)',
      narrative: 'The customer accepts L2 at the revised price.',
      route: '/requests/:requestId/revisions/2',
      ai: true,
      run: async (ctx) => {
        const response = await recordResponse(ctx.as('sales'), stateOf<string>(ctx, 'r2Id'), A_REPLY_2)
        ctx.state.response2Id = response.id
        await draftInterpretation(ctx, stateOf<string>(ctx, 'r2Id'), 2, A_REPLY_2, A_DECISIONS_2, 'reply2')
      },
      expect: async (ctx) => {
        const draft = stateOf<Interpretation>(ctx, 'reply2Draft')
        assertEqual(draft.decisions.find((d) => d.line_no === 2)?.decision, 'accept', 'L2 decision')
        assertMatches(ctx, 'reply2Comparison', 'The AI draft matches the script')
      },
    },
    {
      id: 'A10',
      actor: 'sales',
      title: 'Apply the scripted decision',
      narrative: 'L2 becomes agreed in R2. Every open line is executable and the latest revision is valid.',
      route: '/requests/:requestId',
      run: async (ctx) => {
        await applyResponse(ctx.as('sales'), stateOf<string>(ctx, 'response2Id'), A_DECISIONS_2, 'Marta Keller', aiOrigin(ctx, 'reply2'))
        await approveDraft(ctx, 'reply2')
      },
      expect: async (ctx) => {
        const l2 = lineNo(await lines(ctx), 2)
        assertEqual(l2.commercial_status, 'agreed', 'L2 commercial')
        assertEqual(l2.agreed_in_quotation_id, stateOf<string>(ctx, 'r2Id'), 'L2 agreed in R2')
        const agg = await loadRequestAggregate(ctx.as('sales'), stateOf<string>(ctx, 'requestId'))
        assert(agg.readiness.ready, `Order readiness all green (${agg.readiness.blockers.join(' ')})`)
        assert(agg.lines.filter((l) => l.commercial_status !== 'withdrawn').every(isExecutable), 'Every line executable')
      },
    },
    {
      id: 'A11',
      actor: 'sales',
      title: 'Create the executable order',
      narrative: 'The guard is code. The click is human. The order carries one snapshot per agreed line.',
      route: '/requests/:requestId',
      run: async (ctx) => {
        const { order } = await convertToOrder(ctx.as('sales'), stateOf<string>(ctx, 'requestId'))
        ctx.state.orderId = order.id
        ctx.state.orderRef = order.order_ref
      },
      expect: async (ctx) => {
        const order = await ctx.repo.getOrder(stateOf<string>(ctx, 'orderId'))
        assert(order, 'Order exists')
        assert(/^O-\d{4}-\d{4}$/.test(order.order_ref), `Order ref ${order.order_ref} has the O-<year>-<4 digits> format`)
        assertEqual(order.lines.length, 2, 'Order lines')
        const request = await ctx.repo.getRequest(stateOf<string>(ctx, 'requestId'))
        assertEqual(request?.status, 'converted', 'Request status')
        assertEqual(request?.order_id, order.id, 'Request links the order')
        const types = new Set((await ctx.repo.listEvents(order.request_id)).map((e) => e.type))
        for (const t of ['request_created', 'line_added', 'revision_sent', 'response_recorded', 'decision_applied', 'line_changed', 'revision_prepared', 'order_created']) {
          assert(types.has(t as never), `Timeline has ${t}`)
        }
      },
    },
  ],
}
