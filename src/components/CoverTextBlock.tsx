// Revision page (P1): the cover text as an AI draft with checks, editable. Spec 6.7 and 4.5.
// "Generate cover text" calls the step; "Keep" is the human approval and saves the text on the draft.

import { useState } from 'react'
import type { CoverInput } from '@/ai/steps/cover_text'
import type { AiMode, Check } from '@/ai/types'
import { AiDraftBlock } from '@/components/AiDraftBlock'
import { AiWorking } from '@/components/AiWorking'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { callCover, recordAiDecision, useAiCall } from '@/lib/ai'

type Draft = { text: string; original: string; ai_run_id: string; mode: AiMode; model: string; latency_ms: number; checks: Check[] }

export function CoverTextBlock({
  input,
  requestId,
  coverText,
  editable,
  busy,
  onKeep,
  onRemove,
}: {
  /** Null while the revision has no priced line. */
  input: CoverInput | null
  requestId: string
  coverText: string | null
  /** True for a draft revision of an open request. */
  editable: boolean
  busy: boolean
  onKeep: (text: string) => Promise<void> | void
  onRemove: () => Promise<void> | void
}) {
  const ai = useAiCall(callCover)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canGenerate = input !== null && editable && ai.state.status !== 'running' && !busy

  const generate = async () => {
    if (!input) return
    setError(null)
    setDraft(null)
    const r = await ai.run({ ...input, request_id: requestId })
    if (!r.ok) {
      setError(`${r.error} ${r.next}`)
      return
    }
    setDraft({ text: r.output.text, original: r.output.text, ai_run_id: r.ai_run_id, mode: r.mode, model: r.model, latency_ms: r.latency_ms, checks: r.checks })
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
    <section className="space-y-2 rounded-md border bg-card p-3" data-cover-text>
      <h2 className="text-sm font-semibold">Cover text</h2>
      {ai.state.status === 'running' && <AiWorking step="cover_text" state={ai.state} onCancel={ai.cancel} replay={ai.replay} />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {draft ? (
        <AiDraftBlock
          title="Cover text"
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
              <Button size="sm" onClick={keep} disabled={draft.text.trim() === '' || busy}>
                Keep
              </Button>
            </div>
          }
        >
          {editing ? (
            <Textarea value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={10} aria-label="Cover text" />
          ) : (
            <p className="text-sm whitespace-pre-wrap">{draft.text}</p>
          )}
        </AiDraftBlock>
      ) : coverText ? (
        <div className="space-y-2">
          <p className="text-sm whitespace-pre-wrap">{coverText}</p>
          {editable && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={generate} disabled={!canGenerate}>
                Generate again
              </Button>
              <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy}>
                Remove text
              </Button>
            </div>
          )}
        </div>
      ) : editable ? (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{input ? 'No cover text yet. Generate the customer-facing text of this revision, then read and edit it before you send.' : 'Price every line first; the cover text needs the totals.'}</p>
          <Button variant="outline" size="sm" onClick={generate} disabled={!canGenerate}>
            Generate cover text
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">This revision was sent without a cover text.</p>
      )}
    </section>
  )
}
