// Screen 2 — request workspace. Spec 6.4.

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LineComposer } from '@/components/LineComposer'
import { ReadyMark, StatusBadge } from '@/components/StatusBadge'
import { Timeline } from '@/components/Timeline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { isExecutable, marginOf, type Line } from '@/domain/types'
import { useAction } from '@/lib/actions'
import { configDetail, configLabel, date, money, pct, sumAsShown, unitMoney } from '@/lib/format'
import { useEvents, useQuotationLines, useRequestAggregate, type RequestAggregateData } from '@/lib/queries'
import { useServices } from '@/lib/services'
import { useSession } from '@/lib/session'
import { reopenLine, withdrawLine } from '@/services/lines'
import { convertToOrder, holdRequest, rejectRequest, reopenRequest } from '@/services/requests'
import { forceEvent, type ForceTarget } from '@/services/override'
import type { ForceableEventName } from '@/domain/override'
import { OverrideDialog, ReasonDialog } from '@/components/RequestActionDialogs'
import { prepareRevision } from '@/services/revisions'
import { latestSentRevision } from '@/domain/readiness'

export const Route = createFileRoute('/requests/$requestId/')({
  component: Workspace,
  // ?line=N opens the composer on line N (the step player's "Open screen" for A3 and B8).
  validateSearch: (search: Record<string, unknown>): { line?: number } => {
    const n = Number(search.line)
    return Number.isInteger(n) && n > 0 ? { line: n } : {}
  },
})

function Workspace() {
  const { requestId } = Route.useParams()
  const agg = useRequestAggregate(requestId)
  const events = useEvents(requestId)

  if (agg.isPending) return <p className="text-sm text-muted-foreground">Loading the request…</p>
  if (agg.isError) return <p className="text-sm text-destructive">The request could not be loaded: {agg.error.message}. Reload the page.</p>
  if (!agg.data) {
    return (
      <p className="text-sm">
        This request does not exist. <Link to="/requests" className="text-primary underline">Back to the list.</Link>
      </p>
    )
  }
  return <WorkspaceView data={agg.data} events={events.data ?? []} fresh={!agg.isFetching} />
}

function WorkspaceView({ data, events, fresh }: { data: RequestAggregateData; events: ReturnType<typeof useEvents>['data'] & object; fresh: boolean }) {
  const { request, lines, quotations, customer, readiness, order } = data
  const ctx = useServices()
  const navigate = useNavigate()
  const action = useAction(request.id)
  const [composer, setComposer] = useState<{ open: boolean; line: Line | null }>({ open: false, line: null })
  const { line: lineParam } = Route.useSearch()
  const { role } = useSession()
  const isSales = role === 'sales'
  // Open once per navigation; closing the composer clears the parameter. Wait for the refetch:
  // the cached request can predate the step that saved the line, and the composer keeps the
  // line it opens with.
  const openedFor = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (lineParam === undefined) {
      openedFor.current = undefined
      return
    }
    if (!fresh || openedFor.current === lineParam) return
    const target = lines.find((l) => l.line_no === lineParam)
    if (target) {
      openedFor.current = lineParam
      setComposer({ open: true, line: target })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineParam, fresh])
  const closeComposer = () => {
    setComposer({ open: false, line: null })
    if (lineParam !== undefined) navigate({ to: '/requests/$requestId', params: { requestId: request.id }, search: {}, replace: true })
  }
  const agreedIn = (l: Line) => quotations.find((q) => q.id === l.agreed_in_quotation_id)?.revision_no ?? null
  const [withdrawing, setWithdrawing] = useState<{ line: Line; reason: string } | null>(null)
  const [requestDialog, setRequestDialog] = useState<'hold' | 'reject' | 'override' | null>(null)

  const lineNoById = useMemo(() => new Map(lines.map((l) => [l.id, l.line_no])), [lines])
  const ordered = useMemo(() => orderWithAlternatives(lines), [lines])
  const latestSent = latestSentRevision(quotations)
  const draft = quotations.find((q) => q.status === 'draft')
  const isOpen = request.status === 'open'

  const openComposer = (line: Line | null) => setComposer({ open: true, line })

  const prepare = async () => {
    const q = await action.run(() => prepareRevision(ctx, request.id))
    if (q) navigate({ to: '/requests/$requestId/revisions/$n', params: { requestId: request.id, n: String(q.revision_no) } })
  }

  const convert = async () => {
    await action.run(() => convertToOrder(ctx, request.id), 'Executable order created.')
  }

  const hold = async (reason: string) => {
    const r = await action.run(() => holdRequest(ctx, request.id, reason), 'Request put on hold.')
    if (r) setRequestDialog(null)
  }

  const reject = async (reason: string) => {
    const r = await action.run(() => rejectRequest(ctx, request.id, reason), 'Request rejected.')
    if (r) setRequestDialog(null)
  }

  const reopen = async () => {
    await action.run(() => reopenRequest(ctx, request.id), 'Request reopened.')
  }

  const force = async (target: ForceTarget, name: ForceableEventName, reason: string) => {
    const r = await action.run(() => forceEvent(ctx, target, name, reason), 'Transition forced and logged as an override.')
    if (r) setRequestDialog(null)
  }

  const withdraw = async () => {
    if (!withdrawing) return
    const r = await action.run(() => withdrawLine(ctx, withdrawing.line.id, withdrawing.reason.trim()), `Line L${withdrawing.line.line_no} withdrawn.`)
    if (r) setWithdrawing(null)
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">
            {request.ref} · {request.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {customer?.name ?? 'Unknown customer'} · owner {request.owner} · received {date(request.received_at)}
            {order && (
              <>
                {' '}
                · order <span className="font-medium text-foreground">{order.order_ref}</span>
              </>
            )}
          </p>
          <div className="mt-1">
            <StatusBadge kind="request" value={request.status} />
            {request.status === 'on_hold' && request.hold_reason && <span className="ml-2 text-sm text-muted-foreground">{request.hold_reason}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOpen && (
            <>
              <SalesOnly isSales={isSales}>
                <Button variant="outline" size="sm" onClick={() => setRequestDialog('hold')} disabled={!isSales || action.busy}>
                  Put on hold
                </Button>
              </SalesOnly>
              <SalesOnly isSales={isSales}>
                <Button variant="outline" size="sm" onClick={() => setRequestDialog('reject')} disabled={!isSales || action.busy}>
                  Reject request
                </Button>
              </SalesOnly>
            </>
          )}
          {(request.status === 'on_hold' || request.status === 'rejected') && (
            <SalesOnly isSales={isSales}>
              <Button variant="outline" size="sm" onClick={reopen} disabled={!isSales || action.busy}>
                Reopen
              </Button>
            </SalesOnly>
          )}
          {request.status !== 'converted' && (
            <Button variant="ghost" size="sm" onClick={() => setRequestDialog('override')} disabled={action.busy}>
              Override…
            </Button>
          )}
          <SalesOnly isSales={isSales}>
            <Button variant="outline" size="sm" onClick={() => openComposer(null)} disabled={!isSales || !isOpen}>
              Add line
            </Button>
          </SalesOnly>
          <SalesOnly isSales={isSales}>
            <Button variant="outline" size="sm" onClick={prepare} disabled={!isSales || !isOpen || action.busy}>
              {draft ? `Open draft R${draft.revision_no}` : 'Prepare revision'}
            </Button>
          </SalesOnly>
          <SalesOnly isSales={isSales}>
          <Button variant="outline" size="sm" asChild={isSales && isOpen && latestSent !== null && latestSent.status === 'sent'} disabled={!isSales || !isOpen || latestSent === null || latestSent.status !== 'sent'}>
            {isSales && isOpen && latestSent && latestSent.status === 'sent' ? (
              <Link to="/requests/$requestId/revisions/$n" params={{ requestId: request.id, n: String(latestSent.revision_no) }} search={{ respond: true }}>
                Record customer response
              </Link>
            ) : (
              <span>Record customer response</span>
            )}
          </Button>
          </SalesOnly>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button size="sm" onClick={convert} disabled={!isSales || !isOpen || !readiness.ready || action.busy}>
                  Create executable order
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {!isSales ? 'Sales action' : readiness.ready ? 'Every open line is executable and the latest revision is valid.' : readiness.blockers.join(' ')}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      {order && (
        <section className="rounded-md border border-green-600/40 bg-green-50/60 p-3 text-sm" aria-label="Executable order" data-order-summary>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Order {order.order_ref}</h2>
            <span className="text-muted-foreground">created {date(order.created_at)} · {order.lines.length} line(s) · {money(sumAsShown(order.lines.map((l) => l.total_price)))}</span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {order.lines.map((l) => (
              <li key={l.line_id} className="tabular-nums">
                L{l.line_no} {configLabel(l)}, {configDetail(l)} · {unitMoney(l.unit_price)} / pc · total {money(l.total_price)} · agreed in R{l.agreed_in_revision_no}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 min-[1400px]:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 overflow-x-auto rounded-md border bg-card">
          {lines.length === 0 ? (
            <div className="p-6 text-sm">
              <p className="font-medium">This request has no lines.</p>
              <p className="mt-1 text-muted-foreground">Click "Add line" to enter the first configuration.</p>
            </div>
          ) : (
            <Table className="[&_td]:whitespace-normal [&_th]:whitespace-normal [&_td]:px-1.5 [&_th]:px-1.5">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No.</TableHead>
                  <TableHead>Configuration</TableHead>
                  <TableHead className="text-right">Cost estimate</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead>Commercial</TableHead>
                  <TableHead>Technical</TableHead>
                  <TableHead>Agreed in</TableHead>
                  <TableHead className="w-14 text-center">Ready</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordered.map(({ line, indent }) => {
                  const margin = marginOf(line.unit_price, line.cost_estimate, line.quantity)
                  return (
                    <TableRow key={line.id} className="h-9 cursor-pointer" onClick={() => openComposer(line)} data-line-no={line.line_no}>
                      <TableCell className="font-medium">
                        <span className={indent ? 'pl-3' : ''}>L{line.line_no}</span>
                      </TableCell>
                      <TableCell>
                        <div>{configLabel(line)}</div>
                        <div className="text-xs text-muted-foreground">
                          {configDetail(line)}
                          {indent && line.alternative_of_line_id && <span className="ml-2">(alternative of L{lineNoById.get(line.alternative_of_line_id) ?? '?'})</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(line.cost_estimate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{unitMoney(line.unit_price)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(margin)}</TableCell>
                      <TableCell>
                        <StatusBadge kind="commercial" value={line.commercial_status} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="technical" value={line.technical_status} />
                      </TableCell>
                      <TableCell className="tabular-nums">{agreedIn(line) === null ? '' : `R${agreedIn(line)}`}</TableCell>
                      <TableCell className="text-center">
                        <ReadyMark ready={isExecutable(line)} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-2 text-xs">
                          <button type="button" className="text-primary underline" onClick={() => openComposer(line)}>
                            Open
                          </button>
                          {isOpen && ['draft', 'quoted', 'negotiating'].includes(line.commercial_status) && (
                            <SalesOnly isSales={isSales}>
                              <button type="button" className="text-muted-foreground underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50" onClick={() => setWithdrawing({ line, reason: '' })} disabled={!isSales}>
                                Withdraw
                              </button>
                            </SalesOnly>
                          )}
                          {isOpen && line.commercial_status === 'declined' && (
                            <SalesOnly isSales={isSales}>
                              <button
                                type="button"
                                className="text-muted-foreground underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50"
                                onClick={() => action.run(() => reopenLine(ctx, line.id), `Line L${line.line_no} reopened.`)}
                                disabled={!isSales || action.busy}
                              >
                                Reopen line
                              </button>
                            </SalesOnly>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
          {withdrawing && (
            <div className="flex items-end gap-2 border-t p-3">
              <div className="flex-1 space-y-1 text-sm">
                <label htmlFor="withdraw-reason">Reason to withdraw L{withdrawing.line.line_no}</label>
                <Input id="withdraw-reason" value={withdrawing.reason} onChange={(e) => setWithdrawing({ ...withdrawing, reason: e.target.value })} className="h-8" />
              </div>
              <Button size="sm" variant="outline" onClick={() => setWithdrawing(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={withdraw} disabled={withdrawing.reason.trim() === '' || action.busy}>
                Withdraw line
              </Button>
            </div>
          )}
        </main>

        <aside className="space-y-4">
          <section className="rounded-md border bg-card p-3">
            <h2 className="mb-2 text-sm font-semibold">Order readiness</h2>
            <ul className="space-y-1 text-sm">
              {readiness.items.map((item) => (
                <li key={item.key} className="flex items-start gap-2">
                  <span className={item.ok ? 'text-green-700' : 'text-muted-foreground'}>{item.ok ? '✓' : '○'}</span>
                  <span>
                    {item.label}
                    {item.blocking_line_ids.length > 0 && (
                      <span className="ml-1">
                        {item.blocking_line_ids.map((id) => {
                          const l = lines.find((x) => x.id === id)
                          return l ? (
                            <button key={id} type="button" className="mr-1 text-primary underline" onClick={() => openComposer(l)}>
                              L{l.line_no}
                            </button>
                          ) : null
                        })}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-md border bg-card p-3">
            <h2 className="mb-2 text-sm font-semibold">Revisions</h2>
            {quotations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No revision yet. Price the lines, then prepare a revision.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {[...quotations].reverse().map((q) => (
                  <li key={q.id}>
                    <RevisionRow requestId={request.id} quotation={q} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-md border bg-card p-3">
            <h2 className="mb-2 text-sm font-semibold">Timeline</h2>
            <Timeline events={events} lineNoById={lineNoById} />
          </section>
        </aside>
      </div>

      <LineComposer requestId={request.id} requestRef={request.ref} customerName={customer?.name ?? ''} line={composer.line} open={composer.open} onClose={closeComposer} />
      <ReasonDialog
        open={requestDialog === 'hold'}
        title="Put the request on hold?"
        description="Lines cannot change while the request is on hold. Reopen it to continue."
        label="Reason"
        confirmLabel="Put on hold"
        busy={action.busy}
        onClose={() => setRequestDialog(null)}
        onConfirm={hold}
      />
      <ReasonDialog
        open={requestDialog === 'reject'}
        title="Reject the request?"
        description="The request leaves the open list. It can be reopened later."
        label="Reason"
        confirmLabel="Reject request"
        busy={action.busy}
        onClose={() => setRequestDialog(null)}
        onConfirm={reject}
      />
      <OverrideDialog open={requestDialog === 'override'} request={request} lines={lines} busy={action.busy} onClose={() => setRequestDialog(null)} onConfirm={force} />
    </div>
  )
}

function RevisionRow({ requestId, quotation }: { requestId: string; quotation: RequestAggregateData['quotations'][number] }) {
  const snapshot = useQuotationLines(quotation.status === 'draft' ? null : quotation.id)
  const total = snapshot.data ? sumAsShown(snapshot.data.map((l) => l.total_price)) : undefined
  return (
    <Link to="/requests/$requestId/revisions/$n" params={{ requestId, n: String(quotation.revision_no) }} className="flex items-center justify-between rounded px-1 py-0.5 hover:bg-accent">
      <span>
        R{quotation.revision_no} <StatusBadge kind="quotation" value={quotation.status} />
        {quotation.sent_at && <span className="ml-1 text-xs text-muted-foreground">sent {date(quotation.sent_at)}</span>}
      </span>
      <span className="tabular-nums">{quotation.status === 'draft' ? 'live' : money(total)}</span>
    </Link>
  )
}

/** Original lines in order, each alternative right under its original with an indent. */
function orderWithAlternatives(lines: Line[]): Array<{ line: Line; indent: boolean }> {
  const byOriginal = new Map<string, Line[]>()
  for (const l of lines) {
    if (l.alternative_of_line_id) {
      const list = byOriginal.get(l.alternative_of_line_id) ?? []
      list.push(l)
      byOriginal.set(l.alternative_of_line_id, list)
    }
  }
  const out: Array<{ line: Line; indent: boolean }> = []
  const placed = new Set<string>()
  const place = (l: Line, indent: boolean) => {
    if (placed.has(l.id)) return
    placed.add(l.id)
    out.push({ line: l, indent })
    for (const alt of byOriginal.get(l.id) ?? []) place(alt, true)
  }
  for (const l of lines) if (!l.alternative_of_line_id) place(l, false)
  for (const l of lines) place(l, Boolean(l.alternative_of_line_id))
  return out
}

/** Wraps a Sales-only action: for Operations the button is disabled and the tooltip says why. The role switch is a view, not access control. */
function SalesOnly({ isSales, children }: { isSales: boolean; children: ReactNode }) {
  if (isSales) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{children}</span>
      </TooltipTrigger>
      <TooltipContent>Sales action</TooltipContent>
    </Tooltip>
  )
}
