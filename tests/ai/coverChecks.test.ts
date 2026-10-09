// Checks of the cover_text step. Spec 4.5.

import { describe, expect, it } from 'vitest'
import { datesIn, everyLinePresent, feasibilityDisclaimer, noDeliveryPromise, validityPresent } from '@/ai/checks'

const L1 = { line_no: 1, family: 'HEA', size: 240, material: 'S460', quantity: 100, total_price: 143753 }
const L2 = { line_no: 2, family: 'IPE', size: 300, material: 'S355', quantity: 80, total_price: 60940 }

const TEXT = `Dear Ms Keller,

thank you for your request. Please find our quotation, revision 1, below.

Line 1: HEA 240 in S460, 14000 mm, 100 pieces, total 143753.00 EUR. This line is subject to technical validation.

Line 2: IPE 300 in S355, 12000 mm, 80 pieces, total 60940.00 EUR.

This offer is valid until 2026-10-22.`

describe('cover_text checks', () => {
  it('reads dates in several forms', () => {
    expect(datesIn('valid until 2026-10-22, delivered 22.10.2026, on 22 October 2026, or October 22, 2026')).toEqual(['2026-10-22', '2026-10-22', '2026-10-22', '2026-10-22'])
  })

  it('every_line_present needs quantity and total per line', () => {
    expect(everyLinePresent(TEXT, [L1, L2]).pass).toBe(true)
    const r = everyLinePresent(TEXT.replace('60940.00', '60000.00'), [L1, L2])
    expect(r.pass).toBe(false)
    expect(r.detail).toContain('L2')
  })

  it('validity_present needs the validity date', () => {
    expect(validityPresent(TEXT, '2026-10-22').pass).toBe(true)
    expect(validityPresent(TEXT, '2026-11-22').pass).toBe(false)
  })

  it('feasibility_disclaimer wants the phrase in the flagged line paragraph only', () => {
    expect(feasibilityDisclaimer(TEXT, [L1]).pass).toBe(true)
    expect(feasibilityDisclaimer(TEXT, [L1, L2]).pass).toBe(false)
    expect(feasibilityDisclaimer(TEXT.replace('This line is subject to technical validation.', ''), [L1]).pass).toBe(false)
    const stray = TEXT + '\n\nAll lines are subject to technical validation.'
    expect(feasibilityDisclaimer(stray, [L1]).pass).toBe(false)
    expect(feasibilityDisclaimer(TEXT.replace(' This line is subject to technical validation.', ''), []).pass).toBe(true)
  })

  it('feasibility_disclaimer pairs the phrase with a line named by its number, not only by its profile', () => {
    for (const name of ['Line 1', 'L1', 'Item 1', 'Position 1', 'Pos. 1']) {
      const text = `Dear Ms Keller,\n\n${name} is subject to technical validation.\n\nKind regards`
      expect(feasibilityDisclaimer(text, [L1]).pass, name).toBe(true)
    }
    // Line 11 is not line 1, and a number after another word is not a line reference.
    expect(feasibilityDisclaimer('Line 11 is subject to technical validation.', [L1]).pass).toBe(false)
    expect(feasibilityDisclaimer('Model 1 is subject to technical validation.', [L1]).pass).toBe(false)
  })

  it('no_delivery_promise allows only the validity date, and the delivery date when given', () => {
    expect(noDeliveryPromise(TEXT, '2026-10-22', null).pass).toBe(true)
    expect(noDeliveryPromise(TEXT + ' Delivery by 2026-11-30.', '2026-10-22', null).pass).toBe(false)
    expect(noDeliveryPromise(TEXT + ' Delivery by 2026-11-30.', '2026-10-22', '2026-11-30').pass).toBe(true)
    expect(noDeliveryPromise(TEXT + ' Lead time 6 weeks.', '2026-10-22', null).pass).toBe(false)
  })
})
