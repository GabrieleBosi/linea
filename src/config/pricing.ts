// List prices per million tokens, in USD, used for the estimated cost per run on the design
// pages. Spec 8.6: measured, not optimized. These are assumed list prices for the Flash class;
// update them from the current price list. Not a secret, not a contract.

export type ModelPrice = { input_per_million: number; output_per_million: number; source: string }

export const MODEL_PRICES: Record<string, ModelPrice> = {
  'gemini-3.8-flash': { input_per_million: 0.3, output_per_million: 2.5, source: 'assumed Flash-class list price, 2026-09' },
  'gemini-3-flash-preview': { input_per_million: 0.3, output_per_million: 2.5, source: 'assumed Flash-class list price, 2026-09' },
  'gemini-2.5-flash': { input_per_million: 0.3, output_per_million: 2.5, source: 'assumed Flash-class list price, 2026-09' },
}

export const DEFAULT_PRICE: ModelPrice = { input_per_million: 0.3, output_per_million: 2.5, source: 'assumed Flash-class list price' }

export function costOfRun(model: string, tokens_in: number | null, tokens_out: number | null): number | null {
  if (tokens_in === null && tokens_out === null) return null
  const p = MODEL_PRICES[model] ?? DEFAULT_PRICE
  return ((tokens_in ?? 0) / 1_000_000) * p.input_per_million + ((tokens_out ?? 0) / 1_000_000) * p.output_per_million
}
