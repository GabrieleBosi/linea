// Screen 5 — quotation revision and customer response. Spec 6.7.

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState, type ReactNode } from 'react'
import type { CoverInput } from '@/ai/steps/cover_text'
import { CoverTextBlock } from '@/components/CoverTextBlock'
import { ResponseDialog } from '@/components/ResponseDialog'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { isExpired } from '@/domain/readiness'
import { marginOf, type Line, type QuotationLine } from '@/domain/types'
import { useAction } from '@/lib/actions'
import { configDetail, configLabel, date, money, number, pct, sumAsShown, unitMoney } from '@/lib/format'
import { useQuotationLines, useRequestAggregate } from '@/lib/queries'
import { useServices } from '@/lib/services'
import { useSession } from '@/lib/session'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { addDays, revisionLines } from '@/services/context'
import { saveCoverText, sendRevision, VALIDITY_DAYS } from '@/services/revisions'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/requests/$requestId/revisions/$n')({
  component: RevisionPage,
  validateSearch: (search: Record<string, unknown>): { respond?: boolean } => (search.respond === true || search.respond === 'true' ? { respond: true } : {}),
})

type RowView = {
  key: string
  line_no: number
  family: string
  size: number
  material: string
  length_mm: number
  quantity: number
  unit_price: number | null
  total_price: number | null
  margin: number | null
  subject_to_feasibility: boolean
  alternative_of_line_no: number | null
  isNew: boolean
  changed: Set<'quantity' | 'config' | 'unit_price' | 'total_price'>
  previous: { quantity: number; config: string; unit_price: number; total_price: number } | null
}

function RevisionPage() {
  const { requestId, n } = Route.useParams()
  const { respond } = Route.useSearch()
  const navigate = useNavigate()
  const ctx = useServices()
  const agg = useRequestAggregate(requestId)
  const revisionNo = Number(n)
  const quotation = agg.data?.quotations.find((q) => q.revision_no === revisionNo) ?? null
  const previous = agg.data?.quotations.find((q) => q.revision_no === revisionNo - 1) ?? null
  const snapshot = useQuotationLines(quotation && quotation.status !== 'draft' ? quotation.id : null)
  const prevSnapshot = useQuotationLines(previous && previous.status !== 'draft' ? previous.id : null)
  const action = useAction(requestId)
  const isSales = useSession().role === 'sales'
  const [showDiff, setShowDiff] = useState(false)
  // A sent revision reads its own snapshot; the diff also needs the previous one.
  const snapshotsReady =
    (quotation === null || quotation.status === 'draft' || snapshot.data !== undefined) && (previous === null || previous.status === 'draft' || prevSnapshot.data !== undefined)
  // A failed read ends the loading state with a message instead of "Loading…" for ever.
  const snapshotError = snapshot.error ?? prevSnapshot.error
  const [dialogOpen, setDialogOpen] = useState(Boolean(respond))

  const lineNoById = useMemo(() => new Map((agg.data?.lines ?? []).map((l) => [l.id, l.line_no])), [agg.data])

  const rows: RowView[] = useMemo(() => {
    if (!agg.data || !quotation) return []
    const prev = new Map((prevSnapshot.data ?? []).map((s) => [s.line_id, s]))
    const build = (r: { line_id: string } & Pick<QuotationLine, 'line_no' | 'family' | 'size' | 'material' | 'length_mm' | 'quantity'> & { unit_price: number | null; total_price: number | null; margin: number | null; subject_to_feasibility: boolean }, line: Line | undefined): RowView => {
      const p = prev.get(r.line_id)
      const changed = new Set<'quantity' | 'config' | 'unit_price' | 'total_price'>()
      if (p) {
        if (p.quantity !== r.quantity) changed.add('quantity')
        if (p.family !== r.family || p.size !== r.size || p.material !== r.material || p.length_mm !== r.length_mm) changed.add('config')
        if (p.unit_price !== r.unit_price) changed.add('unit_price')
        if (p.total_price !== r.total_price) changed.add('total_price')
      }
      return {
        key: r.line_id,
        line_no: r.line_no,
        family: r.family,
        size: r.size,
        material: r.material,
        length_mm: r.length_mm,
        quantity: r.quantity,
        unit_price: r.unit_price,
        total_price: r.total_price,
        margin: r.margin,
        subject_to_feasibility: r.subject_to_feasibility,
        alternative_of_line_no: line?.alternative_of_line_id ? (lineNoById.get(line.alternative_of_line_id) ?? null) : null,
        isNew: previous !== null && !p,
        changed,
        previous: p ? { quantity: p.quantity, config: `${p.family} ${p.size} ${p.material} ${p.length_mm} mm`, unit_price: p.unit_price, total_price: p.total_price } : null,
      }
    }
    if (quotation.status === 'draft') {
      return revisionLines(agg.data.lines).map((l) =>
        build(
          {
            line_id: l.id,
            line_no: l.line_no,
            family: l.family,
            size: l.size,
            material: l.material,
            length_mm: l.length_mm,
            quantity: l.quantity,
            unit_price: l.unit_price,
            total_price: l.unit_price === null ? null : Math.round(l.unit_price * l.quantity * 100) / 100,
            margin: marginOf(l.unit_price, l.cost_estimate, l.quantity),
            subject_to_feasibility: l.technical_status === 'pending',
          },
          l,
        ),
      )
    }
    return (snapshot.data ?? []).map((s) => build(s, agg.data?.lines.find((l) => l.id === s.line_id)))
  }, [agg.data, quotation, previous, snapshot.data, prevSnapshot.data, lineNoById])

  if (agg.isPending) return <p className="text-sm text-muted-foreground">Loading the revision…</p>
  if (!agg.data || !quotation) {
    return (
      <p className="text-sm">
        This revision does not exist.{' '}
        <Link to="/requests/$requestId" params={{ requestId }} className="text-primary underline">
          Back to the request.
        </Link>
      </p>
    )
  }
  const { request, lines, quotations } = agg.data
  const agreedEarlier = lines.filter((l) => l.commercial_status === 'agreed' && l.agreed_in_quotation_id !== quotation.id && quotations.some((q) => q.id === l.agreed_in_quotation_id && q.revision_no < revisionNo))
  const total = sumAsShown(rows.map((r) => r.total_price ?? 0))
  const expired = isExpired(quotation, ctx.today())

  const send = async () => {
    await action.run(() => sendRevision(ctx, quotation.id), `Revision R${quotation.revision_no} marked as sent.`)
  }

  // Cover text input (P1). A draft takes the validity date it would get if sent today.
  const coverInput: CoverInput | null =
    rows.length > 0 && rows.every((r) => r.unit_price !== null && r.total_price !== null)
      ? {
          sender: 'Ferralba Steel',
          customer: agg.data.customer?.name ?? 'the customer',
          contact: null,
          revision: {
            revision_no: quotation.revision_no,
            lines: rows.map((r) => ({
              line_no: r.line_no,
              family: r.family,
              size: r.size,
              material: r.material,
              length_mm: r.length_mm,
              quantity: r.quantity,
              unit_price: r.unit_price as number,
              total_price: r.total_price as number,
              subject_to_feasibility: r.subject_to_feasibility,
            })),
          },
          diff_from_previous: rows.flatMap((r) => {
            if (r.isNew) return [{ line_no: r.line_no, change: 'new line' }]
            if (!r.previous || r.changed.size === 0) return []
            const parts: string[] = []
            if (r.changed.has('config')) parts.push(`configuration ${r.previous.config} → ${configLabel({ family: r.family as Line['family'], size: r.size, material: r.material as Line['material'], length_mm: r.length_mm, quantity: r.quantity })}`)
            if (r.changed.has('quantity')) parts.push(`quantity ${r.previous.quantity} → ${r.quantity}`)
            if (r.changed.has('unit_price')) parts.push(`unit price ${r.previous.unit_price.toFixed(2)} → ${(r.unit_price as number).toFixed(2)} EUR`)
            return [{ line_no: r.line_no, change: parts.join(', ') }]
          }),
          valid_until: quotation.status === 'draft' || !quotation.valid_until ? addDays(ctx.today(), VALIDITY_DAYS) : quotation.valid_until,
          lines_subject_to_feasibility: rows.filter((r) => r.subject_to_feasibility).map((r) => r.line_no),
          delivery_date: request.requested_delivery_date,
        }
      : null

  const keepCover = async (text: string) => {
    await action.run(() => saveCoverText(ctx, quotation.id, text), 'Cover text kept on the revision.')
  }
  const removeCover = async () => {
    await action.run(() => saveCoverText(ctx, quotation.id, null), 'Cover text removed.')
  }

  const mark = (r: RowView, field: 'quantity' | 'config' | 'unit_price' | 'total_price') => (showDiff && (r.changed.has(field) || r.isNew) ? 'bg-amber-50' : '')
  /** The previous value, shown before an arrow when the diff is on and the cell changed. */
  const was = (r: RowView, field: 'quantity' | 'config' | 'unit_price' | 'total_price', text: string) =>
    showDiff && r.previous && r.changed.has(field) ? <span className="mr-1 text-muted-foreground line-through">{text}</span> : null

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link to="/requests/$requestId" params={{ requestId }} className="text-primary underline">
              {request.ref} · {request.title}
            </Link>
          </p>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            Revision R{quotation.revision_no} <StatusBadge kind="quotation" value={quotation.status} />
            {expired && <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">expired</span>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {quotation.status === 'draft' ? 'Draft: a live view of the open lines that are not agreed.' : `Sent ${date(quotation.sent_at)} · valid until ${date(quotation.valid_until)}`} · total{' '}
            <span className="font-medium text-foreground tabular-nums">{money(total)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {previous && (
            // Enabled once both snapshots are loaded: a click before that turned the diff on with
            // nothing to mark yet, and the second click turned it off again.
            <Button variant="outline" size="sm" onClick={() => setShowDiff((v) => !v)} aria-pressed={showDiff} disabled={!snapshotsReady}>
              {snapshotError ? `Changes from R${previous.revision_no} not available` : !snapshotsReady ? `Loading changes from R${previous.revision_no}…` : showDiff ? `Hide changes from R${previous.revision_no}` : `Show changes from R${previous.revision_no}`}
            </Button>
          )}
          {quotation.status === 'draft' && (
            <SalesOnly isSales={isSales}>
              <Button size="sm" onClick={send} disabled={!isSales || action.busy || request.status !== 'open'}>
                Mark as sent
              </Button>
            </SalesOnly>
          )}
          {quotation.status === 'sent' && (
            <SalesOnly isSales={isSales}>
              <Button size="sm" onClick={() => setDialogOpen(true)} disabled={!isSales || request.status !== 'open'}>
                Record customer response
              </Button>
            </SalesOnly>
          )}
        </div>
      </header>

      {snapshotError && <p className="text-sm text-destructive">The revision lines could not be read: {snapshotError.message}. Reload the page to try again.</p>}

      <div className="rounded-md border bg-card">
        {rows.length === 0 && snapshotError ? (
          <p className="p-6 text-sm text-muted-foreground">No lines to show. Reload the page to try again.</p>
        ) : rows.length === 0 && !snapshotsReady ? (
          <p className="p-6 text-sm text-muted-foreground">Loading the revision lines…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">This revision has no line. Add or reopen a line in the workspace.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">No.</TableHead>
                <TableHead>Configuration</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key} className="h-9">
                  <TableCell className="font-medium">L{r.line_no}</TableCell>
                  <TableCell className={mark(r, 'config')}>
                    <div>{configLabel({ family: r.family as Line['family'], size: r.size, material: r.material as Line['material'], length_mm: r.length_mm, quantity: r.quantity })}</div>
                    <div className="text-xs text-muted-foreground">
                      {number(r.length_mm)} mm
                      {r.alternative_of_line_no !== null && <span className="ml-2">alternative of L{r.alternative_of_line_no}</span>}
                      {showDiff && r.previous && r.changed.has('config') && <span className="ml-2 line-through">{r.previous.config}</span>}
                    </div>
                  </TableCell>
                  <TableCell className={cn('text-right tabular-nums', mark(r, 'quantity'))}>
                    {was(r, 'quantity', number(r.previous?.quantity))}
                    {number(r.quantity)}
                  </TableCell>
                  <TableCell className={cn('text-right tabular-nums', mark(r, 'unit_price'))}>
                    {was(r, 'unit_price', unitMoney(r.previous?.unit_price))}
                    {unitMoney(r.unit_price)}
                  </TableCell>
                  <TableCell className={cn('text-right tabular-nums', mark(r, 'total_price'))}>
                    {was(r, 'total_price', money(r.previous?.total_price))}
                    {money(r.total_price)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{pct(r.margin)}</TableCell>
                  <TableCell className="text-xs">
                    {r.subject_to_feasibility && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">subject to technical validation</span>}
                    {showDiff && r.isNew && <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">new in R{quotation.revision_no}</span>}
                    {r.unit_price === null && <span className="ml-1 text-destructive">no price yet</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {agreedEarlier.length > 0 && (
          <div className="border-t bg-muted/40 p-3 text-sm text-muted-foreground">
            {agreedEarlier.map((l) => {
              const q = quotations.find((x) => x.id === l.agreed_in_quotation_id)
              return (
                <div key={l.id}>
                  L{l.line_no} {configLabel(l)}, {configDetail(l)} — agreed in R{q?.revision_no ?? '?'}, not re-priced.
                </div>
              )
            })}
          </div>
        )}
      </div>

      <CoverTextBlock
        input={coverInput}
        requestId={requestId}
        coverText={quotation.cover_text}
        editable={quotation.status === 'draft' && request.status === 'open'}
        busy={action.busy}
        onKeep={keepCover}
        onRemove={removeCover}
      />

      <ResponseDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false)
          navigate({ to: '/requests/$requestId/revisions/$n', params: { requestId, n }, search: {}, replace: true })
        }}
        requestId={requestId}
        quotation={quotation}
        snapshot={snapshot.data ?? []}
        onApplied={(draftRevisionNo) => {
          setDialogOpen(false)
          if (draftRevisionNo !== null) navigate({ to: '/requests/$requestId/revisions/$n', params: { requestId, n: String(draftRevisionNo) }, search: {} })
          else navigate({ to: '/requests/$requestId', params: { requestId } })
        }}
      />
    </div>
  )
}

/** For Operations a Sales action is disabled with the tooltip "Sales action". The role switch is a view, not access control. */
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
