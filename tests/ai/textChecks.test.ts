// Checks of the text steps. Spec 4.4 and 4.5.

import { describe, expect, it } from 'vitest'
import { lengthOk, numbersGrounded, numbersIn, parseNumberToken, priceInRange, referencesExist } from '@/ai/checks'

const input = {
  line: { family: 'HEA', size: 200, material: 'S355', length_mm: 12000, quantity: 120, customer: 'Ebrecht Fabrication' },
  cost_estimate: 74311.38,
  unit_cost: 619.26,
  suggested_price: 780.91,
  floor: 728.54,
  range: [751.53, 790.88] as [number, number],
  median_won_margin: 0.207,
  references: [{ ref_id: 'FS-25-0117', date: '2025-01-28', customer: 'Ebrecht Fabrication', unit_price: 763.64, margin: 0.214, outcome: 'WON', revision: 2 }],
  win_rate_bands: [{ label: '17–20%', n: 58, won: 45, win_rate: 0.776 }],
}

describe('number tokens', () => {
  it('reads the common formats', () => {
    expect(parseNumberToken('1,234.56')).toBe(1234.56)
    expect(parseNumberToken('93,064')).toBe(93064)
    expect(parseNumberToken('775.53')).toBe(775.53)
    expect(parseNumberToken('1.234,56')).toBe(1234.56)
    expect(parseNumberToken('20,2')).toBe(20.2)
    expect(numbersIn('FS-25-0117 on 2025-01-28 at 763.64 EUR')).toEqual([25, 117, 2025, 1, 28, 763.64])
  })
})

describe('numbers_grounded', () => {
  it('passes when every number is in the input, in the units a memo uses', () => {
    const memo = 'The suggested price is 780.91 EUR per piece, a 20.7 percent margin. Ebrecht Fabrication paid 763.64 EUR in FS-25-0117 (2025-01-28). The 17–20% band wins 78 percent of the time with 12 m beams and 120 pieces.'
    expect(numbersGrounded(memo, input).pass).toBe(true)
  })
  it('accepts a rounded price and rejects an invented one', () => {
    expect(numbersGrounded('About 781 EUR per piece.', input).pass).toBe(true)
    const r = numbersGrounded('The total is 93,064 EUR.', input)
    expect(r.pass).toBe(false)
    expect(r.detail).toContain('93,064')
  })
})

describe('references_exist, length_ok, price_in_range', () => {
  it('flags an id outside the top 5', () => {
    expect(referencesExist(['FS-25-0117'], ['FS-25-0117', 'FS-25-0512']).pass).toBe(true)
    expect(referencesExist(['Q-9999'], ['FS-25-0117']).pass).toBe(false)
  })
  it('counts words against the limit', () => {
    expect(lengthOk('one two three', 3).pass).toBe(true)
    expect(lengthOk('one two three four', 3).pass).toBe(false)
  })
  it('needs the suggested price stated and inside the range', () => {
    expect(priceInRange('Suggested 780.91 EUR.', 780.91, [751.53, 790.88]).pass).toBe(true)
    expect(priceInRange('Suggested 781 EUR.', 780.91, [751.53, 790.88]).pass).toBe(true)
    expect(priceInRange('A fair price.', 780.91, [751.53, 790.88]).pass).toBe(false)
    expect(priceInRange('Suggested 800.00 EUR.', 800, [751.53, 790.88]).pass).toBe(false)
    expect(priceInRange('Suggested 1330.00 EUR.', 1330, null).pass).toBe(true)
  })
})
