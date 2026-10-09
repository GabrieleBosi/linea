// Demo reset from the browser. Spec 6.9: the token is asked once and kept in session storage.
// The static demo needs no token.

import { backend } from '@/lib/backend'
import type { ResetResult } from './backendTypes'

const TOKEN_KEY = 'linea.demoResetToken'

export function getDemoToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setDemoToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* session storage unavailable: the token lasts for this call only */
  }
}

export type { ResetResult } from './backendTypes'

/** Full stack: deletes the transactional rows with the token. Static demo: clears this tab's data. */
export function resetDemo(token: string): Promise<ResetResult> {
  return backend.resetDemo(token)
}

/** The step players keep their runs under linea.player.<id>. A reset empties the data, so every saved run goes too. */
export function clearPlayerRuns(): void {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('linea.player.')) sessionStorage.removeItem(key)
    }
  } catch {
    /* session storage unavailable: nothing was saved */
  }
}
