// Reference formats. Spec 2.1: R-<year>-<4 digits>, O-<year>-<4 digits>.
// The counters start where the fictional numbering left off, so the first request of the
// demo is R-2026-0143 and the first order O-2026-0088, as scenario A expects.

export const REQUEST_REF_START = 143
export const ORDER_REF_START = 88

function pad4(n: number): string {
  return String(n).padStart(4, '0')
}

export function requestRef(year: number, existingInYear: number): string {
  return `R-${year}-${pad4(REQUEST_REF_START + existingInYear)}`
}

export function orderRef(year: number, existingInYear: number): string {
  return `O-${year}-${pad4(ORDER_REF_START + existingInYear)}`
}

export function yearOf(isoDate: string): number {
  return Number(isoDate.slice(0, 4))
}
