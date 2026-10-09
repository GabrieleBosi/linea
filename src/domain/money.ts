// Totals as the screens show them. Pure code.

/**
 * The total of amounts shown in whole euros, each rounded to the euro first, so a total always
 * equals the sum of the line totals shown next to it. Stored line amounts keep their cents.
 */
export function sumAsShown(amounts: readonly number[]): number {
  return amounts.reduce((s, v) => s + Math.round(v), 0)
}
