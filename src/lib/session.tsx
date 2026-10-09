import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { isStaticBuild } from './mode'

export type Role = 'sales' | 'ops'

export const PERSONAS: Record<Role, { name: string; label: string }> = {
  sales: { name: 'Marta Keller', label: 'Sales' },
  ops: { name: 'Jonas Weber', label: 'Operations' },
}

type Session = {
  role: Role
  setRole: (role: Role) => void
  replay: boolean
  setReplay: (on: boolean) => void
}

const SessionContext = createContext<Session | null>(null)

const ROLE_KEY = 'linea.role'
const REPLAY_KEY = 'linea.replay'

function readRole(): Role {
  try {
    const v = localStorage.getItem(ROLE_KEY)
    return v === 'ops' ? 'ops' : 'sales'
  } catch {
    return 'sales'
  }
}

function readReplay(): boolean {
  // The static demo only replays: it has no model to call.
  if (isStaticBuild) return true
  try {
    return localStorage.getItem(REPLAY_KEY) === 'on'
  } catch {
    return false
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(readRole)
  const [replay, setReplayState] = useState<boolean>(readReplay)

  const setRole = useCallback((r: Role) => {
    setRoleState(r)
    try {
      localStorage.setItem(ROLE_KEY, r)
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
  }, [])

  const setReplay = useCallback((on: boolean) => {
    if (isStaticBuild) return
    setReplayState(on)
    try {
      localStorage.setItem(REPLAY_KEY, on ? 'on' : 'off')
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
  }, [])

  const value = useMemo(() => ({ role, setRole, replay, setReplay }), [role, setRole, replay, setReplay])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  const ctx = useContext(SessionContext)
  if (!ctx) {
    throw new Error('useSession must be used inside SessionProvider.')
  }
  return ctx
}
