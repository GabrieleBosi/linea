import type { CheckStatus, CommercialStatus, QuotationStatus, RequestStatus, TechnicalStatus } from '@/domain/types'
import { humanStatus } from '@/lib/format'
import { cn } from '@/lib/utils'

// Spec 6.1: commercial states in blue tones, technical states in amber and green,
// executable in green, declined / not_feasible / withdrawn in a muted red.

const COMMERCIAL: Record<CommercialStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  quoted: 'bg-blue-50 text-blue-700',
  negotiating: 'bg-blue-100 text-blue-800',
  agreed: 'bg-blue-600 text-white',
  declined: 'bg-red-50 text-red-700',
  withdrawn: 'bg-red-50 text-red-700',
  superseded: 'bg-slate-100 text-slate-500 line-through',
}

const TECHNICAL: Record<TechnicalStatus, string> = {
  not_required: 'bg-slate-100 text-slate-600',
  pending: 'bg-amber-100 text-amber-800',
  feasible: 'bg-green-100 text-green-800',
  not_feasible: 'bg-red-50 text-red-700',
}

const REQUEST: Record<RequestStatus, string> = {
  open: 'bg-blue-50 text-blue-700',
  on_hold: 'bg-amber-100 text-amber-800',
  rejected: 'bg-red-50 text-red-700',
  converted: 'bg-green-600 text-white',
}

const QUOTATION: Record<QuotationStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-50 text-blue-700',
  superseded: 'bg-slate-100 text-slate-500',
}

const CHECK: Record<CheckStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  feasible: 'bg-green-100 text-green-800',
  not_feasible: 'bg-red-50 text-red-700',
  waived: 'bg-slate-100 text-slate-600',
}

type Props =
  | { kind: 'commercial'; value: CommercialStatus }
  | { kind: 'technical'; value: TechnicalStatus }
  | { kind: 'request'; value: RequestStatus }
  | { kind: 'quotation'; value: QuotationStatus }
  | { kind: 'check'; value: CheckStatus }

export function StatusBadge(props: Props & { className?: string }) {
  const palette =
    props.kind === 'commercial'
      ? COMMERCIAL[props.value]
      : props.kind === 'technical'
        ? TECHNICAL[props.value]
        : props.kind === 'request'
          ? REQUEST[props.value]
          : props.kind === 'quotation'
            ? QUOTATION[props.value]
            : CHECK[props.value]
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', palette, props.className)}>
      {humanStatus(props.value)}
    </span>
  )
}

export function ReadyMark({ ready }: { ready: boolean }) {
  return ready ? (
    <span className="text-green-700" aria-label="Ready">
      ✓
    </span>
  ) : (
    <span className="text-muted-foreground" aria-label="Not ready">
      –
    </span>
  )
}
