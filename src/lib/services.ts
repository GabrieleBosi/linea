import { useMemo } from 'react'
import { PERSONAS } from '@/scenarios/types'
import { createContext, type ServiceContext } from '@/services/context'
import { appClock } from './clock'
import { repo } from './repo'
import { useSession } from './session'

/** A service context bound to the app repository, the app clock and the persona of the selected role. */
export function useServices(): ServiceContext {
  const { role } = useSession()
  return useMemo(() => createContext(repo, PERSONAS[role], appClock), [role])
}
