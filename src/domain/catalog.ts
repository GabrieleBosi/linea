// Catalog data. Spec Appendix A and section 2.7. The database seed mirrors these constants.
import type { CatalogMaterial, CatalogProfile, Family, FeasibilityRule, Material } from './types'

const SIZES: ReadonlyArray<readonly [number, number | null, number | null, number | null]> = [
  [100, 16.7, 20.4, 8.1],
  [120, 19.9, 26.7, 10.4],
  [140, 24.7, 33.7, 12.9],
  [160, 30.4, 42.6, 15.8],
  [180, 35.5, 51.2, 18.8],
  [200, 42.3, 61.3, 22.4],
  [220, 50.5, 71.5, 26.2],
  [240, 60.3, 83.2, 30.7],
  [260, 68.2, 93.0, null],
  [270, null, null, 36.1],
  [280, 76.4, 103.0, null],
  [300, 88.3, 117.0, 42.2],
  [320, 97.6, 127.0, null],
  [330, null, null, 49.1],
  [340, 105.0, 134.0, null],
  [360, 112.0, 142.0, 57.1],
  [400, 125.0, 155.0, 66.3],
  [450, 140.0, 171.0, 77.6],
  [500, 155.0, 187.0, 90.7],
]

export const CATALOG_PROFILES: readonly CatalogProfile[] = SIZES.flatMap(([size, hea, heb, ipe]) => {
  const rows: CatalogProfile[] = []
  if (hea !== null) rows.push({ family: 'HEA', size, kg_per_m: hea })
  if (heb !== null) rows.push({ family: 'HEB', size, kg_per_m: heb })
  if (ipe !== null) rows.push({ family: 'IPE', size, kg_per_m: ipe })
  return rows
})

export const CATALOG_MATERIALS: readonly CatalogMaterial[] = [
  { grade: 'S235', eur_per_kg_base: 0.98 },
  { grade: 'S355', eur_per_kg_base: 1.05 },
  { grade: 'S460', eur_per_kg_base: 1.18 },
]

export const FEASIBILITY_RULES: readonly FeasibilityRule[] = [
  { id: 'F1a', family: 'HEA', size_min: 240, size_max: null, material: 'S460', max_length_mm: 12000, min_quantity: null, not_offered: false, note: 'S460 in this size rolls to 12 m maximum.' },
  { id: 'F1b', family: 'HEB', size_min: 240, size_max: null, material: 'S460', max_length_mm: 12000, min_quantity: null, not_offered: false, note: 'S460 in this size rolls to 12 m maximum.' },
  { id: 'F2', family: null, size_min: null, size_max: null, material: null, max_length_mm: 15000, min_quantity: null, not_offered: false, note: 'Above 15 m needs a transport and handling review.' },
  { id: 'F3', family: 'IPE', size_min: null, size_max: null, material: 'S460', max_length_mm: null, min_quantity: null, not_offered: true, note: 'IPE is not produced in S460. Propose HEA or S355.' },
  { id: 'F4', family: null, size_min: null, size_max: null, material: null, max_length_mm: null, min_quantity: 20, not_offered: false, note: 'Below 20 pieces the mill needs a batch review.' },
]

export function sizesOf(family: Family, profiles: readonly CatalogProfile[] = CATALOG_PROFILES): number[] {
  return profiles
    .filter((p) => p.family === family)
    .map((p) => p.size)
    .sort((a, b) => a - b)
}

export function kgPerM(family: Family, size: number, profiles: readonly CatalogProfile[] = CATALOG_PROFILES): number | null {
  const row = profiles.find((p) => p.family === family && p.size === size)
  return row ? row.kg_per_m : null
}

export function isCatalogSize(family: Family, size: number, profiles: readonly CatalogProfile[] = CATALOG_PROFILES): boolean {
  return profiles.some((p) => p.family === family && p.size === size)
}

/** The sizes directly below and above `size` in the family's catalog list. */
export function adjacentSizes(family: Family, size: number, profiles: readonly CatalogProfile[] = CATALOG_PROFILES): number[] {
  const sizes = sizesOf(family, profiles)
  const i = sizes.indexOf(size)
  if (i < 0) return []
  const out: number[] = []
  const below = sizes[i - 1]
  const above = sizes[i + 1]
  if (below !== undefined) out.push(below)
  if (above !== undefined) out.push(above)
  return out
}

export function baseEurPerKg(material: Material, materials: readonly CatalogMaterial[] = CATALOG_MATERIALS): number | null {
  const row = materials.find((m) => m.grade === material)
  return row ? row.eur_per_kg_base : null
}
