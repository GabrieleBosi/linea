// Screen 4 — feasibility check detail. Spec 6.6.

import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfigurationFields, type ConfigurationDraft } from '@/components/ConfigurationFields'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAction } from '@/lib/actions'
import { configDetail, configLabel, date, dateTime } from '@/lib/format'
import { useCheck, useConfigurationInsight, useRequestAggregate } from '@/lib/queries'
import { repo } from '@/lib/repo'
import { useServices } from '@/lib/services'
import { decideCheck, proposeAlternative, waiveCheck } from '@/services/checks'

export const Route = createFileRoute('/ops/$checkId')({
  component: CheckDetail,
})

function CheckDetail() {
  const { checkId } = Route.useParams()
  const check = useCheck(checkId)
  const line = useQuery({ queryKey: ['line', check.data?.line_id ?? ''], queryFn: () => repo.getLine(check.data?.line_id ?? ''), enabled: Boolean(check.data) })
  const agg = useRequestAggregate(line.data?.request_id ?? '')
  const ctx = useServices()
  const action = useAction(line.data?.request_id)
  const [notes, setNotes] = useState('')
  const [waiveReason, setWaiveReason] = useState('')
  const [alt, setAlt] = useState<ConfigurationDraft | null>(null)

  const customerName = agg.data?.customer?.name ?? ''
  // Waits for the request: its own lines are left out of the count, so asking before it loads
  // would show the full-history count first.
  const insight = useConfigurationInsight(line.data && agg.data ? { family: line.data.family, size: line.data.size, material: line.data.material, length_mm: line.data.length_mm, quantity: line.data.quantity } : null, customerName, agg.data?.request.ref)

  if (check.isPending || line.isPending) return <p className="text-sm text-muted-foreground">Loading the check…</p>
  if (!check.data || !line.data) {
    return (
      <p className="text-sm">
        This check does not exist. <Link to="/ops" className="text-primary underline">Back to the queue.</Link>
      </p>
    )
  }
  const c = check.data
  const l = line.data
  const request = agg.data?.request
  const otherLines = (agg.data?.lines ?? []).filter((x) => x.id !== l.id)
  const latest = agg.data ? [...agg.data.quotations].sort((a, b) => b.revision_no - a.revision_no)[0] : undefined

  const decide = async (decision: 'feasible' | 'not_feasible') => {
    const r = await action.run(() => decideCheck(ctx, c.id, decision, notes.trim()), decision === 'feasible' ? `L${l.line_no} is feasible.` : `L${l.line_no} is not feasible. You can propose an alternative.`)
    if (r && decision === 'not_feasible') setAlt({ family: l.family, size: l.size, material: l.material, length_mm: l.length_mm, quantity: l.quantity, notes: '' })
  }

  const waive = async () => {
    await action.run(() => waiveCheck(ctx, c.id, waiveReason.trim()), 'Check waived and logged as an override.')
  }

  const propose = async () => {
    if (!alt) return
    const r = await action.run(() => proposeAlternative(ctx, c.id, alt))
    if (r) {
      setAlt(null)
      toast.success(`L${r.alternative.line_no} created as the alternative of L${r.original.line_no}.`, {
        action: request ? { label: `Open ${request.ref}`, onClick: () => window.location.assign(`/requests/${request.id}`) } : undefined,
      })
    }
  }

  const canDecide = c.status === 'pending' && ctx.actor.role === 'ops'
  const showAlternativeForm = c.status === 'not_feasible' && l.commercial_status !== 'superseded' && ctx.actor.role === 'ops'

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link to="/ops" className="text-primary underline">
            Operations queue
          </Link>
        </p>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          Feasibility check · {request?.ref ?? '…'} L{l.line_no} <StatusBadge kind="check" value={c.status} />
        </h1>
        <p className="text-sm text-muted-foreground">
          Requested by {c.requested_by} on {dateTime(c.requested_at)}
          {c.decided_by && ` · decided by ${c.decided_by} on ${dateTime(c.decided_at)}`}
        </p>
      </header>

      <div className="grid grid-cols-[1fr_360px] gap-4">
        <main className="space-y-4">
          <section className="rounded-md border bg-card p-4 text-[15px]">
            <h2 className="mb-2 text-sm font-semibold">Line configuration</h2>
            <p className="text-lg font-semibold">{configLabel(l)}</p>
            <p className="text-muted-foreground">{configDetail(l)}</p>
            {l.notes && <p className="mt-1 text-sm">{l.notes}</p>}
            <div className="mt-2 flex gap-2">
              <StatusBadge kind="commercial" value={l.commercial_status} />
              <StatusBadge kind="technical" value={l.technical_status} />
            </div>
          </section>

          <section className="rounded-md border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Rule hits</h2>
            {c.rule_hits.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rule hit. {c.notes ?? 'The check was requested by hand.'}</p>
            ) : (
              <ul className="space-y-1">
                {c.rule_hits.map((h) => (
                  <li key={h.rule_id} className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-sm text-amber-900">
                    <span className="font-medium">{h.rule_id}</span> — {h.note}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              Reference count for {l.family} {l.size} {l.material} in history: <span className="font-medium text-foreground">{insight.data?.reference_count ?? '…'}</span>
            </p>
          </section>

          {ctx.actor.role !== 'ops' && c.status === 'pending' && (
            <p className="rounded-md border bg-card p-4 text-sm text-muted-foreground">Switch the role to Operations in the header to decide this check.</p>
          )}

          {canDecide && (
            <section className="space-y-3 rounded-md border bg-card p-4">
              <h2 className="text-sm font-semibold">Decision</h2>
              <div className="space-y-1">
                <Label htmlFor="decision-notes">Notes (required)</Label>
                <Textarea id="decision-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What Operations found and why." />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => decide('feasible')} disabled={action.busy || notes.trim() === ''}>
                  Feasible
                </Button>
                <Button variant="destructive" onClick={() => decide('not_feasible')} disabled={action.busy || notes.trim() === ''}>
                  Not feasible
                </Button>
              </div>
              <div className="flex items-end gap-2 border-t pt-3">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="waive-reason">Waive the check with a reason (logged as an override)</Label>
                  <Input id="waive-reason" className="h-8" value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} />
                </div>
                <Button variant="outline" size="sm" onClick={waive} disabled={action.busy || waiveReason.trim() === ''}>
                  Waive check
                </Button>
              </div>
            </section>
          )}

          {c.status !== 'pending' && (
            <section className="rounded-md border bg-card p-4 text-sm">
              <h2 className="mb-1 text-sm font-semibold">Decision</h2>
              <p>
                <StatusBadge kind="check" value={c.status} /> <span className="ml-2">{c.notes}</span>
              </p>
              {c.alternative && (
                <p className="mt-2 text-muted-foreground">
                  Alternative proposed: {c.alternative.family} {c.alternative.size} {c.alternative.material}, {c.alternative.length_mm} mm × {c.alternative.quantity}. {c.alternative.notes}
                </p>
              )}
            </section>
          )}

          {showAlternativeForm && (
            <section className="space-y-3 rounded-md border bg-card p-4">
              <h2 className="text-sm font-semibold">Propose alternative</h2>
              <p className="text-sm text-muted-foreground">A new line replaces L{l.line_no}, already feasible. Sales prices it and quotes it in the next revision.</p>
              {alt ? (
                <>
                  <ConfigurationFields value={alt} onChange={setAlt} idPrefix="alt" />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setAlt(null)} disabled={action.busy}>
                      Cancel
                    </Button>
                    <Button onClick={propose} disabled={action.busy || alt.notes.trim() === ''}>
                      Propose alternative
                    </Button>
                  </div>
                  {alt.notes.trim() === '' && <p className="text-xs text-muted-foreground">Add a note that explains the alternative.</p>}
                </>
              ) : (
                <Button variant="outline" onClick={() => setAlt({ family: l.family, size: l.size, material: l.material, length_mm: l.length_mm, quantity: l.quantity, notes: '' })}>
                  Propose alternative
                </Button>
              )}
            </section>
          )}
        </main>

        <aside className="space-y-4">
          <section className="rounded-md border bg-card p-3 text-sm">
            <h2 className="mb-2 text-sm font-semibold">Request context</h2>
            {request ? (
              <>
                <p>
                  <Link to="/requests/$requestId" params={{ requestId: request.id }} className="text-primary underline">
                    {request.ref} · {request.title}
                  </Link>
                </p>
                <p className="text-muted-foreground">{customerName}</p>
                <p className="mt-2 text-muted-foreground">
                  Quotation: {latest ? `R${latest.revision_no} ${latest.status}${latest.valid_until ? `, valid until ${date(latest.valid_until)}` : ''}` : 'no revision yet'}
                </p>
                <h3 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Other lines</h3>
                {otherLines.length === 0 ? (
                  <p className="text-muted-foreground">None.</p>
                ) : (
                  <ul className="space-y-1">
                    {otherLines.map((x) => (
                      <li key={x.id} className="flex items-center gap-2">
                        <span>
                          L{x.line_no} {configLabel(x)}
                        </span>
                        <StatusBadge kind="commercial" value={x.commercial_status} />
                        <StatusBadge kind="technical" value={x.technical_status} />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Loading…</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
