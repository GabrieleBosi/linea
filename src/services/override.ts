// Force a transition with a reason. Spec 2.3 and 3.2 (`forceEvent`, P1). The guard and the
// role check are skipped inside applyEvent; the event is written with type `override`.

import { applyEvent, type LineEvent, type RequestEvent } from '@/domain/applyEvent'
import { buildForcedEvent, forceableEvent, type ForceableEventName } from '@/domain/override'
import { latestSentRevision } from '@/domain/readiness'
import type { Line, Request } from '@/domain/types'
import { mustGetLine, ServiceError, type ServiceContext } from './context'
import { loadRequestAggregate } from './requests'

export type ForceTarget = { kind: 'line'; line_id: string } | { kind: 'request'; request_id: string }

export async function forceEvent(ctx: ServiceContext, target: ForceTarget, name: ForceableEventName, reason: string): Promise<Line | Request> {
  const def = forceableEvent(name)
  if (!def) throw new ServiceError(`'${name}' cannot be forced.`, 'Pick one of the listed transitions.')
  if (reason.trim() === '') throw new ServiceError('A forced transition needs a reason.', 'Write why the process does not fit this case.')

  if (target.kind === 'line') {
    if (def.target !== 'line') throw new ServiceError(`'${name}' applies to a request, not to a line.`, 'Pick a line transition.')
    const line = await mustGetLine(ctx, target.line_id)
    const agg = await loadRequestAggregate(ctx, line.request_id)
    const checks = await ctx.repo.listChecks({ line_id: line.id })
    const check = checks[checks.length - 1] ?? null
    const event = buildForcedEvent(name, { reason, request: agg.request, quotation: latestSentRevision(agg.quotations), check }) as LineEvent
    const t = applyEvent(line, event, ctx.actor, { force: true, reason, today: ctx.today() })
    const next = await ctx.repo.commitLineTransition(t)
    // A pending check on a line forced to feasible or not feasible is decided with the reason, so the queue stays true.
    if (check && check.status === 'pending' && (name === 'feasible' || name === 'not_feasible')) {
      await ctx.repo.updateCheck(check.id, { status: name, decided_by: ctx.actor.name, decided_at: ctx.now(), notes: `Override: ${reason}` })
    }
    return next
  }

  if (def.target !== 'request') throw new ServiceError(`'${name}' applies to a line, not to a request.`, 'Pick a request transition.')
  const agg = await loadRequestAggregate(ctx, target.request_id)
  const event = buildForcedEvent(name, { reason, request: agg.request, quotation: null, check: null }) as RequestEvent
  const t = applyEvent(agg, event, ctx.actor, { force: true, reason, today: ctx.today() })
  return ctx.repo.commitRequestTransition(t)
}
