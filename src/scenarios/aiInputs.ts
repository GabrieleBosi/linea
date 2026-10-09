// The AI inputs of the scenario steps. Spec 4.1.1: the step player builds them at run time from
// the snapshot of the sent revision; the replay recorder collects the same inputs by running the
// scenarios (scripts/record-replay.ts).

import type { ReplyInput } from '@/ai/steps/reply_interpret'
import type { QuotationLine } from '@/domain/types'

export function revisionInput(revision_no: number, snapshot: QuotationLine[]): ReplyInput['revision'] {
  return {
    revision_no,
    lines: snapshot.map((s) => ({ line_no: s.line_no, family: s.family, size: s.size, material: s.material, length_mm: s.length_mm, quantity: s.quantity, unit_price: s.unit_price, total_price: s.total_price })),
  }
}
