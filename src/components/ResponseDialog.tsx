// Customer response dialog. Spec 6.7 and 4.3: paste the reply, interpret it (AI draft),
// edit the decisions, apply. The manual path works without the AI.

import { useEffect, useMemo, useState } from 'react'
import type { ReplyOutput } from '@/ai/steps/reply_interpret'
import type { AiMode, Check } from '@/ai/types'
import { AiDraftBlock } from '@/components/AiDraftBlock'
import { AiWorking } from '@/components/AiWorking'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MATERIALS, type Decision, type DecisionKind, type Interpretation, type Material, type Quotation, type QuotationLine } from '@/domain/types'
import { useAction } from '@/lib/actions'
import { callReply, recordAiDecision, useAiCall } from '@/lib/ai'
import { number, unitMoney } from '@/lib/format'
import { useServices } from '@/lib/services'
import { applyResponse, recordResponse, validateInterpretation } from '@/services/responses'

type Props = {
  open: boolean
  onClose: () => void
  requestId: string
  quotation: Quotation
  snapshot: QuotationLine[]
  onApplied: (draftRevisionNo: number | null) => void
}

/** `offCatalogMaterial`: a material the AI draft read that the catalog does not have; shown as a flag, never applied. */
type Row = { line_no: number; decision: DecisionKind; quantity: string; length_mm: string; material: string; size: string; target_unit_price: string; note: string; confidence: number | null; offCatalogMaterial?: string }

const isMaterial = (v: string): v is Material => (MATERIALS as readonly string[]).includes(v)
const NO_CHANGE = 'none'

type Draft = { ai_run_id: string; mode: AiMode; model: string; latency_ms: number; checks: Check[]; output: ReplyOutput; rows: Row[] }

const KINDS: DecisionKind[] = ['accept', 'change', 'reject', 'unclear']

function emptyRow(line_no: number): Row {
  return { line_no, decision: 'accept', quantity: '', length_mm: '', material: '', size: '', target_unit_price: '', note: '', confidence: null }
}

function rowsFromOutput(snapshot: QuotationLine[], o: ReplyOutput): Row[] {
  return snapshot.map((s) => {
    const d = o.decisions.find((x) => x.line_no === s.line_no)
    if (!d) return { ...emptyRow(s.line_no), decision: 'unclear', note: 'No decision in the AI draft for this line.' }
    const n = (v: number | null) => (v === null ? '' : String(v))
    const read = d.changes.material?.trim().toUpperCase() ?? ''
    return {
      line_no: s.line_no,
      decision: d.decision,
      quantity: n(d.changes.quantity),
      length_mm: n(d.changes.length_mm),
      material: isMaterial(read) ? read : '',
      ...(read !== '' && !isMaterial(read) ? { offCatalogMaterial: d.changes.material ?? '' } : {}),
      size: n(d.changes.size),
      target_unit_price: n(d.changes.target_unit_price),
      note: d.source_span,
      confidence: d.confidence,
    }
  })
}

function toInterpretation(rows: Row[], needs_clarification: string[]): Interpretation {
  const decisions: Decision[] = rows.map((r) => ({
    line_no: r.line_no,
    decision: r.decision,
    changes: {
      quantity: r.decision === 'change' && r.quantity !== '' ? Number(r.quantity) : null,
      length_mm: r.decision === 'change' && r.length_mm !== '' ? Number(r.length_mm) : null,
      material: r.decision === 'change' && isMaterial(r.material) ? r.material : null,
      size: r.decision === 'change' && r.size !== '' ? Number(r.size) : null,
      target_unit_price: r.decision === 'change' && r.target_unit_price !== '' ? Number(r.target_unit_price) : null,
    },
    source_span: r.note,
    confidence: r.confidence ?? 1,
  }))
  const kinds = new Set(decisions.map((d) => d.decision))
  const overall: Interpretation['overall'] =
    kinds.size === 1 && kinds.has('accept') ? 'accept_all' : kinds.size === 1 && kinds.has('reject') ? 'reject_all' : kinds.size === 1 && kinds.has('unclear') ? 'unclear' : 'partial'
  const unclearNotes = decisions.filter((d) => d.decision === 'unclear').map((d) => d.source_span).filter(Boolean)
  return { decisions, overall, needs_clarification: [...new Set([...needs_clarification, ...unclearNotes])] }
}

export function ResponseDialog({ open, onClose, requestId, quotation, snapshot, onApplied }: Props) {
  const ctx = useServices()
  const action = useAction(requestId)
  const ai = useAiCall(callReply)
  const [reply, setReply] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [needs, setNeeds] = useState<string[]>([])
  const [aiError, setAiError] = useState<{ error: string; next: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setReply('')
    setRows(snapshot.map((s) => emptyRow(s.line_no)))
    setDraft(null)
    setNeeds([])
    setAiError(null)
  }, [open, snapshot])

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const interpret = async () => {
    setAiError(null)
    const r = await ai.run({
      reply_text: reply,
      revision: {
        revision_no: quotation.revision_no,
        lines: snapshot.map((s) => ({ line_no: s.line_no, family: s.family, size: s.size, material: s.material, length_mm: s.length_mm, quantity: s.quantity, unit_price: s.unit_price, total_price: s.total_price })),
      },
      request_id: requestId,
    })
    if (!r.ok) {
      setAiError({ error: r.error, next: r.next })
      return
    }
    const next = rowsFromOutput(snapshot, r.output)
    setDraft({ ai_run_id: r.ai_run_id, mode: r.mode, model: r.model, latency_ms: r.latency_ms, checks: r.checks, output: r.output, rows: next })
    setRows(next)
    setNeeds([...r.output.needs_clarification])
  }

  const edited = useMemo(() => (draft ? JSON.stringify(draft.rows) !== JSON.stringify(rows) : false), [draft, rows])

  const apply = async () => {
    const interpretation = toInterpretation(rows, needs)
    const result = await action.run(async () => {
      // Checked before the reply is recorded: rejected decisions leave nothing behind.
      await validateInterpretation(ctx, quotation.id, interpretation)
      const response = await recordResponse(ctx, quotation.id, reply)
      return applyResponse(ctx, response.id, interpretation, ctx.actor.name, draft ? { ai_run_id: draft.ai_run_id, mode: draft.mode } : undefined)
    }, 'Decisions applied.')
    if (result) {
      if (draft) void recordAiDecision(draft.ai_run_id, true, edited)
      onApplied(result.draft ? ((await ctx.repo.getQuotation(result.draft.id))?.revision_no ?? null) : null)
    }
  }

  const table = (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted-foreground">
        <tr>
          <th className="py-1 pr-2">Line</th>
          <th className="py-1 pr-2">Decision</th>
          <th className="py-1 pr-2">Changes</th>
          <th className="py-1 pr-2">Source span or note</th>
          <th className="py-1">Conf.</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const s = snapshot.find((x) => x.line_no === r.line_no)
          return (
            <tr key={r.line_no} className="border-t align-top" data-decision-row={r.line_no}>
              <td className="py-2 pr-2">
                <div className="font-medium">L{r.line_no}</div>
                {s && (
                  <div className="text-xs text-muted-foreground">
                    {s.family} {s.size} {s.material} · {number(s.quantity)} pcs · {unitMoney(s.unit_price)}
                  </div>
                )}
              </td>
              <td className="py-2 pr-2">
                <Select value={r.decision} onValueChange={(v) => update(i, { decision: v as DecisionKind })}>
                  <SelectTrigger aria-label={`Decision for L${r.line_no}`} size="sm" className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              <td className="py-2 pr-2">
                {r.decision === 'change' ? (
                  <div className="grid grid-cols-3 gap-1">
                    <Input aria-label={`New quantity for L${r.line_no}`} placeholder="Quantity" type="number" className="h-8" value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
                    <Input aria-label={`New length for L${r.line_no}`} placeholder="Length mm" type="number" className="h-8" value={r.length_mm} onChange={(e) => update(i, { length_mm: e.target.value })} />
                    <Input aria-label={`Target unit price for L${r.line_no}`} placeholder="Target price" type="number" className="h-8" value={r.target_unit_price} onChange={(e) => update(i, { target_unit_price: e.target.value })} />
                    <Input aria-label={`New size for L${r.line_no}`} placeholder="Size" type="number" className="h-8" value={r.size} onChange={(e) => update(i, { size: e.target.value })} />
                    <Select value={r.material === '' ? NO_CHANGE : r.material} onValueChange={(v) => update(i, { material: v === NO_CHANGE ? '' : v, offCatalogMaterial: undefined })}>
                      <SelectTrigger aria-label={`New material for L${r.line_no}`} size="sm" className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_CHANGE}>Same material</SelectItem>
                        {MATERIALS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
                {r.decision === 'change' && r.offCatalogMaterial && (
                  <p className="mt-1 rounded bg-amber-100 px-1.5 py-1 text-xs text-amber-900" data-material-flag>
                    The AI draft read the material "{r.offCatalogMaterial}", which is not in the catalog. Pick a material, keep the same one, or mark the line unclear.
                  </p>
                )}
              </td>
              <td className="py-2 pr-2">
                <Input aria-label={`Note for L${r.line_no}`} className="h-8" value={r.note} onChange={(e) => update(i, { note: e.target.value })} placeholder="What the customer said about this line" />
              </td>
              <td className="py-2 tabular-nums text-xs">{r.confidence === null ? '—' : r.confidence.toFixed(2)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[90vh] max-w-4xl overflow-y-auto"
        onKeyDown={(e) => {
          // Enter approves the focused dialog (spec 6.1), except inside the reply text area.
          const tag = (e.target as HTMLElement).tagName
          if (e.key === 'Enter' && tag !== 'TEXTAREA' && tag !== 'BUTTON' && !action.busy && reply.trim() !== '' && rows.length > 0) {
            e.preventDefault()
            void apply()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Record customer response to R{quotation.revision_no}</DialogTitle>
          <DialogDescription>Paste the reply. Interpret it with the AI or set the decisions by hand. Nothing changes until you apply them.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="reply">Customer reply</Label>
            <Textarea id="reply" rows={5} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Paste the customer email here." />
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={interpret} disabled={reply.trim() === '' || ai.state.status === 'running' || snapshot.length === 0}>
                Interpret reply
              </Button>
            </div>
          </div>
          <AiWorking step="reply_interpret" state={ai.state} onCancel={ai.cancel} replay={ai.replay} />
          {aiError && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">{aiError.error}</p>
              <p>{aiError.next}</p>
            </div>
          )}

          {draft ? (
            <AiDraftBlock title={`Decisions · ${draft.output.overall.replace('_', ' ')}`} mode={draft.mode} model={draft.model} latency_ms={draft.latency_ms} checks={draft.checks} aiRunId={draft.ai_run_id}>
              {table}
              {needs.length > 0 && (
                <div className="mt-2 rounded border bg-muted/40 p-2 text-sm">
                  <p className="font-medium">Needs clarification</p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {needs.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </AiDraftBlock>
          ) : (
            table
          )}
          {action.error && <p className="text-sm text-destructive">{action.error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={action.busy}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={action.busy || reply.trim() === '' || rows.length === 0}>
            Apply decisions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
