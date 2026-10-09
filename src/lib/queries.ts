// TanStack Query hooks over the repository and the read-side services.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { computeReadiness } from '@/domain/readiness'
import type { CheckStatus, Configuration } from '@/domain/types'
import { configurationInsight } from '@/services/references'
import { repo } from './repo'
import { useServices } from './services'
import { backend } from '@/lib/backend'

export const keys = {
  customers: ['customers'] as const,
  requests: ['requests'] as const,
  request: (id: string) => ['request', id] as const,
  events: (id: string) => ['events', id] as const,
  quotationLines: (id: string) => ['quotation-lines', id] as const,
  responses: (id: string) => ['responses', id] as const,
  order: (id: string) => ['order', id] as const,
  queue: (status: CheckStatus[]) => ['queue', ...status] as const,
  check: (id: string) => ['check', id] as const,
  insight: (config: Configuration, customer: string, requestRef = '') => ['insight', customer, requestRef, config.family, config.size, config.material, config.length_mm, config.quantity] as const,
}

export function useCustomers() {
  return useQuery({ queryKey: keys.customers, queryFn: () => repo.listCustomers(), enabled: backend.ready, staleTime: 60_000 })
}

export function useRequestSummaries() {
  return useQuery({ queryKey: keys.requests, queryFn: () => repo.listRequestSummaries(), enabled: backend.ready })
}

export function useRequestAggregate(id: string) {
  const ctx = useServices()
  return useQuery({
    queryKey: keys.request(id),
    enabled: backend.ready && id !== '',
    queryFn: async () => {
      const request = await repo.getRequest(id)
      if (!request) return null
      const [lines, quotations, customer, order] = await Promise.all([
        repo.listLines(id),
        repo.listQuotations(id),
        repo.getCustomer(request.customer_id),
        request.order_id ? repo.getOrder(request.order_id) : Promise.resolve(null),
      ])
      return { request, lines, quotations, customer, order, readiness: computeReadiness(lines, quotations, ctx.today()) }
    },
  })
}

export type RequestAggregateData = NonNullable<ReturnType<typeof useRequestAggregate>['data']>

export function useEvents(request_id: string) {
  return useQuery({ queryKey: keys.events(request_id), queryFn: () => repo.listEvents(request_id), enabled: backend.ready })
}

export function useQuotationLines(quotation_id: string | null) {
  return useQuery({
    queryKey: keys.quotationLines(quotation_id ?? ''),
    queryFn: () => repo.listQuotationLines(quotation_id as string),
    enabled: backend.ready && quotation_id !== null,
  })
}

export function useResponses(quotation_id: string | null) {
  return useQuery({
    queryKey: keys.responses(quotation_id ?? ''),
    queryFn: () => repo.listResponses(quotation_id as string),
    enabled: backend.ready && quotation_id !== null,
  })
}

export function useCheckQueue(status: CheckStatus[]) {
  return useQuery({ queryKey: keys.queue(status), queryFn: () => repo.listCheckQueue(status), enabled: backend.ready })
}

export function useCheck(id: string) {
  return useQuery({ queryKey: keys.check(id), queryFn: () => repo.getCheck(id), enabled: backend.ready })
}

/**
 * References, cost, price suggestion and pre-check for a configuration as the composer edits it.
 * `requestRef` leaves that request's own lines out of the reference pool.
 */
export function useConfigurationInsight(config: Configuration | null, customer: string, requestRef?: string) {
  const ctx = useServices()
  const safe: Configuration = config ?? { family: 'HEA', size: 200, material: 'S355', length_mm: 12000, quantity: 1 }
  return useQuery({
    queryKey: keys.insight(safe, customer, requestRef),
    queryFn: () => configurationInsight(ctx, safe, customer, undefined, requestRef),
    enabled: backend.ready && config !== null && config.quantity > 0 && config.length_mm > 0,
    staleTime: 30_000,
  })
}

/** Invalidates everything that a write to a request can change. */
export function useInvalidateRequest() {
  const qc = useQueryClient()
  return useCallback(
    async (request_id?: string) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.requests }),
        qc.invalidateQueries({ queryKey: ['queue'] }),
        qc.invalidateQueries({ queryKey: ['check'] }),
        qc.invalidateQueries({ queryKey: ['checks'] }),
        qc.invalidateQueries({ queryKey: ['line'] }),
        qc.invalidateQueries({ queryKey: ['quotation-lines'] }),
        qc.invalidateQueries({ queryKey: ['responses'] }),
        qc.invalidateQueries({ queryKey: ['insight'] }),
        request_id ? qc.invalidateQueries({ queryKey: keys.request(request_id) }) : Promise.resolve(),
        request_id ? qc.invalidateQueries({ queryKey: keys.events(request_id) }) : Promise.resolve(),
      ])
    },
    [qc],
  )
}
