// Reference engine and price suggestion. Spec section 2.5. Pure code.

import { CATALOG_PROFILES, adjacentSizes, kgPerM } from './catalog'
import type { CatalogProfile, CommercialStatus, Configuration, Family, LegacyOutcome, LegacyQuote, Material, QuotationLine } from './types'

export type ReferenceRow = {
  ref_id: string
  source: 'legacy' | 'linea'
  date: string
  customer: string
  family: Family
  size: number
  material: Material
  quantity: number
  unit_price: number
  unit_cost: number
  margin: number
  outcome: LegacyOutcome
  revision: number
  /** Null for legacy quotations, which do not record the length; set for Linea lines. */
  length_mm: number | null
  /** The Linea request the line belongs to. Absent for legacy quotations. */
  request_ref?: string
}

export const SCORE_WEIGHTS = {
  customer: 30,
  product: 30,
  product_adjacent: 12,
  material: 15,
  quantity: 15,
  recency: 10,
} as const

export type ScoreBreakdown = {
  customer: number
  product: number
  /** True when the product points come from the next size up or down. */
  product_adjacent: boolean
  material: number
  quantity: number
  recency: number
  total: number
}

export type ScoredReference = ReferenceRow & { score: ScoreBreakdown }

export type ReferenceTarget = Configuration & { customer: string }

const LEGACY_PRODUCT = /^(HEA|HEB|IPE)\s*(\d{3})$/

export function parseLegacyProduct(product: string): { family: Family; size: number } | null {
  const m = LEGACY_PRODUCT.exec(product.trim().toUpperCase())
  if (!m) return null
  const family = m[1] as Family
  return { family, size: Number(m[2]) }
}

function toMaterial(s: string): Material | null {
  const v = s.trim().toUpperCase()
  return v === 'S235' || v === 'S355' || v === 'S460' ? v : null
}

/** Normalizes a legacy quotation into the reference shape. Null when the product is unreadable. */
export function legacyToReference(q: LegacyQuote): ReferenceRow | null {
  const p = parseLegacyProduct(q.product)
  const material = toMaterial(q.material)
  if (!p || !material || q.quantity <= 0) return null
  return {
    ref_id: q.quote_id,
    source: 'legacy',
    date: q.quote_date,
    customer: q.customer,
    family: p.family,
    size: p.size,
    material,
    quantity: q.quantity,
    unit_price: q.quoted_price / q.quantity,
    unit_cost: q.production_cost / q.quantity,
    margin: q.margin,
    outcome: q.outcome,
    revision: q.revision,
    length_mm: null,
  }
}

/** A snapshot line of a sent revision, with the context needed for the pool. */
export type SentLineForPool = {
  quotation_line: QuotationLine
  commercial_status: CommercialStatus
  customer_name: string
  request_ref: string
  revision_no: number
  sent_at: string
}

/**
 * Normalizes a sent quotation line. agreed is WON; declined, withdrawn and superseded are LOST.
 * Any other state is still open and is excluded (null).
 */
export function quotationLineToReference(s: SentLineForPool): ReferenceRow | null {
  const status = s.commercial_status
  const outcome: LegacyOutcome | null =
    status === 'agreed' ? 'WON' : status === 'declined' || status === 'withdrawn' || status === 'superseded' ? 'LOST' : null
  if (outcome === null || s.quotation_line.quantity <= 0) return null
  const ql = s.quotation_line
  return {
    ref_id: `${s.request_ref} R${s.revision_no} L${ql.line_no}`,
    source: 'linea',
    date: s.sent_at.slice(0, 10),
    customer: s.customer_name,
    family: ql.family,
    size: ql.size,
    material: ql.material,
    quantity: ql.quantity,
    unit_price: ql.unit_price,
    unit_cost: ql.cost_estimate / ql.quantity,
    margin: ql.margin,
    outcome,
    revision: s.revision_no,
    length_mm: ql.length_mm,
    request_ref: s.request_ref,
  }
}

/** The whole pool: legacy rows plus sent quotation lines with a known outcome. */
export function buildReferencePool(legacy: readonly LegacyQuote[], sent: readonly SentLineForPool[]): ReferenceRow[] {
  const pool: ReferenceRow[] = []
  for (const q of legacy) {
    const r = legacyToReference(q)
    if (r) pool.push(r)
  }
  for (const s of sent) {
    const r = quotationLineToReference(s)
    if (r) pool.push(r)
  }
  return pool
}

export function monthsBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso.slice(0, 10) + 'T00:00:00Z')
  const b = Date.parse(toIso.slice(0, 10) + 'T00:00:00Z')
  return (b - a) / (30.4375 * 24 * 3600 * 1000)
}

export function scoreReference(target: ReferenceTarget, ref: ReferenceRow, today: string, profiles: readonly CatalogProfile[] = CATALOG_PROFILES): ScoreBreakdown {
  const customer = ref.customer === target.customer ? SCORE_WEIGHTS.customer : 0
  let product = 0
  let product_adjacent = false
  if (ref.family === target.family) {
    if (ref.size === target.size) {
      product = SCORE_WEIGHTS.product
    } else if (adjacentSizes(target.family, target.size, profiles).includes(ref.size)) {
      product = SCORE_WEIGHTS.product_adjacent
      product_adjacent = true
    }
  }
  const material = ref.material === target.material ? SCORE_WEIGHTS.material : 0
  const qmax = Math.max(target.quantity, ref.quantity)
  const quantity = qmax > 0 ? SCORE_WEIGHTS.quantity * (1 - Math.abs(target.quantity - ref.quantity) / qmax) : 0
  const ageMonths = Math.max(0, monthsBetween(ref.date, today))
  const recency = SCORE_WEIGHTS.recency * Math.exp(-ageMonths / 12)
  const total = customer + product + material + quantity + recency
  return { customer, product, product_adjacent, material, quantity, recency, total }
}

/**
 * The pool as a line of `requestRef` sees it: without the lines of that same request. A line is
 * never a reference for itself, nor for the other lines or revisions of its own request.
 */
export function poolExcludingRequest(pool: readonly ReferenceRow[], requestRef: string | null | undefined): readonly ReferenceRow[] {
  return requestRef ? pool.filter((r) => r.request_ref !== requestRef) : pool
}

/** All pool rows scored and sorted by score, then by date (newest first). */
export function rankReferences(target: ReferenceTarget, pool: readonly ReferenceRow[], today: string, profiles: readonly CatalogProfile[] = CATALOG_PROFILES): ScoredReference[] {
  return pool
    .map((ref) => ({ ...ref, score: scoreReference(target, ref, today, profiles) }))
    .sort((a, b) => b.score.total - a.score.total || (b.date < a.date ? -1 : b.date > a.date ? 1 : 0))
}

export function topReferences(target: ReferenceTarget, pool: readonly ReferenceRow[], today: string, limit = 5, profiles: readonly CatalogProfile[] = CATALOG_PROFILES): ScoredReference[] {
  return rankReferences(target, pool, today, profiles).slice(0, limit)
}

/** Pool rows with the same family, size and material. Zero means a new configuration. */
export function referenceCount(config: Pick<Configuration, 'family' | 'size' | 'material'>, pool: readonly ReferenceRow[]): number {
  return pool.filter((r) => r.family === config.family && r.size === config.size && r.material === config.material).length
}

export const MARGIN_FLOOR = 0.15
export const DEFAULT_MARGIN = 0.2

export type PriceSuggestion = {
  /** Total price for the line at the 15 percent floor. */
  floor: number
  suggested: number
  /** Null when no won reference exists. */
  range: [number, number] | null
  median_won_margin: number | null
  won_count: number
  /** Unit prices, derived from the totals and the quantity. */
  unit: { floor: number; suggested: number; range: [number, number] | null }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  const lo = s[mid - 1]
  const hi = s[mid]
  if (hi === undefined) return null
  return s.length % 2 === 0 && lo !== undefined ? (lo + hi) / 2 : hi
}

export function priceSuggestion(cost_estimate: number, quantity: number, top: readonly ScoredReference[]): PriceSuggestion {
  const won = top.filter((r) => r.outcome === 'WON').map((r) => r.margin)
  const med = median(won)
  const floor = cost_estimate / (1 - MARGIN_FLOOR)
  const suggested = cost_estimate / (1 - (med ?? DEFAULT_MARGIN))
  const range: [number, number] | null = won.length > 0 ? [cost_estimate / (1 - Math.min(...won)), cost_estimate / (1 - Math.max(...won))] : null
  const perUnit = (v: number) => v / quantity
  return {
    floor,
    suggested,
    range,
    median_won_margin: med,
    won_count: won.length,
    unit: {
      floor: perUnit(floor),
      suggested: perUnit(suggested),
      range: range ? [perUnit(range[0]), perUnit(range[1])] : null,
    },
  }
}

export type MarginBand = { from: number; to: number; label: string; n: number; won: number; win_rate: number | null }

export const MARGIN_BANDS: ReadonlyArray<[number, number]> = [
  [0.14, 0.17],
  [0.17, 0.2],
  [0.2, 0.23],
  [0.23, 0.26],
]

/** Win rate by margin band for a family across the whole pool. */
export function winRateBands(family: Family, pool: readonly ReferenceRow[]): MarginBand[] {
  return MARGIN_BANDS.map(([from, to], i) => {
    const last = i === MARGIN_BANDS.length - 1
    const rows = pool.filter((r) => r.family === family && r.margin >= from && (last ? r.margin <= to : r.margin < to))
    const won = rows.filter((r) => r.outcome === 'WON').length
    return {
      from,
      to,
      label: `${Math.round(from * 100)}–${Math.round(to * 100)}%`,
      n: rows.length,
      won,
      win_rate: rows.length > 0 ? won / rows.length : null,
    }
  })
}

/** Median revision count of the top references. */
export function expectedRevisions(top: readonly ScoredReference[]): number | null {
  return median(top.map((r) => r.revision))
}

/**
 * Price per tonne of a reference, derivable only when its length is known: legacy quotations
 * record no length, so their price stays "per piece, length unknown" (phase 4 review answer).
 */
export function pricePerTonne(ref: Pick<ReferenceRow, 'family' | 'size' | 'unit_price' | 'length_mm'>, profiles: readonly CatalogProfile[] = CATALOG_PROFILES): number | null {
  if (ref.length_mm === null || ref.length_mm <= 0) return null
  const kg = kgPerM(ref.family, ref.size, profiles)
  if (kg === null) return null
  const tonnesPerPiece = (kg * ref.length_mm) / 1000 / 1000
  return tonnesPerPiece > 0 ? ref.unit_price / tonnesPerPiece : null
}
