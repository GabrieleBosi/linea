// Order readiness and the conversion guard. Spec 2.2 and screen 2.

import { isExecutable, isOpen, type Line, type Quotation } from './types'

export type ReadinessItem = {
  key: 'has_open_line' | 'lines_agreed' | 'lines_feasible' | 'revision_valid'
  ok: boolean
  label: string
  /** Lines that block this item. Empty when ok. */
  blocking_line_ids: string[]
}

export type Readiness = {
  ready: boolean
  items: ReadinessItem[]
  /** Short sentences for the tooltip on the disabled button. */
  blockers: string[]
}

export function latestSentRevision(quotations: readonly Quotation[]): Quotation | null {
  const sent = quotations.filter((q) => q.status === 'sent' || q.status === 'superseded')
  if (sent.length === 0) return null
  return sent.reduce((a, b) => (b.revision_no > a.revision_no ? b : a))
}

/** Expired is derived: sent and valid_until in the past. Spec 2.1. */
export function isExpired(quotation: Pick<Quotation, 'status' | 'valid_until'>, today: string): boolean {
  if (quotation.status !== 'sent' || quotation.valid_until === null) return false
  return quotation.valid_until < today.slice(0, 10)
}

export function computeReadiness(lines: readonly Line[], quotations: readonly Quotation[], today: string): Readiness {
  const open = lines.filter(isOpen)
  const notAgreed = open.filter((l) => l.commercial_status !== 'agreed')
  const notFeasible = open.filter((l) => l.technical_status !== 'feasible' && l.technical_status !== 'not_required')
  const latest = latestSentRevision(quotations)
  const revisionOk = latest !== null && latest.status === 'sent' && !isExpired(latest, today)

  const items: ReadinessItem[] = [
    {
      key: 'has_open_line',
      ok: open.length > 0,
      label: 'At least one open line',
      blocking_line_ids: [],
    },
    {
      key: 'lines_agreed',
      ok: notAgreed.length === 0,
      label: 'Every open line agreed by the customer',
      blocking_line_ids: notAgreed.map((l) => l.id),
    },
    {
      key: 'lines_feasible',
      ok: notFeasible.length === 0,
      label: 'Every open line feasible or without a check',
      blocking_line_ids: notFeasible.map((l) => l.id),
    },
    {
      key: 'revision_valid',
      ok: revisionOk,
      label: latest === null ? 'A revision has been sent' : 'The latest sent revision is still valid',
      blocking_line_ids: [],
    },
  ]

  const blockers: string[] = []
  if (open.length === 0) blockers.push('The request has no open line.')
  if (notAgreed.length > 0) blockers.push(`${notAgreed.length} open line(s) not agreed: ${notAgreed.map((l) => `L${l.line_no}`).join(', ')}.`)
  if (notFeasible.length > 0) blockers.push(`${notFeasible.length} open line(s) waiting for feasibility: ${notFeasible.map((l) => `L${l.line_no}`).join(', ')}.`)
  if (latest === null) blockers.push('No revision has been sent.')
  else if (latest.status !== 'sent') blockers.push('The latest revision is superseded.')
  else if (isExpired(latest, today)) blockers.push(`Revision R${latest.revision_no} expired on ${latest.valid_until}.`)

  return { ready: items.every((i) => i.ok), items, blockers }
}

export function executableCount(lines: readonly Line[]): { ready: number; open: number } {
  const open = lines.filter(isOpen)
  return { ready: open.filter(isExecutable).length, open: open.length }
}
