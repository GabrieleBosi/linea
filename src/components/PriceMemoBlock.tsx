// Composer section 6 (P1): the price memo as an AI draft with checks. Spec 6.5 and 4.4.
// "Generate memo" calls the step; "Edit" opens the text; "Keep" is the human approval.

import { useState } from 'react'
import { memoInputFrom } from '@/ai/memoInput'
import type { AiMode, Check } from '@/ai/types'
import { AiDraftBlock } from '@/components/AiDraftBlock'
import { AiWorking } from '@/components/AiWorking'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { Configuration } from '@/domain/types'
import { callMemo, recordAiDecision, useAiCall } from '@/lib/ai'
import type { LineInsight } from '@/services/references'

type Draft = { text: string; original: string; ai_run_id: string; mode: AiMode; model: string; latency_ms: number; checks: Check[]; cited: string[] }

export function PriceMemoBlock({
  config,
  customer,
  insight,
  memo,
  editable,
  requestId,
  lineId,
  onKeep,
  onDiscard,
  busy,
}: {
  config: Configuration
  customer: string
  insight: LineInsight | null
  /** The kept memo on the line, or the one kept in this session for a new line. */
  memo: string | null
  editable: boolean
  requestId: string
  lineId: string | null
  onKeep: (text: string) => Promise<void> | void
  onDiscard: () => void
  /** A line write is in flight: Generate, Keep and Remove wait for it, as in the cover text block. */
  busy: boolean
}) {
  const ai = useAiCall(callMemo)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canGenerate = insight !== null && insight.cost !== null && insight.price !== null && editable && ai.state.status !== 'running' && !busy

  const generate = async () => {
    if (!insight) return
    const input = memoInputFrom(config, customer, insight)
    if (!input) return
    setError(null)
    setDraft(null)
    const r = await ai.run({ ...input, request_id: requestId, line_id: lineId })
    if (!r.ok) {
      setError(`${r.error} ${r.next}`)
      return
    }
    setDraft({ text: r.output.memo, original: r.output.memo, ai_run_id: r.ai_run_id, mode: r.mode, model: r.model, latency_ms: r.latency_ms, checks: r.checks, cited: r.output.cited_reference_ids })
    setEditing(false)
  }

  const keep = async () => {
    if (!draft) return
    const edited = draft.text.trim() !== draft.original.trim()
    await onKeep(draft.text.trim())
    void recordAiDecision(draft.ai_run_id, true, edited)
    setDraft(null)
    setEditing(false)
  }

  const discard = () => {
    if (draft) void recordAiDecision(draft.ai_run_id, false, false)
    setDraft(null)
    setEditing(false)
  }

  return (
    <section className="space-y-2" data-price-memo>
      <h3 className="text-sm font-semibold">6. Price memo</h3>
      {ai.state.status === 'running' && <AiWorking step="price_memo" state={ai.state} onCancel={ai.cancel} replay={ai.replay} />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {draft ? (
        <AiDraftBlock
          title="Price memo"
          mode={draft.mode}
          model={draft.model}
          latency_ms={draft.latency_ms}
          checks={draft.checks}
          aiRunId={draft.ai_run_id}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={discard}>
                Discard
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing((e) => !e)}>
                {editing ? 'Done editing' : 'Edit'}
              </Button>
              <Button size="sm" onClick={keep} disabled={busy || draft.text.trim() === ''}>
                Keep
              </Button>
            </div>
          }
        >
          {editing ? (
            <Textarea value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={5} aria-label="Price memo text" />
          ) : (
            <p className="text-sm whitespace-pre-wrap">{draft.text}</p>
          )}
          {draft.cited.length > 0 && <p className="text-xs text-muted-foreground">Cites {draft.cited.join(', ')}.</p>}
        </AiDraftBlock>
      ) : memo ? (
        <div className="space-y-2 rounded-md border bg-card p-3">
          <p className="text-sm whitespace-pre-wrap">{memo}</p>
          {editable && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={generate} disabled={!canGenerate}>
                Generate again
              </Button>
              <Button variant="ghost" size="sm" onClick={onDiscard} disabled={busy}>
                Remove memo
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {insight && insight.price ? 'No memo yet. Generate three sentences that explain the suggested price, with the references.' : 'A memo needs a cost estimate and a price suggestion first.'}
          </p>
          {editable && (
            <Button variant="outline" size="sm" onClick={generate} disabled={!canGenerate}>
              Generate memo
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
