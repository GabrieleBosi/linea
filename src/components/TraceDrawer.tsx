// The AI trace drawer. Spec 9.4: step, mode, model, latency, tokens, input, raw output,
// revised output, checks, accepted and edited.

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { Check } from '@/ai/types'
import { dateTime } from '@/lib/format'
import { repo } from '@/lib/repo'
import { CheckBadges } from './AiDraftBlock'

function pretty(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') {
    try {
      return JSON.stringify(JSON.parse(v), null, 2)
    } catch {
      return v
    }
  }
  return JSON.stringify(v, null, 2)
}

export function useAiRun(aiRunId: string | null) {
  return useQuery({
    queryKey: ['ai-run', aiRunId ?? ''],
    enabled: aiRunId !== null,
    queryFn: () => repo.getAiRun(aiRunId as string),
  })
}

export function TraceDrawer({ aiRunId, open, onClose }: { aiRunId: string | null; open: boolean; onClose: () => void }) {
  const run = useAiRun(open ? aiRunId : null)
  const checks: Check[] = run.data?.checks ?? []
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:w-[560px] sm:max-w-[560px]">
        <SheetHeader>
          <SheetTitle>AI trace</SheetTitle>
          <SheetDescription>{run.data ? `${run.data.step} · ${run.data.mode} · ${run.data.model}` : 'Loading the run…'}</SheetDescription>
        </SheetHeader>
        {run.isError && <p className="px-4 text-sm text-destructive">The trace could not be loaded: {run.error.message}.</p>}
        {run.data && (
          <div className="space-y-4 px-4 pb-6 text-sm">
            <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 tabular-nums">
              <dt className="text-muted-foreground">Run</dt>
              <dd className="break-all font-mono text-xs">{run.data.id}</dd>
              <dt className="text-muted-foreground">When</dt>
              <dd>{dateTime(run.data.created_at)}</dd>
              <dt className="text-muted-foreground">Latency</dt>
              <dd>{(run.data.latency_ms / 1000).toFixed(2)} s</dd>
              <dt className="text-muted-foreground">Tokens</dt>
              <dd>
                {run.data.tokens_in ?? '—'} in · {run.data.tokens_out ?? '—'} out
              </dd>
              <dt className="text-muted-foreground">Human decision</dt>
              <dd>{run.data.accepted === null ? 'not yet' : run.data.accepted ? (run.data.edited ? 'accepted with edits' : 'accepted as is') : 'not accepted'}</dd>
            </dl>
            <section>
              <h3 className="mb-1 font-semibold">Checks</h3>
              <CheckBadges checks={checks} />
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {checks.map((c) => (
                  <li key={c.name}>
                    <span className={c.pass ? 'text-green-700' : 'text-amber-800'}>{c.pass ? '✓' : '!'}</span> {c.name}: {c.detail}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="mb-1 font-semibold">Input</h3>
              <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">{pretty(run.data.input)}</pre>
            </section>
            {run.data.raw_output && run.data.mode === 'revised' && (
              <section>
                <h3 className="mb-1 font-semibold">First output, before revision</h3>
                <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">{pretty(run.data.raw_output)}</pre>
              </section>
            )}
            <section>
              <h3 className="mb-1 font-semibold">{run.data.output === null ? 'Raw output' : 'Output'}</h3>
              <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">{pretty(run.data.output ?? run.data.raw_output)}</pre>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** A link that opens the trace drawer for one run. Self-contained. */
export function TraceLink({ aiRunId, label = 'View AI trace' }: { aiRunId: string; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="text-xs text-primary underline" onClick={() => setOpen(true)}>
        {label}
      </button>
      <TraceDrawer aiRunId={aiRunId} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
