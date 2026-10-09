import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GIVEN_LEGACY_QUOTES } from '@/data/givenLegacyQuotes'
import { costEstimate } from '@/domain/costModel'
import { legacyToReference, parseLegacyProduct, winRateBands, type ReferenceRow } from '@/domain/references'
import type { Material } from '@/domain/types'
import { CUSTOMERS, generateLegacyQuotes, seedJson } from '../../scripts/generate-legacy'

const ROWS = generateLegacyQuotes()
const GENERATED = ROWS.filter((r) => r.source === 'generated')

describe('legacy generator', () => {
  it('produces about 250 rows, the eight anchor rows first and unchanged', () => {
    expect(ROWS.length).toBeGreaterThanOrEqual(240)
    expect(ROWS.length).toBeLessThanOrEqual(265)
    expect(ROWS.slice(0, 8)).toEqual(GIVEN_LEGACY_QUOTES)
  })

  it('is deterministic', () => {
    expect(generateLegacyQuotes()).toEqual(ROWS)
    expect(generateLegacyQuotes(1)).not.toEqual(ROWS)
  })

  it('has unique ids, dates from 2023-01 to 2026-09, prices rounded to 10', () => {
    expect(new Set(ROWS.map((r) => r.quote_id)).size).toBe(ROWS.length)
    for (const r of GENERATED) {
      expect(r.quote_date >= '2023-01-01' && r.quote_date <= '2026-09-30', r.quote_id).toBe(true)
      expect(r.quoted_price % 10, r.quote_id).toBe(0)
      expect(r.quantity).toBeGreaterThanOrEqual(20)
      expect(r.quantity).toBeLessThanOrEqual(300)
      expect(r.margin).toBeGreaterThanOrEqual(0.13)
      expect(r.margin).toBeLessThanOrEqual(0.27)
    }
  })

  it('uses only the twelve customers and every generated customer appears', () => {
    const names = new Set(CUSTOMERS.map((c) => c.name))
    for (const r of ROWS) expect(names.has(r.customer), r.customer).toBe(true)
    for (const c of CUSTOMERS) expect(ROWS.some((r) => r.customer === c.name), c.name).toBe(true)
  })

  it('seed requirements from spec 7.3', () => {
    const rows = (product: string, material: string) => ROWS.filter((r) => r.product === product && r.material === material)
    expect(new Set(rows('HEA220', 'S355').map((r) => r.customer)).size).toBeGreaterThanOrEqual(2)
    expect(rows('IPE300', 'S355').length).toBeGreaterThanOrEqual(3)
    expect(rows('HEA260', 'S355').length).toBeGreaterThanOrEqual(3)
    expect(rows('HEA240', 'S460')).toHaveLength(0)
    const ebrecht = GENERATED.filter((r) => r.customer === 'Ebrecht Fabrication').map((r) => `${r.product} ${r.material}`).sort()
    expect(ebrecht).toEqual(['HEA200 S355', 'HEA200 S355', 'HEA240 S355', 'HEA240 S355'])
    expect(GENERATED.filter((r) => r.customer === 'Torvane Structures').length).toBeGreaterThanOrEqual(3)
  })

  it('calibration: the overall win rate is between 60 and 75 percent', () => {
    const rate = ROWS.filter((r) => r.outcome === 'WON').length / ROWS.length
    expect(rate).toBeGreaterThanOrEqual(0.6)
    expect(rate).toBeLessThanOrEqual(0.75)
  })

  it('calibration: the win rate decreases with the margin band', () => {
    const pool = ROWS.map(legacyToReference).filter((r): r is ReferenceRow => r !== null)
    const bands = [0.14, 0.17, 0.2, 0.23, 0.26]
    const rates: number[] = []
    for (let i = 0; i < bands.length - 1; i++) {
      const lo = bands[i]!
      const hi = bands[i + 1]!
      const rows = pool.filter((r) => r.margin >= lo && (i === bands.length - 2 ? r.margin <= hi : r.margin < hi))
      expect(rows.length, `band ${lo}-${hi} has enough rows`).toBeGreaterThanOrEqual(5)
      rates.push(rows.filter((r) => r.outcome === 'WON').length / rows.length)
    }
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]!, `band ${i} win rate ${rates[i]} <= band ${i - 1} ${rates[i - 1]}`).toBeLessThanOrEqual(rates[i - 1]!)
    }
    // The same bands per family, as the UI shows them, have n on every band for HEA.
    expect(winRateBands('HEA', pool).every((b) => b.n > 0)).toBe(true)
  })

  it('calibration: every generated cost is within 20 percent of the cost model at one of the six lengths', () => {
    for (const r of GENERATED) {
      const p = parseLegacyProduct(r.product)
      expect(p, r.quote_id).not.toBeNull()
      if (!p) continue
      const ok = [6, 8, 10, 12, 14, 15].some((m) => {
        const model = costEstimate({ family: p.family, size: p.size, material: r.material as Material, length_mm: m * 1000, quantity: r.quantity }, r.quote_date)
        return model !== null && Math.abs(r.production_cost / model - 1) <= 0.2
      })
      expect(ok, `${r.quote_id} ${r.product} ${r.material} ${r.quantity} cost ${r.production_cost}`).toBe(true)
    }
  })
})

describe('static demo seed', () => {
  it('src/data/seed.json is the generator output (run npm run generate:legacy after a change)', () => {
    expect(readFileSync(resolve(import.meta.dirname, '../../src/data/seed.json'), 'utf8')).toBe(seedJson())
  })
})
