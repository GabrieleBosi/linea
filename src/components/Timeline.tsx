import type { Event } from '@/domain/types'
import { dateTime, money, number } from '@/lib/format'
import { TraceLink } from './TraceDrawer'

function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
}

/** A quoted span as a sentence of its own: capital first letter. */
function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function num(v: unknown): number | null {
  return typeof v === 'number' ? v : null
}

function cfg(p: Record<string, unknown>): string {
  return `${str(p.family)} ${str(p.size)} ${str(p.material)}, ${number(num(p.length_mm))} mm × ${number(num(p.quantity))}`
}

function lineRef(e: Event): string {
  const n = num(e.payload.line_no)
  return n !== null ? `L${n}` : 'Line'
}

function diff(before: Record<string, unknown>, after: Record<string, unknown>): string {
  const parts: string[] = []
  for (const k of ['family', 'size', 'material', 'length_mm', 'quantity']) {
    if (before[k] !== after[k]) parts.push(`${k.replace('_mm', '')} ${str(before[k])} → ${str(after[k])}`)
  }
  return parts.join(', ')
}

/** One short sentence per event. Spec 6.4. */
export function eventSentence(e: Event, lineNoById: Map<string, number>): string {
  const p = e.payload
  const L = e.line_id ? `L${lineNoById.get(e.line_id) ?? '?'}` : lineRef(e)
  const rev = num(p.revision_no)
  switch (e.type) {
    case 'request_created':
      return `Request ${str(p.ref)} created from ${str(p.source) === 'ai' ? 'an AI draft' : 'manual entry'} with ${num(p.line_count) ?? 0} line(s)`
    case 'line_added':
      return p.alternative_of_line_no !== undefined ? `${L} added as alternative of L${str(p.alternative_of_line_no)}: ${cfg(p)}` : `${L} added: ${cfg(p)}`
    case 'line_changed': {
      if (p.transition === 'supersede') return `${L} superseded by an alternative`
      const b = p.before as Record<string, unknown> | undefined
      const a = p.after as Record<string, unknown> | undefined
      return `${L} changed: ${b && a ? diff(b, a) : ''}${p.source === 'customer_response' ? ' (from the customer reply)' : ''}`
    }
    case 'line_withdrawn':
      return `${L} withdrawn: ${str(p.reason)}`
    case 'line_reopened':
      return `${L} reopened`
    case 'check_requested': {
      const hits = Array.isArray(p.rule_hits) ? (p.rule_hits as Array<{ rule_id: string }>).map((h) => h.rule_id) : []
      return `Feasibility check requested on ${L}${hits.length ? ` (rule ${hits.join(', ')})` : ''}${p.reason ? `: ${str(p.reason)}` : ''}`
    }
    case 'check_decided':
      return `${L} ${p.to === 'feasible' ? 'feasible' : 'not feasible'}: ${str(p.notes)}`
    case 'check_waived':
      return `Check on ${L} waived: ${str(p.reason)}`
    case 'alternative_proposed': {
      const alt = p.alternative as Record<string, unknown> | undefined
      return `Alternative proposed for ${L}${alt ? `: ${cfg(alt)}` : ''}`
    }
    case 'revision_prepared':
      return `R${rev ?? '?'} prepared as a draft${Array.isArray(p.line_nos) ? ` (${(p.line_nos as number[]).map((n) => `L${n}`).join(', ')})` : ''}`
    case 'revision_sent':
      return e.line_id ? `${L} quoted in R${rev ?? '?'}` : `R${rev ?? '?'} sent, valid until ${str(p.valid_until)}, total ${money(num(p.total))}`
    case 'response_recorded':
      return `Customer reply recorded on R${rev ?? '?'}`
    case 'decision_applied': {
      if (p.transition === 'customer_accept') return `${L} accepted by the customer (R${rev ?? '?'})`
      if (p.transition === 'customer_reject') return `${L} declined by the customer`
      if (p.transition === 'customer_change') {
        const c = (p.changes ?? {}) as Record<string, unknown>
        const parts = Object.entries(c)
          .filter(([, v]) => v !== null && v !== undefined)
          .map(([k, v]) => `${k.replace('_mm', '').replace('target_unit_price', 'target price')} ${str(v)}`)
        return `${L}: the customer asks a change${parts.length ? ` (${parts.join(', ')})` : ''}`
      }
      return `${L}: ${str(p.transition)}`
    }
    case 'clarification_needed':
      return `${L}: clarification needed. ${sentence(str(p.note))}`
    case 'request_held':
      return `Request put on hold: ${str(p.reason)}`
    case 'request_rejected':
      return `Request rejected: ${str(p.reason)}`
    case 'request_reopened':
      return 'Request reopened'
    case 'order_created':
      return `Order ${str(p.order_ref)} created`
    case 'override':
      return `Override: ${str(p.transition)} on ${L}. ${str(p.reason)}`
    case 'ai_run':
      return `AI step ${str(p.step).replace('_', ' ')} ran in ${str(p.mode)} mode and the draft was approved`
    default:
      return e.type
  }
}

export function Timeline({ events, lineNoById }: { events: Event[]; lineNoById: Map<string, number> }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No events yet.</p>
  }
  return (
    <ol className="space-y-2">
      {events.map((e) => (
        <li key={e.id} className="text-sm">
          <div className="flex items-baseline gap-2">
            <span className="w-14 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{e.actor_role}</span>
            <span className={e.type === 'override' ? 'font-medium text-amber-800' : ''}>{eventSentence(e, lineNoById)}</span>
          </div>
          <div className="pl-16 text-xs text-muted-foreground">
            {e.actor_name} · {dateTime(e.created_at)}
            {e.type === 'override' && <span className="ml-2 rounded bg-amber-100 px-1 text-amber-800">override</span>}
            {e.type === 'ai_run' && typeof e.payload.ai_run_id === 'string' && (
              <span className="ml-2">
                <TraceLink aiRunId={e.payload.ai_run_id} />
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
