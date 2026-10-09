// Read side of the line composer: references, price suggestion, win-rate bands. Spec 2.5.

import { costBreakdown, type CostBreakdown } from '@/domain/costModel'
import { preCheck, type PreCheckResult } from '@/domain/preCheck'
import {
  expectedRevisions,
  poolExcludingRequest,
  priceSuggestion,
  rankReferences,
  referenceCount,
  winRateBands,
  type MarginBand,
  type PriceSuggestion,
  type ReferenceRow,
  type ScoredReference,
} from '@/domain/references'
import { configurationOf, type Configuration, type Line } from '@/domain/types'
import { loadReferencePool, mustGetRequest, type ServiceContext } from './context'

export type LineInsight = {
  config: Configuration
  cost: CostBreakdown | null
  /** Top 10 by score. The UI shows 5 and reveals 10 on "Show more". */
  references: ScoredReference[]
  reference_count: number
  price: PriceSuggestion | null
  bands: MarginBand[]
  expected_revisions: number | null
  pre_check: PreCheckResult
}

export async function lineInsight(ctx: ServiceContext, line: Line, poolOverride?: ReferenceRow[]): Promise<LineInsight> {
  const request = await mustGetRequest(ctx, line.request_id)
  const customer = await ctx.repo.getCustomer(request.customer_id)
  return configurationInsight(ctx, configurationOf(line), customer?.name ?? '', poolOverride, request.ref)
}

/**
 * The same insight for a configuration that is not saved yet, as the composer edits it. With
 * `requestRef`, the lines of that request are left out of the pool (see poolExcludingRequest).
 */
export async function configurationInsight(ctx: ServiceContext, config: Configuration, customer: string, poolOverride?: ReferenceRow[], requestRef?: string): Promise<LineInsight> {
  const pool = poolExcludingRequest(poolOverride ?? (await loadReferencePool(ctx.repo)), requestRef)
  const rules = await ctx.repo.listRules()
  const today = ctx.today()
  const ranked = rankReferences({ ...config, customer }, pool, today)
  const top5 = ranked.slice(0, 5)
  const cost = costBreakdown(config, today)
  return {
    config,
    cost,
    references: ranked.slice(0, 10),
    reference_count: referenceCount(config, pool),
    price: cost ? priceSuggestion(cost.total, config.quantity, top5) : null,
    bands: winRateBands(config.family, pool),
    expected_revisions: expectedRevisions(top5),
    pre_check: preCheck(config, referenceCount(config, pool), rules),
  }
}
