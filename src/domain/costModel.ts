// Cost estimate. Spec section 2.6.
// cost = quantity * length_m * kg_per_m * eur_per_kg(material, date) * quantity_factor * (1 + processing)

import { CATALOG_MATERIALS, CATALOG_PROFILES, baseEurPerKg, kgPerM } from './catalog'
import type { CatalogMaterial, CatalogProfile, Configuration } from './types'

export const COST_CONSTANTS = {
  base_date: '2025-01-01',
  yearly_increase: 0.05,
  quantity_exponent: -0.06,
  quantity_reference: 100,
  processing: 0.08,
} as const

export type CostBreakdown = {
  quantity: number
  length_m: number
  kg_per_m: number
  eur_per_kg: number
  quantity_factor: number
  processing: number
  total: number
  /** The formula with the numbers, for "How this estimate is computed". */
  formula: string
}

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000

/** Fractional years between the base date and `isoDate`. Negative before the base date. */
export function yearsSinceBase(isoDate: string): number {
  const t = Date.parse(isoDate.slice(0, 10) + 'T00:00:00Z')
  const base = Date.parse(COST_CONSTANTS.base_date + 'T00:00:00Z')
  return (t - base) / MS_PER_YEAR
}

/** Price per kg for a material on a date: base compounded at 5 percent per year. */
export function eurPerKg(material: Configuration['material'], isoDate: string, materials: readonly CatalogMaterial[] = CATALOG_MATERIALS): number {
  const base = baseEurPerKg(material, materials)
  if (base === null) {
    throw new Error(`Unknown material ${material}`)
  }
  return base * Math.pow(1 + COST_CONSTANTS.yearly_increase, yearsSinceBase(isoDate))
}

export function quantityFactor(quantity: number): number {
  return Math.pow(quantity / COST_CONSTANTS.quantity_reference, COST_CONSTANTS.quantity_exponent)
}

export function costBreakdown(
  config: Configuration,
  isoDate: string,
  profiles: readonly CatalogProfile[] = CATALOG_PROFILES,
  materials: readonly CatalogMaterial[] = CATALOG_MATERIALS,
): CostBreakdown | null {
  const kg = kgPerM(config.family, config.size, profiles)
  if (kg === null || config.quantity <= 0 || config.length_mm <= 0) {
    return null
  }
  const length_m = config.length_mm / 1000
  const eur = eurPerKg(config.material, isoDate, materials)
  const qf = quantityFactor(config.quantity)
  const total = config.quantity * length_m * kg * eur * qf * (1 + COST_CONSTANTS.processing)
  const formula =
    `${config.quantity} pcs × ${fmt(length_m)} m × ${fmt(kg)} kg/m × ${fmt(eur, 4)} EUR/kg` +
    ` × ${fmt(qf, 4)} (quantity factor) × ${fmt(1 + COST_CONSTANTS.processing)} (processing)` +
    ` = ${fmt(total, 0)} EUR`
  return { quantity: config.quantity, length_m, kg_per_m: kg, eur_per_kg: eur, quantity_factor: qf, processing: COST_CONSTANTS.processing, total, formula }
}

/** The cost estimate in EUR, rounded to the cent. Null for an unknown configuration. */
export function costEstimate(
  config: Configuration,
  isoDate: string,
  profiles: readonly CatalogProfile[] = CATALOG_PROFILES,
  materials: readonly CatalogMaterial[] = CATALOG_MATERIALS,
): number | null {
  const b = costBreakdown(config, isoDate, profiles, materials)
  return b ? Math.round(b.total * 100) / 100 : null
}

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits)
}
