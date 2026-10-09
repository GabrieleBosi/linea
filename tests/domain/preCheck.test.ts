import { describe, expect, it } from 'vitest'
import { preCheck, ruleHits } from '@/domain/preCheck'
import type { Configuration } from '@/domain/types'

const cfg = (o: Partial<Configuration>): Configuration => ({ family: 'HEA', size: 200, material: 'S355', length_mm: 12000, quantity: 100, ...o })

describe('feasibility pre-check', () => {
  it('F1a: HEA 240 and larger in S460 above 12 m', () => {
    expect(ruleHits(cfg({ size: 240, material: 'S460', length_mm: 14000 })).map((h) => h.rule_id)).toEqual(['F1a'])
    expect(ruleHits(cfg({ size: 240, material: 'S460', length_mm: 12000 }))).toEqual([])
    expect(ruleHits(cfg({ size: 220, material: 'S460', length_mm: 14000 }))).toEqual([])
    expect(ruleHits(cfg({ size: 240, material: 'S355', length_mm: 14000 }))).toEqual([])
  })

  it('F1b: HEB 240 and larger in S460 above 12 m', () => {
    expect(ruleHits(cfg({ family: 'HEB', size: 300, material: 'S460', length_mm: 13000 })).map((h) => h.rule_id)).toEqual(['F1b'])
  })

  it('F2: any profile above 15 m', () => {
    const hits = ruleHits(cfg({ family: 'IPE', size: 300, length_mm: 16000 }))
    expect(hits.map((h) => h.rule_id)).toEqual(['F2'])
    expect(hits[0]?.note).toContain('transport')
  })

  it('F1a and F2 both hit for HEA 240 S460 at 16 m', () => {
    expect(ruleHits(cfg({ size: 240, material: 'S460', length_mm: 16000 })).map((h) => h.rule_id)).toEqual(['F1a', 'F2'])
  })

  it('F3: IPE is not offered in S460', () => {
    expect(ruleHits(cfg({ family: 'IPE', size: 300, material: 'S460' })).map((h) => h.rule_id)).toEqual(['F3'])
  })

  it('F4: below 20 pieces', () => {
    expect(ruleHits(cfg({ quantity: 19 })).map((h) => h.rule_id)).toEqual(['F4'])
    expect(ruleHits(cfg({ quantity: 20 }))).toEqual([])
  })

  it('scenario A lines have no hit', () => {
    expect(ruleHits(cfg({ size: 200, length_mm: 12000, quantity: 120 }))).toEqual([])
    expect(ruleHits(cfg({ size: 220, length_mm: 10000, quantity: 40 }))).toEqual([])
  })

  it('a new configuration needs a check even without a rule hit', () => {
    const r = preCheck(cfg({}), 0)
    expect(r.hits).toEqual([])
    expect(r.new_configuration).toBe(true)
    expect(r.needs_check).toBe(true)
  })

  it('a known configuration without a hit needs no check', () => {
    const r = preCheck(cfg({}), 3)
    expect(r.needs_check).toBe(false)
  })
})
