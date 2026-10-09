import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { IllegalTransition } from '@/domain/applyEvent'
import { ServiceError } from '@/services/context'
import { useInvalidateRequest } from './queries'

/** What happened and what to do next, from any error the services throw. */
export function errorMessage(e: unknown): string {
  if (e instanceof ServiceError) return e.next ? `${e.message} ${e.next}` : e.message
  if (e instanceof IllegalTransition) return `This change is not allowed: ${e.message}`
  if (e instanceof Error) return e.message
  return String(e)
}

/** Runs a service call, refreshes the queries of the request, and reports the result as a toast. */
export function useAction(request_id?: string) {
  const invalidate = useInvalidateRequest()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      setBusy(true)
      setError(null)
      try {
        const result = await fn()
        await invalidate(request_id)
        if (success) toast.success(success)
        return result
      } catch (e) {
        const message = errorMessage(e)
        setError(message)
        toast.error(message)
        return undefined
      } finally {
        setBusy(false)
      }
    },
    [invalidate, request_id],
  )

  return { run, busy, error, clearError: () => setError(null) }
}
