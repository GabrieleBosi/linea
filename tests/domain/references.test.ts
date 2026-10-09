import { describe, expect, it } from 'vitest'
import { GIVEN_LEGACY_QUOTES } from '@/data/givenLegacyQuotes'
import {
  expectedRevisions,
  legacyToReference,
  parseLegacyProduct,
  poolExcludingRequest,
  priceSuggestion,
  quotationLineToReference,
  referenceCount,
  scoreReference,
  topReferences,
  winRateBands,
  type ReferenceRow,
  type SentLineForPool,
} from '@/domain/references'
import { TODAY } from './fixtures'

const POOL: ReferenceRow[] = GIVEN_LEGACY_QUOTES.map((q) => legacyToReference(q)).filter((r): r is ReferenceRow => r !== null)

const TARGET_A3 = { customer: 'Ebrecht Fabrication', family: 'HEA' as const, size: 200, material: 'S355' as const, length_mm: 12000, quantity: 120 }

describe('reference pool normalization', () => {
  it('parses the legacy product format', () => {
    expect(parseLegacyProduct('HEA200')).toEqual({ family: 'HEA', size: 200 })
    expect(parseLegacyProduct('ipe 300')).toEqual({ family: 'IPE', size: 300 })
    expect(parseLegacyProduct('UPN200')).toBeNull()
  })

  it('normalizes a legacy quote into unit price, unit cost and outcome', () => {
    const r = legacyToReference(GIVEN_LEGACY_QUOTES[0]!)
    expect(r).toMatchObject({ ref_id: 'FS-25-0117', family: 'HEA', size: 200, material: 'S355', quantity: 110, outcome: 'WON', revision: 2 })
    expect(r?.unit_price).toBeCloseTo(84000 / 110, 6)
    expect(r?.unit_cost).toBeCloseTo(600, 6)
  })
})

describe('scoring', () => {
  it('scores FS-25-0117 for the scenario A3 target with every term', () => {
    const ref0117 = POOL.find((r) => r.ref_id === 'FS-25-0117')!
    const s = scoreReference(TARGET_A3, ref0117, TODAY)
    expect(s.customer).toBe(30)
    expect(s.product).toBe(30)
    expect(s.product_adjacent).toBe(false)
    expect(s.material).toBe(15)
    expect(s.quantity).toBeCloseTo(15 * (1 - 10 / 120), 6)
    // 2025-01-28 to 2026-09-22 is about 19.8 months
    expect(s.recency).toBeCloseTo(10 * Math.exp(-19.8 / 12), 1)
    expect(s.total).toBeCloseTo(30 + 30 + 15 + 13.75 + s.recency, 6)
  })

  it('gives 12 product points to the next size up or down', () => {
    // Scenario A4: target HEA 220, references HEA 200 and HEA 240 from Ebrecht get the next-size chip.
    const target220 = { ...TARGET_A3, size: 220, length_mm: 10000, quantity: 40 }
    const ref0117 = POOL.find((r) => r.ref_id === 'FS-25-0117')! // Ebrecht HEA200
    const ref0261 = POOL.find((r) => r.ref_id === 'FS-26-0261')! // Ebrecht HEA240
    expect(scoreReference(target220, ref0117, TODAY).product).toBe(12)
    expect(scoreReference(target220, ref0261, TODAY).product).toBe(12)
    expect(scoreReference(target220, ref0261, TODAY).product_adjacent).toBe(true)
    // HEA 240 is two steps from HEA 200: no product points.
    const far = scoreReference(TARGET_A3, ref0261, TODAY)
    expect(far.product).toBe(0)
    expect(far.product_adjacent).toBe(false)
  })

  it('gives no material points for a different grade', () => {
    const ref0512 = POOL.find((r) => r.ref_id === 'FS-25-0512')! // Ebrecht HEA200 S460
    expect(scoreReference(TARGET_A3, ref0512, TODAY).material).toBe(0)
  })

  it('A3: the top 5 includes FS-25-0117 and FS-25-0512, with FS-25-0117 first', () => {
    const top = topReferences(TARGET_A3, POOL, TODAY)
    const ids = top.map((r) => r.ref_id)
    expect(ids[0]).toBe('FS-25-0117')
    expect(ids).toContain('FS-25-0512')
    expect(top).toHaveLength(5)
  })

  it('counts references with the same family, size and material', () => {
    expect(referenceCount({ family: 'HEA', size: 200, material: 'S355' }, POOL)).toBe(3)
    expect(referenceCount({ family: 'HEA', size: 240, material: 'S460' }, POOL)).toBe(0)
  })
})

describe('price suggestion', () => {
  it('computes floor, suggested and range from the won references', () => {
    const top = topReferences(TARGET_A3, POOL, TODAY)
    const won = top.filter((r) => r.outcome === 'WON').map((r) => r.margin).sort((a, b) => a - b)
    const p = priceSuggestion(60000, 120, top)
    expect(p.floor).toBeCloseTo(60000 / 0.85, 6)
    expect(p.won_count).toBe(won.length)
    const mid = Math.floor(won.length / 2)
    const median = won.length % 2 === 0 ? (won[mid - 1]! + won[mid]!) / 2 : won[mid]!
    expect(p.median_won_margin).toBeCloseTo(median, 6)
    expect(p.suggested).toBeCloseTo(60000 / (1 - median), 6)
    expect(p.range?.[0]).toBeCloseTo(60000 / (1 - won[0]!), 6)
    expect(p.range?.[1]).toBeCloseTo(60000 / (1 - won[won.length - 1]!), 6)
    expect(p.unit.suggested).toBeCloseTo(p.suggested / 120, 6)
  })

  it('uses a 20 percent margin and no range when no won reference exists', () => {
    const lost = topReferences(TARGET_A3, POOL, TODAY).map((r) => ({ ...r, outcome: 'LOST' as const }))
    const p = priceSuggestion(60000, 120, lost)
    expect(p.suggested).toBeCloseTo(60000 / 0.8, 6)
    expect(p.range).toBeNull()
    expect(p.median_won_margin).toBeNull()
  })

  it('win rate by margin band for HEA over the anchor rows', () => {
    const bands = winRateBands('HEA', POOL)
    expect(bands.map((b) => b.label)).toEqual(['14–17%', '17–20%', '20–23%', '23–26%'])
    expect(bands.reduce((n, b) => n + b.n, 0)).toBe(8)
    const b17 = bands[1]!
    // margins 0.176, 0.194, 0.174, 0.175: three won, one lost
    expect(b17.n).toBe(4)
    expect(b17.win_rate).toBeCloseTo(0.75, 6)
  })

  it('expected revisions is the median revision of the top references', () => {
    const top = topReferences(TARGET_A3, POOL, TODAY)
    const revs = top.map((r) => r.revision).sort((a, b) => a - b)
    expect(expectedRevisions(top)).toBe(revs[2])
  })
})

describe('price per tonne', () => {
  it('is derived only when the length is known', async () => {
    const { pricePerTonne } = await import('@/domain/references')
    const base = { family: 'HEA' as const, size: 200, unit_price: 780.91 }
    expect(pricePerTonne({ ...base, length_mm: null })).toBeNull()
    // HEA 200: 42.3 kg/m × 12 m = 507.6 kg per piece → 780.91 / 0.5076 t
    expect(pricePerTonne({ ...base, length_mm: 12000 })).toBeCloseTo(780.91 / 0.5076, 2)
  })
})

describe('a line is never a reference for its own request', () => {
  // Scenario A's L1 once agreed: the same customer, profile, grade and quantity as the A3 target.
  const sent = (request_ref: string, revision_no: number, line_no: number, commercial_status: SentLineForPool['commercial_status']): SentLineForPool => ({
    quotation_line: {
      id: `ql-${request_ref}-${revision_no}-${line_no}`,
      quotation_id: `q-${request_ref}-${revision_no}`,
      line_id: `l-${request_ref}-${line_no}`,
      line_no,
      family: 'HEA',
      size: 200,
      material: 'S355',
      length_mm: 12000,
      quantity: 120,
      unit_price: 775.63,
      total_price: 93075.6,
      cost_estimate: 74400,
      margin: 0.2007,
      price_memo: null,
      reference_ids: [],
      subject_to_feasibility: false,
      created_at: `${TODAY}T09:00:00Z`,
    },
    commercial_status,
    customer_name: 'Ebrecht Fabrication',
    request_ref,
    revision_no,
    sent_at: `${TODAY}T09:00:00Z`,
  })
  const own = [sent('R-2026-0143', 1, 1, 'agreed'), sent('R-2026-0143', 2, 2, 'agreed'), sent('R-2026-0143', 1, 2, 'superseded')]
  const other = sent('R-2026-0150', 1, 1, 'agreed')
  const pool = [...POOL, ...[...own, other].map((s) => quotationLineToReference(s)).filter((r): r is ReferenceRow => r !== null)]

  it('carries the request on Linea rows and not on legacy rows', () => {
    expect(quotationLineToReference(other)?.request_ref).toBe('R-2026-0150')
    expect(POOL.every((r) => r.request_ref === undefined)).toBe(true)
  })

  it('ranks the own lines first without the exclusion, which is the defect', () => {
    expect(topReferences(TARGET_A3, pool, TODAY)[0]?.ref_id.startsWith('R-2026-0143')).toBe(true)
  })

  it('leaves out every line and revision of the same request, and keeps the other requests and legacy rows', () => {
    const seen = poolExcludingRequest(pool, 'R-2026-0143')
    expect(seen.some((r) => r.request_ref === 'R-2026-0143')).toBe(false)
    expect(seen).toHaveLength(POOL.length + 1)
    const top = topReferences(TARGET_A3, seen, TODAY)
    expect(top.map((r) => r.ref_id)).not.toContain('R-2026-0143 R1 L1')
    expect(top[0]?.ref_id).toBe('R-2026-0150 R1 L1')
    expect(referenceCount(TARGET_A3, seen)).toBe(referenceCount(TARGET_A3, POOL) + 1)
  })

  it('keeps the whole pool when no request is given', () => {
    expect(poolExcludingRequest(pool, undefined)).toHaveLength(pool.length)
  })
})
