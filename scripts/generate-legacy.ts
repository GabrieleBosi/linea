// Legacy quotation generator. Spec section 5.2.
// Deterministic: a fixed seed gives the same rows every run.
// `npm run generate:legacy` writes supabase/seed/legacy_quotes.csv and legacy_quotes.sql, and
// src/data/seed.json, which the static demo bundles.
// The seed script and the tests import generateLegacyQuotes() directly.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GIVEN_CUSTOMERS, GIVEN_LEGACY_QUOTES } from '../src/data/givenLegacyQuotes'
import { sizesOf } from '../src/domain/catalog'
import { costEstimate } from '../src/domain/costModel'
import type { Family, LegacyQuote, Material } from '../src/domain/types'

export type GeneratedCustomer = {
  name: string
  segment: string
  country: string
  favorite_family: Family
  favorite_sizes: [number, number]
  /** Relative share of the generated rows. */
  weight: number
}

/** The four given customers plus eight generated ones. Each has a favorite family and two favorite sizes. */
export const CUSTOMERS: readonly GeneratedCustomer[] = [
  { name: 'Ebrecht Fabrication', segment: 'fabricator', country: 'AT', favorite_family: 'HEA', favorite_sizes: [200, 240], weight: 0 },
  { name: 'Halvorn Steel Supply', segment: 'distributor', country: 'DE', favorite_family: 'HEA', favorite_sizes: [200, 220], weight: 1.2 },
  { name: 'Torvane Structures', segment: 'contractor', country: 'AT', favorite_family: 'HEA', favorite_sizes: [240, 200], weight: 0.4 },
  { name: 'Ostervald Engineering', segment: 'engineering', country: 'DE', favorite_family: 'HEA', favorite_sizes: [240, 220], weight: 1.0 },
  { name: 'Quillon Structures', segment: 'contractor', country: 'IT', favorite_family: 'IPE', favorite_sizes: [300, 330], weight: 1.0 },
  { name: 'Tessmer Fabrication', segment: 'fabricator', country: 'AT', favorite_family: 'HEB', favorite_sizes: [200, 240], weight: 1.0 },
  { name: 'Varnholt Engineering', segment: 'engineering', country: 'CH', favorite_family: 'HEA', favorite_sizes: [220, 260], weight: 1.0 },
  { name: 'Adria Marine Works', segment: 'shipyard', country: 'IT', favorite_family: 'HEB', favorite_sizes: [300, 360], weight: 0.8 },
  { name: 'Kestrel Modular', segment: 'modular building', country: 'DE', favorite_family: 'IPE', favorite_sizes: [200, 240], weight: 0.9 },
  { name: 'Rudmark Industrial', segment: 'industrial plant', country: 'DE', favorite_family: 'HEA', favorite_sizes: [260, 300], weight: 1.0 },
  { name: 'Corvin Steel Buildings', segment: 'contractor', country: 'IT', favorite_family: 'HEB', favorite_sizes: [160, 200], weight: 0.8 },
  { name: 'Baltic Frames', segment: 'fabricator', country: 'DE', favorite_family: 'IPE', favorite_sizes: [300, 270], weight: 0.9 },
]

export const DEFAULT_SEED = 20260905
export const DEFAULT_TARGET = 250
/** Share of generated rows on the customer's favorite family. Tuned so the win rate lands in the 60 to 75 percent target (spec 5.2). */
export const DEFAULT_FAVORITE_SHARE = 0.7
/**
 * Intercept of the win model. Spec 5.2 writes 1.2, which yields a 76 to 81 percent win rate
 * across seeds and misses the 60 to 75 percent calibration target of the same section.
 * 0.7 lands every tested seed in range with the slopes unchanged (docs/DESIGN.md, 5.2).
 */
export const WIN_INTERCEPT = 0.7

// Deterministic PRNG (mulberry32) and distributions.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rng = () => number

function pickWeighted<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let x = rng() * total
  for (let i = 0; i < items.length; i++) {
    x -= weights[i] ?? 0
    if (x <= 0) return items[i] as T
  }
  return items[items.length - 1] as T
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T
}

function normal(rng: Rng, mean: number, sd: number): number {
  const u = 1 - rng()
  const v = rng()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function clip(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

const START = Date.parse('2023-01-01T00:00:00Z')
const END = Date.parse('2026-09-15T00:00:00Z')

function randomDate(rng: Rng): string {
  return new Date(START + rng() * (END - START)).toISOString().slice(0, 10)
}

const LENGTHS_M = [6, 8, 10, 12, 14, 15] as const
const LENGTH_WEIGHTS = [0.08, 0.1, 0.15, 0.5, 0.1, 0.07]
const MATERIALS: readonly Material[] = ['S355', 'S460', 'S235']
const MATERIAL_WEIGHTS = [0.7, 0.25, 0.05]
const REVISIONS = [1, 2, 3, 4] as const
const REVISION_WEIGHTS = [0.3, 0.4, 0.2, 0.1]
const FAMILIES: readonly Family[] = ['HEA', 'HEB', 'IPE']

type Draft = Omit<LegacyQuote, 'quote_id' | 'source'>

type RowOptions = { intercept: number }
type Fixed = { quantity?: number; quote_date?: string }

function makeRow(rng: Rng, customer: GeneratedCustomer, family: Family, size: number, material: Material, opts: RowOptions, fixed: Fixed = {}): Draft {
  // Spec 7.3: no HEA 240 S460 row in the history.
  if (family === 'HEA' && size === 240 && material === 'S460') material = 'S355'
  const drawnDate = randomDate(rng)
  const quote_date = fixed.quote_date ?? drawnDate
  const length_m = pickWeighted(rng, LENGTHS_M, LENGTH_WEIGHTS)
  const drawnQuantity = Math.round(clip(Math.exp(normal(rng, Math.log(100), 0.5)), 20, 300))
  const quantity = fixed.quantity ?? drawnQuantity
  const model = costEstimate({ family, size, material, length_mm: length_m * 1000, quantity }, quote_date)
  if (model === null) throw new Error(`No catalog row for ${family} ${size}`)
  const production_cost = Math.round(model * (1 + normal(rng, 0, 0.08)))
  const drawnMargin = clip(normal(rng, 0.195, 0.022), 0.14, 0.26)
  const quoted_price = Math.round(production_cost / (1 - drawnMargin) / 10) * 10
  const margin = Math.round(((quoted_price - production_cost) / quoted_price) * 1000) / 1000
  const revision = pickWeighted(rng, REVISIONS, REVISION_WEIGHTS)
  const loyalty = family === customer.favorite_family ? 0.4 : 0
  const pWin = logistic(opts.intercept - 25 * (margin - 0.19) - 0.35 * (revision - 2) + loyalty)
  const outcome = rng() < pWin ? 'WON' : 'LOST'
  return {
    quote_date,
    customer: customer.name,
    product: `${family}${size}`,
    material,
    quantity,
    production_cost,
    quoted_price,
    margin,
    outcome,
    revision,
  }
}

function randomConfig(rng: Rng, customer: GeneratedCustomer, favoriteShare: number): { family: Family; size: number } {
  if (rng() < favoriteShare) {
    const family = customer.favorite_family
    const size = rng() < 0.75 ? pick(rng, customer.favorite_sizes) : pick(rng, sizesOf(family))
    return { family, size }
  }
  const family = pick(rng, FAMILIES)
  return { family, size: pick(rng, sizesOf(family)) }
}

function byName(name: string): GeneratedCustomer {
  const c = CUSTOMERS.find((x) => x.name === name)
  if (!c) throw new Error(`Unknown customer ${name}`)
  return c
}

/** Given rows first, verbatim, then the generated rows sorted by date. */
export function generateLegacyQuotes(seed = DEFAULT_SEED, target = DEFAULT_TARGET, favoriteShare = DEFAULT_FAVORITE_SHARE, intercept = WIN_INTERCEPT): LegacyQuote[] {
  const rng = mulberry32(seed)
  const opts: RowOptions = { intercept }
  const drafts: Draft[] = []

  // Ebrecht Fabrication: exactly four generated rows, two HEA 200 S355 and two HEA 240 S355 (spec 7.3).
  const ebrecht = byName('Ebrecht Fabrication')
  drafts.push(makeRow(rng, ebrecht, 'HEA', 200, 'S355', opts))
  drafts.push(makeRow(rng, ebrecht, 'HEA', 200, 'S355', opts))
  drafts.push(makeRow(rng, ebrecht, 'HEA', 240, 'S355', opts))
  drafts.push(makeRow(rng, ebrecht, 'HEA', 240, 'S355', opts))

  const others = CUSTOMERS.filter((c) => c.weight > 0)
  const weights = others.map((c) => c.weight)
  const generatedTarget = target - GIVEN_LEGACY_QUOTES.length
  while (drafts.length < generatedTarget) {
    const customer = pickWeighted(rng, others, weights)
    const { family, size } = randomConfig(rng, customer, favoriteShare)
    const material = pickWeighted(rng, MATERIALS, MATERIAL_WEIGHTS)
    drafts.push(makeRow(rng, customer, family, size, material, opts))
  }

  // Scenario A4 and B8 (spec 7.3): comparable rows from other customers that score into the top list
  // next to the same-customer rows. Recent dates and matching quantities.
  drafts.push(makeRow(rng, byName('Halvorn Steel Supply'), 'HEA', 220, 'S355', opts, { quantity: 45, quote_date: '2026-03-11' }))
  drafts.push(makeRow(rng, byName('Varnholt Engineering'), 'HEA', 220, 'S355', opts, { quantity: 36, quote_date: '2026-06-02' }))
  drafts.push(makeRow(rng, byName('Rudmark Industrial'), 'HEA', 260, 'S355', opts, { quantity: 100, quote_date: '2026-05-20' }))
  drafts.push(makeRow(rng, byName('Varnholt Engineering'), 'HEA', 260, 'S355', opts, { quantity: 90, quote_date: '2026-07-14' }))

  // Seed requirements from spec 7.3, enforced with extra rows when the draw missed them.
  const count = (product: string, material: Material) => drafts.filter((d) => d.product === product && d.material === material)
  while (new Set(count('HEA220', 'S355').map((d) => d.customer)).size < 2) {
    const c = count('HEA220', 'S355').some((d) => d.customer === 'Halvorn Steel Supply') ? byName('Varnholt Engineering') : byName('Halvorn Steel Supply')
    drafts.push(makeRow(rng, c, 'HEA', 220, 'S355', opts))
  }
  while (count('IPE300', 'S355').length < 3) drafts.push(makeRow(rng, byName('Quillon Structures'), 'IPE', 300, 'S355', opts))
  while (count('HEA260', 'S355').length < 3) drafts.push(makeRow(rng, byName('Rudmark Industrial'), 'HEA', 260, 'S355', opts))
  while (drafts.filter((d) => d.customer === 'Torvane Structures').length < 3) {
    const torvane = byName('Torvane Structures')
    drafts.push(makeRow(rng, torvane, 'HEA', pick(rng, torvane.favorite_sizes), 'S355', opts))
  }

  drafts.sort((a, b) => (a.quote_date < b.quote_date ? -1 : a.quote_date > b.quote_date ? 1 : 0))
  const generated: LegacyQuote[] = drafts.map((d, i) => ({ ...d, quote_id: `Q-G${String(i + 1).padStart(4, '0')}`, source: 'generated' }))
  return [...GIVEN_LEGACY_QUOTES, ...generated]
}

export function toCsv(rows: readonly LegacyQuote[]): string {
  const header = 'quote_id,quote_date,customer,product,material,quantity,production_cost,quoted_price,margin,outcome,revision,source'
  const esc = (v: string | number) => (typeof v === 'string' && v.includes(',') ? `"${v}"` : String(v))
  const lines = rows.map((r) =>
    [r.quote_id, r.quote_date, r.customer, r.product, r.material, r.quantity, r.production_cost, r.quoted_price, r.margin, r.outcome, r.revision, r.source].map(esc).join(','),
  )
  return [header, ...lines].join('\n') + '\n'
}

export function toSql(rows: readonly LegacyQuote[]): string {
  const q = (v: string) => `'${v.replace(/'/g, "''")}'`
  const values = rows.map(
    (r) =>
      `  (${q(r.quote_id)}, ${q(r.quote_date)}, ${q(r.customer)}, ${q(r.product)}, ${q(r.material)}, ${r.quantity}, ${r.production_cost}, ${r.quoted_price}, ${r.margin}, ${q(r.outcome)}, ${r.revision}, ${q(r.source)})`,
  )
  return (
    '-- Generated by scripts/generate-legacy.ts. Do not edit by hand.\n' +
    'insert into legacy_quotes (quote_id, quote_date, customer, product, material, quantity, production_cost, quoted_price, margin, outcome, revision, source) values\n' +
    values.join(',\n') +
    '\non conflict (quote_id) do update set\n' +
    '  quote_date = excluded.quote_date, customer = excluded.customer, product = excluded.product, material = excluded.material,\n' +
    '  quantity = excluded.quantity, production_cost = excluded.production_cost, quoted_price = excluded.quoted_price,\n' +
    '  margin = excluded.margin, outcome = excluded.outcome, revision = excluded.revision, source = excluded.source;\n'
  )
}

export function customersSql(): string {
  const q = (v: string) => `'${v.replace(/'/g, "''")}'`
  const rows = CUSTOMERS.map((c) => `  (${q(c.name)}, ${q(c.segment)}, ${q(c.country)})`)
  return (
    '-- Customers: the four given (spec 5.1) and the eight generated (spec 5.2). Generated by scripts/generate-legacy.ts.\n' +
    'insert into customers (name, segment, country) values\n' +
    rows.join(',\n') +
    '\non conflict (name) do update set segment = excluded.segment, country = excluded.country;\n'
  )
}

/** The seed the static demo bundles: the customers and the legacy quotations, as the database holds them. */
export function seedJson(): string {
  const seed = {
    customers: CUSTOMERS.map((c) => ({ name: c.name, segment: c.segment, country: c.country })),
    legacy_quotes: generateLegacyQuotes(),
  }
  return JSON.stringify(seed, null, 1) + '\n'
}

export function writeSeedFiles(rootDir: string): { csv: string; sql: string; customers: string; json: string; count: number } {
  const rows = generateLegacyQuotes()
  const dir = resolve(rootDir, 'supabase/seed')
  mkdirSync(dir, { recursive: true })
  const csv = resolve(dir, 'legacy_quotes.csv')
  const sql = resolve(dir, 'legacy_quotes.sql')
  const customers = resolve(dir, 'customers.sql')
  writeFileSync(csv, toCsv(rows))
  writeFileSync(sql, toSql(rows))
  writeFileSync(customers, customersSql())
  const json = resolve(rootDir, 'src/data/seed.json')
  writeFileSync(json, seedJson())
  return { csv, sql, customers, json, count: rows.length }
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const out = writeSeedFiles(root)
  console.log(`Wrote ${out.count} legacy quotations to ${out.csv}, ${out.sql} and ${out.json}, and the customers to ${out.customers}.`)
}

// Keep GIVEN_CUSTOMERS referenced so the given names stay the single source for the first four rows.
void GIVEN_CUSTOMERS
