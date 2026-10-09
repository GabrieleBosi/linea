import { describe, expect, it } from 'vitest'
import { GIVEN_LEGACY_QUOTES } from '@/data/givenLegacyQuotes'
import { costBreakdown, costEstimate, eurPerKg, quantityFactor, yearsSinceBase } from '@/domain/costModel'
import { parseLegacyProduct } from '@/domain/references'
import type { Material } from '@/domain/types'

describe('cost model', () => {
  it('uses the base price per kg on the base date', () => {
    expect(eurPerKg('S355', '2025-01-01')).toBeCloseTo(1.05, 6)
    expect(eurPerKg('S460', '2025-01-01')).toBeCloseTo(1.18, 6)
    expect(eurPerKg('S235', '2025-01-01')).toBeCloseTo(0.98, 6)
  })

  it('compounds 5 percent per year and discounts before 2025', () => {
    expect(yearsSinceBase('2026-01-01')).toBeCloseTo(1, 2)
    expect(eurPerKg('S355', '2026-01-01')).toBeCloseTo(1.05 * 1.05, 3)
    expect(eurPerKg('S355', '2024-01-01')).toBeCloseTo(1.05 / 1.05, 3)
  })

  it('quantity factor is 1 at 100 pieces and decreases with volume', () => {
    expect(quantityFactor(100)).toBeCloseTo(1, 10)
    expect(quantityFactor(200)).toBeLessThan(1)
    expect(quantityFactor(50)).toBeGreaterThan(1)
  })

  it('matches a hand-computed value', () => {
    // 120 pcs HEA 200 S355 12 m on the base date: 120 * 12 * 42.3 * 1.05 * (1.2^-0.06) * 1.08
    const expected = 120 * 12 * 42.3 * 1.05 * Math.pow(1.2, -0.06) * 1.08
    expect(costEstimate({ family: 'HEA', size: 200, material: 'S355', length_mm: 12000, quantity: 120 }, '2025-01-01')).toBeCloseTo(expected, 1)
  })

  it('returns null for a size that is not in the catalog', () => {
    expect(costEstimate({ family: 'IPE', size: 260, material: 'S355', length_mm: 12000, quantity: 10 }, '2025-01-01')).toBeNull()
  })

  it('prints the formula with the numbers', () => {
    const b = costBreakdown({ family: 'HEA', size: 200, material: 'S355', length_mm: 12000, quantity: 100 }, '2025-01-01')
    expect(b?.formula).toContain('100 pcs × 12.00 m × 42.30 kg/m')
    expect(b?.formula).toContain('(processing)')
  })

  it('calibration: every given legacy cost sits inside the range across lengths 6 to 15 m', () => {
    for (const q of GIVEN_LEGACY_QUOTES) {
      const p = parseLegacyProduct(q.product)
      expect(p).not.toBeNull()
      if (!p) continue
      const costs = [6, 8, 10, 12, 14, 15].map((m) =>
        costEstimate({ family: p.family, size: p.size, material: q.material as Material, length_mm: m * 1000, quantity: q.quantity }, q.quote_date),
      )
      const min = Math.min(...costs.map((c) => c ?? Infinity))
      const max = Math.max(...costs.map((c) => c ?? -Infinity))
      expect(q.production_cost, `${q.quote_id} cost ${q.production_cost} in [${min.toFixed(0)}, ${max.toFixed(0)}]`).toBeGreaterThanOrEqual(min)
      expect(q.production_cost, `${q.quote_id}`).toBeLessThanOrEqual(max)
    }
  })
})
