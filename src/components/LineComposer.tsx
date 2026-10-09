// Screen 3 — line composer, a side panel on the workspace. Spec 6.5.

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { MARGIN_FLOOR, pricePerTonne } from '@/domain/references'
import { marginOf, type FeasibilityCheck, type Line } from '@/domain/types'
import { useAction } from '@/lib/actions'
import { money, number, pct, unitMoney } from '@/lib/format'
import { useConfigurationInsight } from '@/lib/queries'
import { repo } from '@/lib/repo'
import { useServices } from '@/lib/services'
import { addLineToRequest } from '@/services/createRequest'
import { requestCheck, saveLine } from '@/services/lines'
import { ConfigurationFields, DEFAULT_CONFIGURATION, type ConfigurationDraft } from './ConfigurationFields'
import { PriceMemoBlock } from './PriceMemoBlock'
import { StatusBadge } from './StatusBadge'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

type Props = {
  requestId: string
  /** The request's own lines are left out of the references. */
  requestRef: string
  customerName: string
  /** Null for a new line. */
  line: Line | null
  open: boolean
  onClose: () => void
}

const EDITABLE = new Set(['draft', 'negotiating'])

export function LineComposer({ requestId, requestRef, customerName, line, open, onClose }: Props) {
  const ctx = useServices()
  const action = useAction(requestId)
  const [draft, setDraft] = useState<ConfigurationDraft>(DEFAULT_CONFIGURATION)
  const [unitPrice, setUnitPrice] = useState<string>('')
  const [showMore, setShowMore] = useState(false)
  const [showFormula, setShowFormula] = useState(false)
  const [checkReason, setCheckReason] = useState('')
  const [memo, setMemo] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (line) {
      setDraft({ family: line.family, size: line.size, material: line.material, length_mm: line.length_mm, quantity: line.quantity, notes: line.notes })
      setUnitPrice(line.unit_price === null ? '' : String(line.unit_price))
      setMemo(line.price_memo)
    } else {
      setDraft(DEFAULT_CONFIGURATION)
      setUnitPrice('')
      setMemo(null)
    }
    setShowMore(false)
    setShowFormula(false)
    setCheckReason('')
  }, [open, line])

  const editable = line === null || EDITABLE.has(line.commercial_status)
  const config = useMemo(() => ({ family: draft.family, size: draft.size, material: draft.material, length_mm: draft.length_mm, quantity: draft.quantity }), [draft])
  const insight = useConfigurationInsight(open ? config : null, customerName, requestRef)
  const checks = useQuery({
    queryKey: ['checks', line?.id ?? ''],
    queryFn: () => repo.listChecks({ line_id: line?.id ?? '' }),
    enabled: open && line !== null,
  })

  const price = unitPrice === '' ? null : Number(unitPrice)
  const cost = insight.data?.cost?.total ?? line?.cost_estimate ?? null
  const margin = marginOf(price, cost, config.quantity)
  const belowFloor = margin !== null && margin < MARGIN_FLOOR
  const top = insight.data?.references ?? []
  const shown = showMore ? top : top.slice(0, 5)
  const latestCheck: FeasibilityCheck | undefined = checks.data?.[checks.data.length - 1]

  const save = async () => {
    const reference_ids = top.slice(0, 5).map((r) => r.ref_id)
    const result = await action.run(async () => {
      if (line) {
        return saveLine(ctx, line.id, { ...config, notes: draft.notes, unit_price: price, reference_ids, price_memo: memo })
      }
      const created = await addLineToRequest(ctx, requestId, { ...config, notes: draft.notes })
      if (price !== null || memo !== null) await saveLine(ctx, created.id, { unit_price: price, reference_ids, price_memo: memo })
      return created
    }, line ? `Line L${line.line_no} saved.` : 'Line added.')
    if (result) onClose()
  }

  const keepMemo = async (text: string) => {
    if (line) {
      const r = await action.run(() => saveLine(ctx, line.id, { price_memo: text }), 'Memo kept on the line.')
      if (r) setMemo(text)
    } else {
      setMemo(text)
    }
  }

  const discardMemo = async () => {
    if (line) {
      const r = await action.run(() => saveLine(ctx, line.id, { price_memo: null }), 'Memo removed.')
      if (r) setMemo(null)
    } else {
      setMemo(null)
    }
  }

    const askCheck = async () => {
    if (!line) return
    const r = await action.run(() => requestCheck(ctx, line.id, checkReason.trim()), 'Technical check requested.')
    if (r) setCheckReason('')
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:w-[440px] sm:max-w-[440px]">
        <SheetHeader>
          <SheetTitle>{line ? `Line L${line.line_no}` : 'New line'}</SheetTitle>
          <SheetDescription>
            {line ? (
              <span className="flex gap-2">
                <StatusBadge kind="commercial" value={line.commercial_status} />
                <StatusBadge kind="technical" value={line.technical_status} />
              </span>
            ) : (
              'Configure the line, read the references, set a price.'
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6 text-[15px]">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">1. Configuration</h3>
            {!editable && <p className="text-xs text-muted-foreground">{/^[aeiou]/.test(line?.commercial_status ?? '') ? 'An' : 'A'} {line?.commercial_status} line is read only. Record the customer reply to change it, or withdraw it.</p>}
            <ConfigurationFields value={draft} onChange={setDraft} disabled={!editable} idPrefix="composer" />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">2. Feasibility</h3>
            {insight.data && insight.data.pre_check.hits.length > 0 ? (
              <ul className="space-y-1">
                {insight.data.pre_check.hits.map((h) => (
                  <li key={h.rule_id} className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-sm text-amber-900">
                    <span className="font-medium">{h.rule_id}</span> — {h.note}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{insight.data?.pre_check.new_configuration ? 'New configuration: no comparable quotation in history. A check is requested at creation.' : 'No rule hit.'}</p>
            )}
            {latestCheck && (
              <div className="rounded border bg-muted/40 px-2 py-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <span>Check</span>
                  <StatusBadge kind="check" value={latestCheck.status} />
                  <span className="text-xs text-muted-foreground">by {latestCheck.decided_by ?? latestCheck.requested_by}</span>
                </div>
                {latestCheck.notes && <p className="mt-1 text-muted-foreground">{latestCheck.notes}</p>}
              </div>
            )}
            {line && line.technical_status !== 'pending' && (
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="composer-check-reason">Reason for a technical check</Label>
                  <Input id="composer-check-reason" value={checkReason} onChange={(e) => setCheckReason(e.target.value)} placeholder="Why Operations should look at this line" className="h-8" />
                </div>
                <Button variant="outline" size="sm" onClick={askCheck} disabled={action.busy || checkReason.trim() === ''}>
                  Request technical check
                </Button>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">3. Cost estimate</h3>
            <p className="text-lg font-semibold tabular-nums">{money(cost)}</p>
            <button type="button" className="text-xs text-primary underline" onClick={() => setShowFormula((v) => !v)}>
              {showFormula ? 'Hide how this estimate is computed' : 'How this estimate is computed'}
            </button>
            {showFormula && (
              <div className="rounded border bg-muted/40 p-2 text-xs text-muted-foreground">
                <p className="mb-1">cost = quantity × length_m × kg_per_m × eur_per_kg(material, date) × quantity_factor × (1 + processing)</p>
                <p className="font-mono">{insight.data?.cost?.formula ?? 'Unknown configuration.'}</p>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">4. References</h3>
            {insight.isPending && <p className="text-sm text-muted-foreground">Ranking past quotations…</p>}
            {insight.data && top.length === 0 && <p className="text-sm text-muted-foreground">No comparable quotations yet. This is a new configuration.</p>}
            {insight.data && (
              <p className="text-xs text-muted-foreground">
                {insight.data.reference_count} quotation(s) with the same family, size and material in history.
              </p>
            )}
            <ul className="space-y-2">
              {shown.map((r) => (
                <li key={r.ref_id} className="rounded border bg-card p-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.ref_id}</span>
                    <span className={r.outcome === 'WON' ? 'rounded bg-green-100 px-1.5 text-xs text-green-800' : 'rounded bg-red-50 px-1.5 text-xs text-red-700'}>{r.outcome}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {r.date} · {r.customer} · {r.family} {r.size} {r.material} · {number(r.quantity)} pcs
                  </div>
                  <div className="tabular-nums">
                    {unitMoney(r.unit_price)} / pc · {pricePerTonne(r) === null ? 'length unknown' : `${money(pricePerTonne(r))} / t`} · margin {pct(r.margin)} · {r.revision} revision(s)
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-xs">
                    <Chip label="Customer" value={r.score.customer} />
                    <Chip label={r.score.product_adjacent ? 'Product (next size)' : 'Product'} value={r.score.product} />
                    <Chip label="Material" value={r.score.material} />
                    <Chip label="Quantity" value={r.score.quantity} />
                    <Chip label="Recency" value={r.score.recency} />
                    <span className="ml-auto font-medium">{r.score.total.toFixed(0)}</span>
                  </div>
                </li>
              ))}
            </ul>
            {top.length > 5 && (
              <button type="button" className="text-xs text-primary underline" onClick={() => setShowMore((v) => !v)}>
                {showMore ? 'Show less' : `Show more (${Math.min(top.length, 10)})`}
              </button>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">5. Price</h3>
            {insight.data?.price ? (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm tabular-nums">
                <dt className="text-muted-foreground">Suggested unit price</dt>
                <dd>
                  {unitMoney(insight.data.price.unit.suggested)}{' '}
                  <span className="text-xs text-muted-foreground">({insight.data.price.median_won_margin === null ? '20.0% margin, no won reference' : `median won margin ${pct(insight.data.price.median_won_margin)}, ${insight.data.price.won_count} won`})</span>
                </dd>
                <dt className="text-muted-foreground">Range from won references</dt>
                <dd>{insight.data.price.unit.range ? `${unitMoney(insight.data.price.unit.range[0])} – ${unitMoney(insight.data.price.unit.range[1])}` : 'No won reference'}</dd>
                <dt className="text-muted-foreground">Floor (15 percent)</dt>
                <dd>{unitMoney(insight.data.price.unit.floor)}</dd>
                <dt className="text-muted-foreground">Expected revisions</dt>
                <dd>{insight.data.expected_revisions ?? '—'}</dd>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No price suggestion without a cost estimate.</p>
            )}
            {insight.data && (
              <figure>
                <figcaption className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Win rate by margin band, {draft.family}, all history</span>
                  <span>{insight.data.bands.reduce((s, b) => s + b.n, 0)} quotation(s)</span>
                </figcaption>
                {insight.data.bands.every((b) => b.n === 0) ? (
                  <p className="text-xs text-muted-foreground">No quotation for {draft.family} in history yet. The bands fill as quotations are sent and answered.</p>
                ) : (
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-green-700/50" style={{ top: `${100 - 60 * 0.64}%` }} aria-hidden />
                    <div className="flex items-end gap-2" role="list" aria-label="Win rate by margin band">
                      {insight.data.bands.map((b) => {
                        const here = margin !== null && margin >= b.from && (b.to >= 0.26 ? margin <= b.to : margin < b.to)
                        return (
                          <div key={b.label} role="listitem" className={cn('flex flex-1 flex-col items-center gap-0.5 rounded px-1 text-xs', here && 'bg-accent ring-1 ring-primary/40')} aria-label={`${b.label}: ${b.win_rate === null ? 'no data' : `${pct(b.win_rate, 0)} won`}, ${b.won} won of ${b.n}${here ? ', your price is in this band' : ''}`}>
                            <span className="tabular-nums">{b.win_rate === null ? '—' : pct(b.win_rate, 0)}</span>
                            <div className="flex h-16 w-full items-end rounded-sm bg-muted">
                              <div className={cn('w-full rounded-sm', b.n === 0 ? 'bg-transparent' : (b.win_rate ?? 0) >= 0.6 ? 'bg-primary' : 'bg-primary/50')} style={{ height: `${Math.round((b.win_rate ?? 0) * 64)}%` }} title={`${b.won} won of ${b.n}`} />
                            </div>
                            <span className={cn('text-muted-foreground', here && 'font-medium text-foreground')}>{b.label}</span>
                            <span className="text-muted-foreground tabular-nums">{b.n === 0 ? 'no data' : `${b.won} of ${b.n}`}</span>
                          </div>
                        )
                      })}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">Dashed line: the 60 percent win-rate target. A highlighted band holds your unit price. Bars in full colour reach the target.</p>
                  </div>
                )}
              </figure>
            )}
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="composer-price">Unit price (EUR)</Label>
                <Input id="composer-price" type="number" min={0} step={0.01} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} disabled={!editable} className="h-8" />
              </div>
              <div className="pb-1 text-sm tabular-nums">
                Margin <span className="font-medium">{pct(margin)}</span>
              </div>
              {insight.data?.price && editable && (
                <Button variant="outline" size="sm" onClick={() => setUnitPrice((Math.round(insight.data!.price!.unit.suggested * 100) / 100).toFixed(2))}>
                  Use suggested
                </Button>
              )}
            </div>
            {belowFloor && <p className="text-sm text-destructive">Below the 15 percent floor. A sales lead approves.</p>}
          </section>

          <PriceMemoBlock config={config} customer={customerName} insight={insight.data ?? null} memo={memo} editable={editable} requestId={requestId} lineId={line?.id ?? null} onKeep={keepMemo} onDiscard={discardMemo} busy={action.busy} />

          {editable && (
            <section className="space-y-2">
              {action.error && <p className="text-sm text-destructive">{action.error}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose} disabled={action.busy}>
                  Cancel
                </Button>
                <Button onClick={save} disabled={action.busy || draft.quantity <= 0 || draft.length_mm <= 0}>
                  {line ? 'Save line' : 'Add line'}
                </Button>
              </div>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Chip({ label, value }: { label: string; value: number }) {
  return (
    <span className={value > 0 ? 'rounded bg-accent px-1.5 py-0.5' : 'rounded bg-muted px-1.5 py-0.5 text-muted-foreground'}>
      {label} {value.toFixed(0)}
    </span>
  )
}
