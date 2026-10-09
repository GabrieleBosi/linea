import type { ReactNode } from 'react'
import type { AiMode, Check } from '@/ai/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { TraceLink } from './TraceDrawer'

const CHECK_LABELS: Record<string, string> = {
  schema_valid: 'schema',
  size_in_catalog: 'catalog',
  quantity_positive: 'quantities',
  span_grounded: 'spans',
  units_normalized: 'units',
  no_instruction_text: 'safety',
  dates_grounded: 'dates',
  all_lines_covered: 'coverage',
  changes_are_numbers: 'numbers',
  numbers_grounded: 'numbers',
  references_exist: 'references',
  length_ok: 'length',
  price_in_range: 'price',
  numbers_displayed: 'as displayed',
  every_line_present: 'lines',
  validity_present: 'validity',
  feasibility_disclaimer: 'disclaimer',
  no_delivery_promise: 'delivery',
}

export function CheckBadges({ checks }: { checks: Check[] }) {
  return (
    <div className="flex flex-wrap gap-1" aria-label="Checks">
      {checks.map((c) => (
        <Tooltip key={c.name}>
          <TooltipTrigger asChild>
            <span
              data-check={c.name}
              data-pass={c.pass}
              className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs', c.pass ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900')}
            >
              {c.pass ? '✓' : '!'} {CHECK_LABELS[c.name] ?? c.name}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{c.detail}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

/** Spec 6.1: every AI output sits in a bordered "AI draft" block with checks, an Edit affordance and an approval button. */
export function AiDraftBlock({
  title,
  mode,
  model,
  latency_ms,
  checks,
  aiRunId,
  children,
  footer,
}: {
  title: string
  mode: AiMode
  model: string
  latency_ms: number
  checks: Check[]
  aiRunId: string | null
  children: ReactNode
  footer?: ReactNode
}) {
  const failed = checks.filter((c) => !c.pass)
  return (
    <section className="rounded-md border-2 border-dashed border-primary/40 bg-card" data-ai-draft>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="text-sm">
          <span className="rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">AI draft</span>
          <span className="ml-2 font-medium">{title}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {mode} · {model} · {(latency_ms / 1000).toFixed(1)} s
          </span>
        </div>
        {aiRunId && <TraceLink aiRunId={aiRunId} />}
      </header>
      <div className="space-y-2 px-3 py-2">
        <CheckBadges checks={checks} />
        {failed.length > 0 && (
          <p className="text-xs text-amber-900">
            {failed.length} check(s) failed. Read the draft with care and correct it before you approve.
          </p>
        )}
        <p className="text-xs text-muted-foreground">This is a draft. Edit any value below. Nothing changes until you approve.</p>
      </div>
      <div className="px-3 pb-3">{children}</div>
      {footer && <footer className="border-t px-3 py-2">{footer}</footer>}
    </section>
  )
}
