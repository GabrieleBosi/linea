// Screen 1 — intake. Spec 6.3. Two columns: the customer request on the left, the lines found
// on the right as an AI draft the human edits and approves. "Add lines manually instead" skips the AI.

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { intakeLineFlags, LOW_CONFIDENCE, type IntakeLine, type IntakeOutput } from '@/ai/steps/intake_extract'
import type { AiMode, Check } from '@/ai/types'
import { AiDraftBlock } from '@/components/AiDraftBlock'
import { AiWorking } from '@/components/AiWorking'
import { ConfigurationFields, DEFAULT_CONFIGURATION, type ConfigurationDraft } from '@/components/ConfigurationFields'
import { CustomerSelect } from '@/components/CustomerSelect'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { sizesOf } from '@/domain/catalog'
import { ruleHits } from '@/domain/preCheck'
import { FAMILIES, MATERIALS, type Family, type Material } from '@/domain/types'
import { useAction } from '@/lib/actions'
import { callIntake, recordAiDecision, useAiCall } from '@/lib/ai'
import { useCustomers } from '@/lib/queries'
import { useServices } from '@/lib/services'
import { createRequest } from '@/services/createRequest'

export const Route = createFileRoute('/requests/new')({
  component: NewRequest,
})

/** An editable row of the draft table. Family and material can still be UNKNOWN until the human fixes them. */
type DraftRow = {
  family: Family | 'UNKNOWN'
  size: number | null
  material: Material | 'UNKNOWN'
  length_mm: number | null
  quantity: number | null
  notes: string
  source_span: string
  confidence: number
}

type Draft = {
  ai_run_id: string
  mode: AiMode
  model: string
  latency_ms: number
  checks: Check[]
  original: IntakeOutput
  rows: DraftRow[]
  open_questions: string[]
  delivery_hint: string | null
  requested_delivery_date: string | null
  stated_date: string | null
}

function toRow(l: IntakeLine): DraftRow {
  return { family: l.family, size: l.size, material: l.material, length_mm: l.length_mm, quantity: l.quantity, notes: l.notes, source_span: l.source_span, confidence: l.confidence }
}

function rowFlags(r: DraftRow): string[] {
  const hits = r.family !== 'UNKNOWN' && r.size !== null && r.material !== 'UNKNOWN' && r.length_mm !== null && r.quantity !== null ? ruleHits({ family: r.family, size: r.size, material: r.material, length_mm: r.length_mm, quantity: r.quantity }) : []
  // The pre-check rule hits replace the generic "check needed" flag, so the draft says which rule and why.
  const flags = intakeLineFlags({ ...r, family: r.family, material: r.material }, hits.length).filter((f) => f !== 'check needed')
  return [...hits.map((h) => `${h.rule_id}: ${h.note.replace(/\.$/, '')}`), ...flags]
}

function rowComplete(r: DraftRow): boolean {
  return r.family !== 'UNKNOWN' && r.size !== null && r.material !== 'UNKNOWN' && r.length_mm !== null && r.length_mm > 0 && r.quantity !== null && r.quantity > 0
}

function NewRequest() {
  const ctx = useServices()
  const navigate = useNavigate()
  const customers = useCustomers()
  const action = useAction()
  const ai = useAiCall(callIntake)

  const [customerId, setCustomerId] = useState('')
  const [title, setTitle] = useState('')
  const [received, setReceived] = useState(ctx.today())
  const [sourceText, setSourceText] = useState('')
  const [manual, setManual] = useState(false)
  const [manualLines, setManualLines] = useState<ConfigurationDraft[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [aiError, setAiError] = useState<{ error: string; next: string; checks: Check[]; ai_run_id?: string } | null>(null)

  const customerName = customers.data?.find((c) => c.id === customerId)?.name ?? ''

  const extract = async () => {
    setAiError(null)
    setDraft(null)
    const r = await ai.run({ text: sourceText, customer_hint: customerName || null })
    if (!r.ok) {
      setAiError({ error: r.error, next: r.next, checks: r.checks, ...(r.ai_run_id ? { ai_run_id: r.ai_run_id } : {}) })
      return
    }
    const o = r.output
    setDraft({
      ai_run_id: r.ai_run_id,
      mode: r.mode,
      model: r.model,
      latency_ms: r.latency_ms,
      checks: r.checks,
      original: o,
      rows: o.lines.map(toRow),
      open_questions: [...o.open_questions],
      delivery_hint: o.delivery_hint,
      requested_delivery_date: o.requested_delivery_date,
      stated_date: o.stated_date,
    })
    if (o.stated_date) setReceived(o.stated_date)
    if (!title.trim()) {
      const subject = /subject:\s*(.+)/i.exec(sourceText)?.[1]?.trim()
      if (subject) setTitle(subject.replace(/^(request for quotation|rfq|quotation request)\s*[-–:]\s*/i, '').trim())
    }
    if (!customerId && o.customer_name_guess) {
      const guess = customers.data?.find((c) => c.name.toLowerCase() === o.customer_name_guess?.toLowerCase())
      if (guess) setCustomerId(guess.id)
    }
  }

  const updateRow = (i: number, patch: Partial<DraftRow>) => setDraft((d) => (d ? { ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : d))
  const removeRow = (i: number) => setDraft((d) => (d ? { ...d, rows: d.rows.filter((_, j) => j !== i) } : d))

  const edited = useMemo(() => {
    if (!draft) return false
    const a = JSON.stringify(draft.original.lines.map(toRow)) !== JSON.stringify(draft.rows)
    const b = JSON.stringify(draft.original.open_questions) !== JSON.stringify(draft.open_questions)
    return a || b
  }, [draft])

  const incomplete = draft ? draft.rows.filter((r) => !rowComplete(r)).length : 0

  const createFromDraft = async () => {
    if (!draft) return
    const lines = draft.rows.filter(rowComplete).map((r) => ({ family: r.family as Family, size: r.size as number, material: r.material as Material, length_mm: r.length_mm as number, quantity: r.quantity as number, notes: r.notes }))
    const result = await action.run(
      () =>
        createRequest(ctx, {
          customer_id: customerId,
          title,
          source_text: sourceText,
          open_questions: draft.open_questions.filter((q) => q.trim() !== ''),
          stated_date: draft.stated_date,
          requested_delivery_date: draft.requested_delivery_date,
          delivery_hint: draft.delivery_hint,
          received_at: `${received}T09:00:00.000Z`,
          lines,
          source: 'ai',
          ai_run_id: draft.ai_run_id,
          ai_mode: draft.mode,
        }),
      'Request created.',
    )
    if (result) {
      void recordAiDecision(draft.ai_run_id, true, edited)
      navigate({ to: '/requests/$requestId', params: { requestId: result.request.id } })
    }
  }

  const createManual = async () => {
    const result = await action.run(
      () => createRequest(ctx, { customer_id: customerId, title, source_text: sourceText, received_at: `${received}T09:00:00.000Z`, lines: manualLines, source: 'manual' }),
      'Request created.',
    )
    if (result) {
      if (draft) void recordAiDecision(draft.ai_run_id, false, false)
      navigate({ to: '/requests/$requestId', params: { requestId: result.request.id } })
    }
  }

  const headerOk = Boolean(customerId) && title.trim() !== ''

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">New request</h1>
      <div className="grid grid-cols-[1fr_1.3fr] gap-6">
        <section className="space-y-3 rounded-md border bg-card p-4 text-[15px]">
          <h2 className="font-medium">Customer request</h2>
          <div className="space-y-1">
            <Label htmlFor="customer">Customer</Label>
            <CustomerSelect customers={customers.data ?? []} value={customerId} onChange={setCustomerId} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short name of the project or the request" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="source">Paste the request</Label>
            <Textarea id="source" rows={14} value={sourceText} onChange={(e) => setSourceText(e.target.value)} placeholder="Paste the customer email here. The AI proposes the lines; you check and approve them." />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={extract} disabled={sourceText.trim() === '' || ai.state.status === 'running'}>
              Extract lines
            </Button>
            <button type="button" className="text-sm text-primary underline" onClick={() => setManual(true)}>
              Add lines manually instead
            </button>
          </div>
          <AiWorking step="intake_extract" state={ai.state} onCancel={ai.cancel} replay={ai.replay} />
          {aiError && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">{aiError.error}</p>
              <p>{aiError.next}</p>
              {aiError.ai_run_id && (
                <p className="mt-1 text-xs">
                  Run {aiError.ai_run_id.slice(0, 8)} recorded in the traces.
                </p>
              )}
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-md border bg-card p-4 text-[15px]">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Lines found</h2>
            {manual && (
              <Button variant="outline" size="sm" onClick={() => setManualLines((ls) => [...ls, { ...DEFAULT_CONFIGURATION }])}>
                Add line
              </Button>
            )}
          </div>

          {!draft && !manual && <p className="text-sm text-muted-foreground">Paste a request and extract lines, or add them manually.</p>}

          {draft && !manual && (
            <AiDraftBlock title="Lines found" mode={draft.mode} model={draft.model} latency_ms={draft.latency_ms} checks={draft.checks} aiRunId={draft.ai_run_id}>
              <div className="space-y-3">
                {draft.rows.length === 0 && <p className="text-sm text-muted-foreground">The AI found no product line in the text. Add lines manually instead.</p>}
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-1">Family</th>
                      <th className="py-1 pr-1">Size</th>
                      <th className="py-1 pr-1">Material</th>
                      <th className="py-1 pr-1">Length (mm)</th>
                      <th className="py-1 pr-1">Quantity</th>
                      <th className="py-1 pr-1">Notes</th>
                      <th className="py-1 pr-1">Conf.</th>
                      <th className="py-1">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.rows.map((r, i) => {
                      const flags = rowFlags(r)
                      return (
                        <tr key={i} className="border-t align-top" data-draft-row={i + 1}>
                          <td className="py-1 pr-1">
                            <Select value={r.family} onValueChange={(v) => updateRow(i, { family: v as Family | 'UNKNOWN', size: v === 'UNKNOWN' ? null : r.size })}>
                              <SelectTrigger aria-label={`Family of line ${i + 1}`} size="sm" className="w-24">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[...FAMILIES, 'UNKNOWN' as const].map((f) => (
                                  <SelectItem key={f} value={f}>
                                    {f === 'UNKNOWN' ? '?' : f}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-1 pr-1">
                            <Select value={r.size === null ? '' : String(r.size)} onValueChange={(v) => updateRow(i, { size: Number(v) })} disabled={r.family === 'UNKNOWN'}>
                              <SelectTrigger aria-label={`Size of line ${i + 1}`} size="sm" className="w-20">
                                <SelectValue placeholder="?" />
                              </SelectTrigger>
                              <SelectContent>
                                {(r.family === 'UNKNOWN' ? [] : sizesOf(r.family)).map((s) => (
                                  <SelectItem key={s} value={String(s)}>
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-1 pr-1">
                            <Select value={r.material} onValueChange={(v) => updateRow(i, { material: v as Material | 'UNKNOWN' })}>
                              <SelectTrigger aria-label={`Material of line ${i + 1}`} size="sm" className="w-24">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[...MATERIALS, 'UNKNOWN' as const].map((m) => (
                                  <SelectItem key={m} value={m}>
                                    {m === 'UNKNOWN' ? '?' : m}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-1 pr-1">
                            <Input aria-label={`Length of line ${i + 1}`} type="number" className="h-8 w-24" value={r.length_mm ?? ''} onChange={(e) => updateRow(i, { length_mm: e.target.value === '' ? null : Number(e.target.value) })} />
                          </td>
                          <td className="py-1 pr-1">
                            <Input aria-label={`Quantity of line ${i + 1}`} type="number" className="h-8 w-20" value={r.quantity ?? ''} onChange={(e) => updateRow(i, { quantity: e.target.value === '' ? null : Number(e.target.value) })} />
                          </td>
                          <td className="py-1 pr-1">
                            <Input aria-label={`Notes of line ${i + 1}`} className="h-8" value={r.notes} onChange={(e) => updateRow(i, { notes: e.target.value })} />
                            <div className="mt-0.5 max-w-56 truncate text-xs text-muted-foreground" title={r.source_span}>
                              “{r.source_span}”
                            </div>
                          </td>
                          <td className={`py-1 pr-1 tabular-nums ${r.confidence < LOW_CONFIDENCE ? 'text-amber-800' : ''}`}>{r.confidence.toFixed(2)}</td>
                          <td className="py-1">
                            <div className="flex flex-wrap gap-1">
                              {flags.map((f) => (
                                <span key={f} className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                                  {f}
                                </span>
                              ))}
                              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => removeRow(i)}>
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                <div className="space-y-1">
                  <Label>Open questions</Label>
                  {draft.open_questions.length === 0 && <p className="text-xs text-muted-foreground">None.</p>}
                  {draft.open_questions.map((q, i) => (
                    <div key={i} className="flex gap-1">
                      <Input aria-label={`Open question ${i + 1}`} className="h-8" value={q} onChange={(e) => setDraft((d) => (d ? { ...d, open_questions: d.open_questions.map((x, j) => (j === i ? e.target.value : x)) } : d))} />
                      <Button variant="outline" size="sm" onClick={() => setDraft((d) => (d ? { ...d, open_questions: d.open_questions.filter((_, j) => j !== i) } : d))}>
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setDraft((d) => (d ? { ...d, open_questions: [...d.open_questions, ''] } : d))}>
                    Add question
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="received">Received</Label>
                    <Input id="received" type="date" value={received} onChange={(e) => setReceived(e.target.value)} className="w-44" />
                    <p className="text-xs text-muted-foreground">{draft.stated_date ? `Prefilled from the date in the text (${draft.stated_date}).` : 'The text has no date. Today is prefilled.'}</p>
                  </div>
                  <div className="space-y-1 text-sm">
                    <Label>Delivery</Label>
                    <p className="text-muted-foreground">{draft.requested_delivery_date ?? draft.delivery_hint ?? 'Not stated.'}</p>
                  </div>
                </div>
              </div>
            </AiDraftBlock>
          )}

          {manual && (
            <>
              {manualLines.length === 0 && <p className="text-sm text-muted-foreground">Add the lines the customer asks for. Each line is one configuration and quantity.</p>}
              <ol className="space-y-3">
                {manualLines.map((l, i) => {
                  const hits = ruleHits(l)
                  return (
                    <li key={i} className="rounded border p-3">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium">L{i + 1}</span>
                        <div className="flex items-center gap-2">
                          {hits.length > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">{hits.map((h) => `${h.rule_id}: ${h.note.replace(/\.$/, '')}`).join('; ')}</span>}
                          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setManualLines((ls) => ls.filter((_, j) => j !== i))}>
                            Remove
                          </button>
                        </div>
                      </div>
                      <ConfigurationFields value={l} onChange={(next) => setManualLines((ls) => ls.map((x, j) => (j === i ? next : x)))} idPrefix={`line-${i}`} />
                    </li>
                  )
                })}
              </ol>
              <div className="space-y-1">
                <Label htmlFor="received-manual">Received</Label>
                <Input id="received-manual" type="date" value={received} onChange={(e) => setReceived(e.target.value)} className="w-44" />
              </div>
            </>
          )}

          {action.error && <p className="text-sm text-destructive">{action.error}</p>}

          {draft && !manual && (
            <div className="flex items-center justify-end gap-3">
              {incomplete > 0 && <span className="text-xs text-amber-900">{incomplete} line(s) need a family, size, material, length and quantity before you create the request.</span>}
              {!headerOk && <span className="text-xs text-muted-foreground">Select a customer and give a title.</span>}
              <Button onClick={createFromDraft} disabled={action.busy || !headerOk || incomplete > 0 || draft.rows.length === 0}>
                Create request with {draft.rows.length} line{draft.rows.length === 1 ? '' : 's'}
              </Button>
            </div>
          )}
          {manual && (
            <div className="flex items-center justify-end gap-3">
              {!headerOk && <span className="text-xs text-muted-foreground">Select a customer and give a title.</span>}
              <Button onClick={createManual} disabled={action.busy || manualLines.length === 0 || !headerOk}>
                Create request with {manualLines.length} line{manualLines.length === 1 ? '' : 's'}
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
