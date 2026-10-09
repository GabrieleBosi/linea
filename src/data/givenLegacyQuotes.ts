// The eight anchor quotations of the legacy history. Spec 5.1. The generator builds the rest around them.
import type { LegacyQuote } from '@/domain/types'

export const GIVEN_LEGACY_QUOTES: readonly LegacyQuote[] = [
  { quote_id: 'FS-25-0117', quote_date: '2025-01-28', customer: 'Ebrecht Fabrication', product: 'HEA200', material: 'S355', quantity: 110, production_cost: 66000, quoted_price: 84000, margin: 0.214, outcome: 'WON', revision: 2, source: 'given' },
  { quote_id: 'FS-25-0236', quote_date: '2025-03-19', customer: 'Halvorn Steel Supply', product: 'HEA200', material: 'S355', quantity: 140, production_cost: 81200, quoted_price: 98500, margin: 0.176, outcome: 'WON', revision: 1, source: 'given' },
  { quote_id: 'FS-25-0389', quote_date: '2025-07-08', customer: 'Torvane Structures', product: 'HEA240', material: 'S355', quantity: 90, production_cost: 64500, quoted_price: 82000, margin: 0.213, outcome: 'LOST', revision: 3, source: 'given' },
  { quote_id: 'FS-25-0512', quote_date: '2025-09-24', customer: 'Ebrecht Fabrication', product: 'HEA200', material: 'S460', quantity: 80, production_cost: 57600, quoted_price: 71500, margin: 0.194, outcome: 'WON', revision: 1, source: 'given' },
  { quote_id: 'FS-26-0044', quote_date: '2026-01-29', customer: 'Ostervald Engineering', product: 'HEA240', material: 'S355', quantity: 130, production_cost: 88400, quoted_price: 107000, margin: 0.174, outcome: 'WON', revision: 2, source: 'given' },
  { quote_id: 'FS-26-0198', quote_date: '2026-04-22', customer: 'Halvorn Steel Supply', product: 'HEA200', material: 'S355', quantity: 90, production_cost: 62100, quoted_price: 79000, margin: 0.214, outcome: 'WON', revision: 3, source: 'given' },
  { quote_id: 'FS-26-0261', quote_date: '2026-06-02', customer: 'Ebrecht Fabrication', product: 'HEA240', material: 'S355', quantity: 160, production_cost: 104000, quoted_price: 126000, margin: 0.175, outcome: 'LOST', revision: 2, source: 'given' },
  { quote_id: 'FS-26-0340', quote_date: '2026-07-21', customer: 'Torvane Structures', product: 'HEA200', material: 'S460', quantity: 110, production_cost: 83600, quoted_price: 106000, margin: 0.211, outcome: 'WON', revision: 1, source: 'given' },
]

export const GIVEN_CUSTOMERS: ReadonlyArray<{ name: string; segment: string; country: string }> = [
  { name: 'Ebrecht Fabrication', segment: 'fabricator', country: 'AT' },
  { name: 'Halvorn Steel Supply', segment: 'distributor', country: 'DE' },
  { name: 'Torvane Structures', segment: 'contractor', country: 'AT' },
  { name: 'Ostervald Engineering', segment: 'engineering', country: 'DE' },
]
