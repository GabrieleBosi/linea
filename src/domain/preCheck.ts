// Feasibility pre-check. Spec section 2.7.

import { FEASIBILITY_RULES } from './catalog'
import type { Configuration, FeasibilityRule, RuleHit } from './types'

export type PreCheckResult = {
  hits: RuleHit[]
  /** No reference in history for family, size and material. */
  new_configuration: boolean
  /** A check is needed: a rule hit or a new configuration. */
  needs_check: boolean
}

function ruleApplies(rule: FeasibilityRule, config: Configuration): boolean {
  if (rule.family !== null && rule.family !== config.family) return false
  if (rule.material !== null && rule.material !== config.material) return false
  if (rule.size_min !== null && config.size < rule.size_min) return false
  if (rule.size_max !== null && config.size > rule.size_max) return false
  return true
}

/** The rule hits for a configuration, in rule order. */
export function ruleHits(config: Configuration, rules: readonly FeasibilityRule[] = FEASIBILITY_RULES): RuleHit[] {
  const hits: RuleHit[] = []
  for (const rule of rules) {
    if (!ruleApplies(rule, config)) continue
    const tooLong = rule.max_length_mm !== null && config.length_mm > rule.max_length_mm
    const tooFew = rule.min_quantity !== null && config.quantity < rule.min_quantity
    if (rule.not_offered || tooLong || tooFew) {
      hits.push({ rule_id: rule.id, note: rule.note })
    }
  }
  return hits
}

/**
 * Pre-check for a line. `referenceCount` is the number of history rows with the same
 * family, size and material (spec 2.5). Zero means a new configuration.
 */
export function preCheck(config: Configuration, referenceCount: number, rules: readonly FeasibilityRule[] = FEASIBILITY_RULES): PreCheckResult {
  const hits = ruleHits(config, rules)
  const new_configuration = referenceCount === 0
  return { hits, new_configuration, needs_check: hits.length > 0 || new_configuration }
}
