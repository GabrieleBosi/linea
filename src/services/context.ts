// Shared service context and helpers. Services are the only writers of state, and they
// write status columns only through applyEvent() results.

import { costEstimate } from '@/domain/costModel'
import { preCheck, type PreCheckResult } from '@/domain/preCheck'
import { buildReferencePool, poolExcludingRequest, referenceCount, type ReferenceRow } from '@/domain/references'
import type { Actor, Configuration, FeasibilityRule, Line, Quotation, Request } from '@/domain/types'
import type { Repo } from '@/repo/Repo'

export type Clock = {
  /** ISO date, YYYY-MM-DD. */
  today: () => string
  /** ISO timestamp. */
  now: () => string
}

export type ServiceContext = Clock & {
  repo: Repo
  actor: Actor
}

export const realClock: Clock = {
  today: () => new Date().toISOString().slice(0, 10),
  now: () => new Date().toISOString(),
}

/**
 * A clock that stays on one day. The time of day is the real one, so events keep their order
 * within a session. Used by the static demo build.
 */
export function fixedDateClock(isoDate: string): Clock {
  return {
    today: () => isoDate,
    now: () => `${isoDate}T${new Date().toISOString().slice(11)}`,
  }
}

export function createContext(repo: Repo, actor: Actor, clock: Clock = realClock): ServiceContext {
  return { repo, actor, today: clock.today, now: clock.now }
}

/** An error the UI shows as it is: what happened and what to do next. */
export class ServiceError extends Error {
  readonly next: string

  constructor(message: string, next = '') {
    super(message)
    this.name = 'ServiceError'
    this.next = next
  }
}

export async function loadReferencePool(repo: Repo): Promise<ReferenceRow[]> {
  const [legacy, sent] = await Promise.all([repo.listLegacyQuotes(), repo.listSentQuotationLines()])
  return buildReferencePool(legacy, sent)
}

export async function mustGetRequest(ctx: ServiceContext, id: string): Promise<Request> {
  const r = await ctx.repo.getRequest(id)
  if (!r) throw new ServiceError('This request does not exist.', 'Go back to the requests list.')
  return r
}

export async function mustGetLine(ctx: ServiceContext, id: string): Promise<Line> {
  const l = await ctx.repo.getLine(id)
  if (!l) throw new ServiceError('This line does not exist.', 'Reload the request.')
  return l
}

export async function mustGetQuotation(ctx: ServiceContext, id: string): Promise<Quotation> {
  const q = await ctx.repo.getQuotation(id)
  if (!q) throw new ServiceError('This revision does not exist.', 'Reload the request.')
  return q
}

export function assertRequestOpen(request: Request): void {
  if (request.status !== 'open') {
    throw new ServiceError(`Request ${request.ref} is ${request.status.replace('_', ' ')}.`, 'Reopen it before you change its lines.')
  }
}

/** Cost estimate for a configuration on a date. Null when the configuration is unknown. */
export function estimateCost(config: Configuration, isoDate: string): number | null {
  return costEstimate(config, isoDate)
}

/**
 * The pre-check as the composer shows it: with `requestRef`, the lines of that request do not count
 * as history, so "new configuration" means the same on screen and at save time.
 */
export async function runPreCheck(ctx: ServiceContext, config: Configuration, pool?: ReferenceRow[], rules?: FeasibilityRule[], requestRef?: string): Promise<PreCheckResult> {
  const p = poolExcludingRequest(pool ?? (await loadReferencePool(ctx.repo)), requestRef)
  const r = rules ?? (await ctx.repo.listRules())
  return preCheck(config, referenceCount(config, p), r)
}

/** The lines a draft revision includes: open and not agreed. Spec 2.4. */
export function revisionLines(lines: readonly Line[]): Line[] {
  return lines.filter((l) => l.commercial_status !== 'declined' && l.commercial_status !== 'withdrawn' && l.commercial_status !== 'superseded' && l.commercial_status !== 'agreed')
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate.slice(0, 10) + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
