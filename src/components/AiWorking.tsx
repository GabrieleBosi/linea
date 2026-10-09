import { Button } from '@/components/ui/button'
import type { StepName } from '@/ai/types'
import type { AiCallState } from '@/lib/ai'
import { useExpectedDuration } from '@/lib/ai'

const LABELS: Record<StepName, string> = {
  intake_extract: 'Extracting lines from the request',
  reply_interpret: 'Interpreting the customer reply',
  price_memo: 'Writing the price memo',
  cover_text: 'Writing the cover text',
}

/** Never a silent spinner. Spec 4.1 rule 9: step name, elapsed, expected, cancel. */
export function AiWorking({ step, state, onCancel, replay }: { step: StepName; state: AiCallState; onCancel: () => void; replay: boolean }) {
  const expected = useExpectedDuration(step)
  if (state.status !== 'running') return null
  const elapsed = state.elapsed_ms / 1000
  const pct = Math.min(100, Math.round((state.elapsed_ms / expected) * 100))
  return (
    <div role="status" aria-live="polite" className="rounded-md border border-primary/30 bg-accent/40 p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="font-medium">AI working</span> · {LABELS[step]}
          {replay && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">replay</span>}
        </div>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-3 tabular-nums">
        <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-muted-foreground">
          {elapsed.toFixed(1)} s elapsed · about {Math.round(expected / 1000)} s expected
        </span>
      </div>
      {state.elapsed_ms > expected * 2 && <p className="mt-1 text-xs text-muted-foreground">Slower than usual. The step stops at its budget and falls back to the replay cache or the manual path.</p>}
    </div>
  )
}
