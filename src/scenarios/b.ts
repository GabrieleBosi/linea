// Scenario B — Torvane Structures: feasibility fails after the quotation, alternative, mixed states. Spec 7.2.

import { executableCount } from '@/domain/readiness'
import { configurationOf, type Interpretation, type Line, type Quotation } from '@/domain/types'
import {
  applyResponse,
  configurationInsight,
  convertToOrder,
  createRequest,
  decideCheck,
  lineInsight,
  loadRequestAggregate,
  prepareRevision,
  proposeAlternative,
  recordResponse,
  saveLine,
  sendRevision,
} from '@/services'
import { aiOrigin, approveDraft, assertMatches, draftIntake, draftInterpretation } from './ai'
import { assert, assertEqual, stateOf, type Scenario, type ScenarioContext, type ScriptedIntake } from './types'

import { B_REPLY_1, B_REPLY_2, B_SOURCE_TEXT } from './texts'
export { B_REPLY_1, B_REPLY_2, B_SOURCE_TEXT }

export const B_OPS_NOTES = 'S460 in HEA 240 rolls to 12 m maximum. 14 m in S460 is not producible. Alternative with equivalent capacity: HEA 260 in S355 at 14 m.'

export const B_ALTERNATIVE = { family: 'HEA' as const, size: 260, material: 'S355' as const, length_mm: 14000, quantity: 100, notes: 'Equivalent capacity to HEA 240 S460. Producible at 14 m.' }

export const B_INTAKE: ScriptedIntake = {
  customer_name_guess: 'Torvane Structures',
  lines: [
    { family: 'HEA', size: 240, material: 'S460', length_mm: 14000, quantity: 100, notes: 'critical item for the structural design', flags: ['check needed'] },
    { family: 'IPE', size: 300, material: 'S355', length_mm: 12000, quantity: 80, notes: '', flags: [] },
  ],
  open_questions: [],
  stated_date: null,
  requested_delivery_date: null,
  delivery_hint: null,
}

export const B_DECISIONS_1: Interpretation = {
  decisions: [
    { line_no: 1, decision: 'unclear', changes: { quantity: null, length_mm: null, material: null, size: null, target_unit_price: null }, source_span: 'we wait for your technical confirmation of the 14 m length before we accept', confidence: 0.85 },
    { line_no: 2, decision: 'accept', changes: { quantity: null, length_mm: null, material: null, size: null, target_unit_price: null }, source_span: 'the IPE 300 line is accepted, please proceed with it.', confidence: 0.95 },
  ],
  overall: 'partial',
  needs_clarification: ['The customer waits for the technical confirmation of the 14 m length on line 1.'],
}

export const B_DECISIONS_2: Interpretation = {
  decisions: [{ line_no: 3, decision: 'accept', changes: { quantity: null, length_mm: null, material: null, size: null, target_unit_price: null }, source_span: 'We accept the HEA 260 in S355 at 14 m as proposed, 100 pieces, at the revised price.', confidence: 0.95 }],
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

async function priceAtSuggestion(ctx: ScenarioContext, line: Line): Promise<void> {
  const insight = await lineInsight(ctx.as('sales'), line)
  assert(insight.price, `A price suggestion exists for L${line.line_no}`)
  await saveLine(ctx.as('sales'), line.id, { unit_price: roundPrice(insight.price.unit.suggested), reference_ids: insight.references.slice(0, 5).map((r) => r.ref_id) })
}

export const scenarioB: Scenario = {
  id: 'b',
  title: 'Scenario B — Torvane Structures: feasibility fails after the quotation, alternative, mixed states',
  customer: 'Torvane Structures',
  situations: [
    'A length rule hit: F1a, S460 in this size rolls to 12 m maximum',
    'A feasibility check after the quotation is sent',
    'A not-feasible decision and an alternative proposed by Operations',
    'One line agreed while another is technically pending',
    'A revision',
    'An executable order',
  ],
  steps: [
    {
      id: 'B1',
      actor: 'sales',
      title: 'Paste the request and extract lines (AI draft)',
      narrative: 'The AI step proposes two lines. The pre-check flags L1: F1a, S460 in this size rolls to 12 m maximum (14 m asked).',
      route: '/requests/new',
      ai: true,
      run: async (ctx) => {
        await draftIntake(ctx, { text: B_SOURCE_TEXT, customer_hint: 'Torvane Structures' }, B_INTAKE)
      },
      expect: async (ctx) => {
        const draft = stateOf<ScriptedIntake>(ctx, 'intakeDraft')
        assertEqual(draft.lines.length, 2, 'Lines found')
        assert(draft.lines[0]?.flags.includes('check needed'), 'L1 flagged check needed')
        assertEqual(`${draft.lines[1]?.family} ${draft.lines[1]?.size} ${draft.lines[1]?.material} ${draft.lines[1]?.length_mm} × ${draft.lines[1]?.quantity}`, 'IPE 300 S355 12000 × 80', 'Line 2')
        assertMatches(ctx, 'intakeComparison', 'The AI draft matches the script')
      },
    },
    {
      id: 'B2',
      actor: 'sales',
      title: 'Approve the scripted lines and create the request',
      narrative: 'L1 hits F1a (S460 in this size rolls to 12 m maximum) and gets a pending feasibility check in the Operations queue. L2 is a known configuration.',
      route: '/requests/:requestId',
      run: async (ctx) => {
        const customer_id = await ctx.customerIdByName('Torvane Structures')
        const { request } = await createRequest(ctx.as('sales'), {
          customer_id,
          title: 'Bridge maintenance platform, Salzburg',
          source_text: B_SOURCE_TEXT,
          lines: B_INTAKE.lines.map((l) => ({ family: l.family, size: l.size, material: l.material, length_mm: l.length_mm, quantity: l.quantity, notes: l.notes })),
          source: typeof ctx.state.intakeAiRunId === 'string' ? 'ai' : 'manual',
          ai_run_id: typeof ctx.state.intakeAiRunId === 'string' ? ctx.state.intakeAiRunId : null,
          ai_mode: aiOrigin(ctx, 'intake')?.mode ?? null,
        })
        ctx.state.requestId = request.id
        ctx.state.requestRef = request.ref
        await approveDraft(ctx, 'intake')
      },
      expect: async (ctx) => {
        const all = await lines(ctx)
        const l1 = lineNo(all, 1)
        const l2 = lineNo(all, 2)
        assertEqual(l1.commercial_status, 'draft', 'L1 commercial')
        assertEqual(l1.technical_status, 'pending', 'L1 technical')
        assertEqual(l2.commercial_status, 'draft', 'L2 commercial')
        assertEqual(l2.technical_status, 'not_required', 'L2 technical')
        const checks = await ctx.repo.listChecks({ line_id: l1.id, status: ['pending'] })
        assertEqual(checks.length, 1, 'One pending check for L1')
        assertEqual((await ctx.repo.listChecks({ line_id: l1.id })).length, 1, 'Exactly one check for L1')
        assertEqual((await ctx.repo.listChecks({ line_id: l2.id })).length, 0, 'No check for L2')
        assert(checks[0]?.rule_hits.some((h) => h.rule_id === 'F1a'), 'The check carries rule F1a')
        ctx.state.check1Id = checks[0]?.id
      },
    },
    {
      id: 'B3',
      actor: 'sales',
      title: 'Price both lines and send R1',
      narrative: 'R1 goes out while L1 is still pending. Its snapshot carries "subject to technical validation".',
      route: '/requests/:requestId/revisions/1',
      run: async (ctx) => {
        const all = await lines(ctx)
        await priceAtSuggestion(ctx, lineNo(all, 1))
        await priceAtSuggestion(ctx, lineNo(all, 2))
        const draft = await prepareRevision(ctx.as('sales'), stateOf<string>(ctx, 'requestId'))
        const { quotation } = await sendRevision(ctx.as('sales'), draft.id)
        ctx.state.r1Id = quotation.id
      },
      expect: async (ctx) => {
        const r1 = await revision(ctx, 1)
        assertEqual(r1.status, 'sent', 'R1 status')
        const snapshot = await ctx.repo.listQuotationLines(r1.id)
        assertEqual(snapshot.find((s) => s.line_no === 1)?.subject_to_feasibility, true, 'L1 subject to technical validation')
        assertEqual(snapshot.find((s) => s.line_no === 2)?.subject_to_feasibility, false, 'L2 not subject')
        // Spec 7.2 B3: when the P1 cover text exists, it carries the phrase for L1 only.
        if (r1.cover_text) {
          const phrase = 'subject to technical validation'
          const paragraphs = r1.cover_text.split(/\n\s*\n/)
          const withPhrase = paragraphs.filter((p) => p.toLowerCase().includes(phrase))
          assert(withPhrase.length >= 1 && withPhrase.every((p) => /\b(line|l)\s*1\b/i.test(p) || /hea 240/i.test(p)), 'Cover text: the phrase sits with L1 only')
        }
      },
    },
    {
      id: 'B4',
      actor: 'sales',
      title: 'Record the first reply and interpret it (AI draft)',
      narrative: 'The customer accepts L2 and waits for the technical confirmation on L1.',
      route: '/requests/:requestId/revisions/1',
      ai: true,
      run: async (ctx) => {
        const response = await recordResponse(ctx.as('sales'), stateOf<string>(ctx, 'r1Id'), B_REPLY_1)
        ctx.state.response1Id = response.id
        await draftInterpretation(ctx, stateOf<string>(ctx, 'r1Id'), 1, B_REPLY_1, B_DECISIONS_1, 'reply1')
      },
      expect: async (ctx) => {
        const draft = stateOf<Interpretation>(ctx, 'reply1Draft')
        assertEqual(draft.decisions.find((d) => d.line_no === 2)?.decision, 'accept', 'L2 decision')
        assertEqual(draft.decisions.find((d) => d.line_no === 1)?.decision, 'unclear', 'L1 decision')
        assert(draft.needs_clarification.length > 0, 'A clarification note exists')
        assertMatches(ctx, 'reply1Comparison', 'The AI draft matches the script')
      },
    },
    {
      id: 'B5',
      actor: 'sales',
      title: 'Apply the scripted decisions',
      narrative: 'L2 becomes agreed. L1 stays quoted with a clarification_needed event. The workspace shows one line ready and one not.',
      route: '/requests/:requestId',
      run: async (ctx) => {
        await applyResponse(ctx.as('sales'), stateOf<string>(ctx, 'response1Id'), B_DECISIONS_1, 'Marta Keller', aiOrigin(ctx, 'reply1'))
        await approveDraft(ctx, 'reply1')
      },
      expect: async (ctx) => {
        const all = await lines(ctx)
        assertEqual(lineNo(all, 2).commercial_status, 'agreed', 'L2 commercial')
        assertEqual(lineNo(all, 1).commercial_status, 'quoted', 'L1 commercial')
        const events = await ctx.repo.listEvents(stateOf<string>(ctx, 'requestId'))
        assert(events.some((e) => e.type === 'clarification_needed' && e.line_id === lineNo(all, 1).id), 'clarification_needed on L1')
        const counts = executableCount(all)
        assertEqual(`${counts.ready} of ${counts.open}`, '1 of 2', 'Ready of open')
      },
    },
    {
      id: 'B6',
      actor: 'ops',
      title: 'Open the queue, open the check for L1',
      narrative: "Operations sees rule F1a and that the reference count for HEA 240 S460 is zero. A request's own lines never count for it, so it stays zero after B7; the superseded L1 becomes a lost reference for later requests.",
      route: '/ops/:check1Id',
      run: async (ctx) => {
        ctx.setRole('ops')
        const queue = await ctx.repo.listCheckQueue(['pending'])
        const item = queue.find((q) => q.request.id === stateOf<string>(ctx, 'requestId'))
        assert(item, 'The check is in the queue')
        ctx.state.check1Id = item.check.id
      },
      expect: async (ctx) => {
        const check = await ctx.repo.getCheck(stateOf<string>(ctx, 'check1Id'))
        assert(check, 'Check exists')
        assert(check.rule_hits.some((h) => h.rule_id === 'F1a'), 'Rule hit F1a is shown')
        const l1 = lineNo(await lines(ctx), 1)
        // As the Operations screen computes it: without the request's own lines.
        const insight = await configurationInsight(ctx.as('ops'), configurationOf(l1), 'Torvane Structures', undefined, stateOf<string>(ctx, 'requestRef'))
        assertEqual(insight.reference_count, 0, 'Reference count for HEA 240 S460')
      },
    },
    {
      id: 'B7',
      actor: 'ops',
      title: 'Decide "Not feasible" with notes, and propose the alternative HEA 260 S355 14000 × 100',
      narrative: 'The decision and the alternative are data. L1 is superseded, L3 is created as its alternative, already feasible.',
      route: '/requests/:requestId',
      run: async (ctx) => {
        const checkId = stateOf<string>(ctx, 'check1Id')
        await decideCheck(ctx.as('ops'), checkId, 'not_feasible', B_OPS_NOTES)
        const { alternative } = await proposeAlternative(ctx.as('ops'), checkId, B_ALTERNATIVE)
        ctx.state.l3Id = alternative.id
      },
      expect: async (ctx) => {
        const all = await lines(ctx)
        const l1 = lineNo(all, 1)
        const l3 = lineNo(all, 3)
        assertEqual(l1.commercial_status, 'superseded', 'L1 commercial')
        assertEqual(l1.technical_status, 'not_feasible', 'L1 technical')
        assertEqual(l3.commercial_status, 'draft', 'L3 commercial')
        assertEqual(l3.technical_status, 'feasible', 'L3 technical')
        assertEqual(l3.alternative_of_line_id, l1.id, 'L3 is the alternative of L1')
        assertEqual(`${l3.family} ${l3.size} ${l3.material} ${l3.length_mm} × ${l3.quantity}`, 'HEA 260 S355 14000 × 100', 'L3 configuration')
        const events = await ctx.repo.listEvents(stateOf<string>(ctx, 'requestId'))
        assert(events.some((e) => e.type === 'alternative_proposed'), 'Sales sees an alternative_proposed event')
        assert(events.some((e) => e.type === 'check_decided'), 'The decision is on the timeline')
        // The superseded L1 is now a lost reference, for later requests only.
        const own = await configurationInsight(ctx.as('ops'), configurationOf(l1), 'Torvane Structures', undefined, stateOf<string>(ctx, 'requestRef'))
        assertEqual(own.reference_count, 0, 'Reference count for HEA 240 S460 on the Operations screen, after B7')
        const later = await configurationInsight(ctx.as('ops'), configurationOf(l1), 'Torvane Structures')
        assertEqual(later.reference_count, 1, 'Reference count for HEA 240 S460 seen from another request, after B7')
      },
    },
    {
      id: 'B8',
      actor: 'sales',
      title: 'Open L3, read the references, set the price',
      narrative: 'FS-25-0389 (same customer, HEA 240, next size down) ranks first; more Torvane HEA 240 rows follow, and an exact HEA 260 S355 match from another customer (Q-G0220) ranks fifth.',
      route: '/requests/:requestId?line=3',
      run: async (ctx) => {
        ctx.setRole('sales')
        await priceAtSuggestion(ctx, lineNo(await lines(ctx), 3))
      },
      expect: async (ctx) => {
        const l3 = lineNo(await lines(ctx), 3)
        assert(l3.unit_price !== null && l3.unit_price > 0, 'L3 priced')
        const insight = await lineInsight(ctx.as('sales'), l3)
        const top = insight.references.slice(0, 5)
        assert(top.some((r) => r.ref_id === 'FS-25-0389'), `References include FS-25-0389 (got ${top.map((r) => r.ref_id).join(', ')})`)
        assert(top.some((r) => r.family === 'HEA' && r.size === 260 && r.material === 'S355'), 'References include HEA 260 S355 rows')
      },
    },
    {
      id: 'B9',
      actor: 'sales',
      title: 'Prepare R2 and send it',
      narrative: 'R2 contains L3. L2 appears as "Agreed in R1" and is not re-priced. The diff explains the alternative.',
      route: '/requests/:requestId/revisions/2',
      run: async (ctx) => {
        const draft = await prepareRevision(ctx.as('sales'), stateOf<string>(ctx, 'requestId'))
        const { quotation } = await sendRevision(ctx.as('sales'), draft.id)
        ctx.state.r2Id = quotation.id
      },
      expect: async (ctx) => {
        const r2 = await revision(ctx, 2)
        assertEqual(r2.status, 'sent', 'R2 status')
        const snapshot = await ctx.repo.listQuotationLines(r2.id)
        assertEqual(snapshot.map((s) => s.line_no).join(','), '3', 'R2 contains L3 only')
        const l2 = lineNo(await lines(ctx), 2)
        assertEqual(l2.agreed_in_quotation_id, stateOf<string>(ctx, 'r1Id'), 'L2 agreed in R1')
        assertEqual(lineNo(await lines(ctx), 3).commercial_status, 'quoted', 'L3 commercial')
      },
    },
    {
      id: 'B10',
      actor: 'sales',
      title: 'Record the second reply and interpret it (AI draft)',
      narrative: 'The customer accepts the alternative.',
      route: '/requests/:requestId/revisions/2',
      ai: true,
      run: async (ctx) => {
        const response = await recordResponse(ctx.as('sales'), stateOf<string>(ctx, 'r2Id'), B_REPLY_2)
        ctx.state.response2Id = response.id
        await draftInterpretation(ctx, stateOf<string>(ctx, 'r2Id'), 2, B_REPLY_2, B_DECISIONS_2, 'reply2')
      },
      expect: async (ctx) => {
        const draft = stateOf<Interpretation>(ctx, 'reply2Draft')
        assertEqual(draft.decisions.find((d) => d.line_no === 3)?.decision, 'accept', 'L3 decision')
        assertMatches(ctx, 'reply2Comparison', 'The AI draft matches the script')
      },
    },
    {
      id: 'B11',
      actor: 'sales',
      title: 'Apply the scripted decision',
      narrative: 'L3 becomes agreed. Readiness is all green.',
      route: '/requests/:requestId',
      run: async (ctx) => {
        await applyResponse(ctx.as('sales'), stateOf<string>(ctx, 'response2Id'), B_DECISIONS_2, 'Marta Keller', aiOrigin(ctx, 'reply2'))
        await approveDraft(ctx, 'reply2')
      },
      expect: async (ctx) => {
        assertEqual(lineNo(await lines(ctx), 3).commercial_status, 'agreed', 'L3 commercial')
        const agg = await loadRequestAggregate(ctx.as('sales'), stateOf<string>(ctx, 'requestId'))
        assert(agg.readiness.ready, `Readiness all green (${agg.readiness.blockers.join(' ')})`)
      },
    },
    {
      id: 'B12',
      actor: 'sales',
      title: 'Create the executable order',
      narrative: 'The order has L3 agreed in R2 and L2 agreed in R1. Mixed revisions in one order are normal.',
      route: '/requests/:requestId',
      run: async (ctx) => {
        const { order } = await convertToOrder(ctx.as('sales'), stateOf<string>(ctx, 'requestId'))
        ctx.state.orderId = order.id
        ctx.state.orderRef = order.order_ref
      },
      expect: async (ctx) => {
        const order = await ctx.repo.getOrder(stateOf<string>(ctx, 'orderId'))
        assert(order, 'Order exists')
        const byNo = new Map(order.lines.map((l) => [l.line_no, l]))
        assertEqual(order.lines.length, 2, 'Order lines')
        assertEqual(byNo.get(3)?.agreed_in_revision_no, 2, 'L3 agreed in R2')
        assertEqual(byNo.get(2)?.agreed_in_revision_no, 1, 'L2 agreed in R1')
        assertEqual((await ctx.repo.getRequest(stateOf<string>(ctx, 'requestId')))?.status, 'converted', 'Request status')
      },
    },
  ],
}
