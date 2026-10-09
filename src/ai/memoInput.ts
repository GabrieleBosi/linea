// The price memo input, built from the composer's line insight. Pure: the composer and the
// replay recorder build the same input, so the replay key matches. Spec 4.4.

import type { MemoInput } from '@/ai/steps/price_memo'
import type { Configuration } from '@/domain/types'
import type { LineInsight } from '@/services/references'

export function memoInputFrom(config: Configuration, customer: string, insight: LineInsight): MemoInput | null {
  if (!insight.cost || !insight.price) return null
  const top5 = insight.references.slice(0, 5)
  return {
    line: { ...config, customer },
    cost_estimate: insight.cost.total,
    unit_cost: insight.cost.total / config.quantity,
    // Rounded to the cent, as "Use suggested" puts it in the price field.
    suggested_price: Math.round(insight.price.unit.suggested * 100) / 100,
    floor: insight.price.unit.floor,
    range: insight.price.unit.range,
    median_won_margin: insight.price.median_won_margin,
    references: top5.map((r) => ({
      ref_id: r.ref_id,
      date: r.date,
      customer: r.customer,
      family: r.family,
      size: r.size,
      material: r.material,
      quantity: r.quantity,
      unit_price: r.unit_price,
      // Four decimals, as quotation_lines.margin stores it: the composer shows the stored value.
      margin: Math.round(r.margin * 10000) / 10000,
      outcome: r.outcome,
      revision: r.revision,
      score: { customer: r.score.customer, product: r.score.product, material: r.score.material, quantity: r.score.quantity, recency: r.score.recency, total: r.score.total },
    })),
    win_rate_bands: insight.bands.map((b) => ({ label: b.label, n: b.n, won: b.won, win_rate: b.win_rate })),
  }
}
